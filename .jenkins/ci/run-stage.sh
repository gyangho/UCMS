#!/bin/sh
set -eu

# 2026-08-22: Keep UCMS PR CI reproducible with BuildKit and versioned containers without deployment credentials.
NODE_IMAGE="${NODE_IMAGE:-node:24-slim}"
JAVA_IMAGE="${JAVA_IMAGE:-eclipse-temurin:26-jdk}"
MYSQL_IMAGE="${MYSQL_IMAGE:-mysql:8}"
FLYWAY_IMAGE="${FLYWAY_IMAGE:-flyway/flyway:13.3.0}"
WORKSPACE="${WORKSPACE:-$(pwd)}"
BUILD_NUMBER="${BUILD_NUMBER:-manual}"

if [ -z "$WORKSPACE" ] || [ "$WORKSPACE" = / ]; then
  echo "Refusing to use an unsafe CI workspace path." >&2
  exit 2
fi

ci_cache_dir="$WORKSPACE/.cache/jenkins-ci"

case "$BUILD_NUMBER" in
  *[!A-Za-z0-9_.-]*)
    echo "BUILD_NUMBER contains unsupported characters." >&2
    exit 2
    ;;
esac

ci_network="ucms-ci-${BUILD_NUMBER}"
ci_mysql="ucms-ci-mysql-${BUILD_NUMBER}"
ci_password='ucms-ci-only-password'

run_guard() {
  sensitive_paths="$(git ls-files | grep -E '(^|/)(keys|certbot|dbbkp|logs|inputs|outputs)(/|$)|(^|/)\.env($|\.)|\.(pem|key)$' || true)"
  if [ -n "$sensitive_paths" ]; then
    echo 'Tracked sensitive or runtime-only paths were found:' >&2
    printf '%s\n' "$sensitive_paths" >&2
    exit 1
  fi
}

run_react() {
  react_modules="$ci_cache_dir/react-node_modules"
  rm -rf "$react_modules"
  mkdir -p "$react_modules"
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    -e HOME=/tmp \
    -v "$WORKSPACE/dev/UCMS_React:/workspace" \
    -v "$react_modules:/workspace/node_modules" \
    -w /workspace \
    "$NODE_IMAGE" \
    sh -lc 'npm ci --cache /tmp/npm-cache && npm audit --audit-level=high && npm run lint && npm run build'
  rm -rf "$react_modules"
}

run_node() {
  for service in UCMS_WebServer UCMS_ShareDB; do
    service_modules="$ci_cache_dir/${service}-node_modules"
    rm -rf "$service_modules"
    mkdir -p "$service_modules"
    docker run --rm \
      --user "$(id -u):$(id -g)" \
      -e HOME=/tmp \
      -v "$WORKSPACE/dev/$service:/workspace" \
      -v "$service_modules:/workspace/node_modules" \
      -w /workspace \
      "$NODE_IMAGE" \
      sh -lc 'npm ci --cache /tmp/npm-cache && npm audit --audit-level=high && find . -path ./node_modules -prune -o -type f -name "*.js" -print0 | xargs -0 -r -n1 node --check'
    rm -rf "$service_modules"
  done
}

run_spring() {
  docker rm -f "$ci_mysql" >/dev/null 2>&1 || true
  docker network rm "$ci_network" >/dev/null 2>&1 || true
  docker network create "$ci_network"
  docker run -d \
    --name "$ci_mysql" \
    --network "$ci_network" \
    -e MYSQL_ROOT_PASSWORD="$ci_password" \
    -e MYSQL_DATABASE=ucms_ci \
    "$MYSQL_IMAGE"

  ready=false
  for attempt in $(seq 1 60); do
    if docker exec "$ci_mysql" mysqladmin ping -uroot -p"$ci_password" --silent; then
      ready=true
      break
    fi
    sleep 2
  done
  [ "$ready" = true ]

  migration_dir="$WORKSPACE/dev/UCMS_Spring/ucms/src/main/resources/db/migration"
  existing_fixture="$WORKSPACE/infra/scripts/fixtures/flyway-existing-schema.mysql"
  flyway_common="jdbc:mysql://${ci_mysql}:3306"

  # 2026-08-22: Verify both a fresh database and first adoption of an existing 0.0.1 schema in every CI run.
  docker run --rm \
    --network "$ci_network" \
    -v "$migration_dir:/flyway/sql:ro" \
    -e "FLYWAY_URL=${flyway_common}/ucms_ci?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Seoul&allowPublicKeyRetrieval=true" \
    -e FLYWAY_USER=root \
    -e FLYWAY_PASSWORD="$ci_password" \
    -e FLYWAY_LOCATIONS=filesystem:/flyway/sql \
    -e FLYWAY_VALIDATE_MIGRATION_NAMING=true \
    -e FLYWAY_CONNECT_RETRIES=30 \
    "$FLYWAY_IMAGE" migrate
  docker run --rm \
    --network "$ci_network" \
    -v "$migration_dir:/flyway/sql:ro" \
    -e "FLYWAY_URL=${flyway_common}/ucms_ci?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Seoul&allowPublicKeyRetrieval=true" \
    -e FLYWAY_USER=root \
    -e FLYWAY_PASSWORD="$ci_password" \
    -e FLYWAY_LOCATIONS=filesystem:/flyway/sql \
    -e FLYWAY_VALIDATE_MIGRATION_NAMING=true \
    "$FLYWAY_IMAGE" validate
  docker run --rm \
    --network "$ci_network" \
    -v "$migration_dir:/flyway/sql:ro" \
    -e "FLYWAY_URL=${flyway_common}/ucms_ci?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Seoul&allowPublicKeyRetrieval=true" \
    -e FLYWAY_USER=root \
    -e FLYWAY_PASSWORD="$ci_password" \
    -e FLYWAY_LOCATIONS=filesystem:/flyway/sql \
    "$FLYWAY_IMAGE" migrate

  fresh_history="$(docker exec "$ci_mysql" mysql -uroot -p"$ci_password" -Ducms_ci --batch --skip-column-names --execute="SELECT COUNT(*), SUM(success) FROM flyway_schema_history WHERE version IN ('0.0.1', '0.1.1');")"
  [ "$fresh_history" = "$(printf '2\t2')" ]

  docker exec "$ci_mysql" mysql -uroot -p"$ci_password" --execute="CREATE DATABASE ucms_existing_ci CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
  docker cp "$migration_dir/V0_0_1__baseline.sql" "$ci_mysql:/tmp/ucms-baseline.sql"
  docker cp "$existing_fixture" "$ci_mysql:/tmp/flyway-existing-schema.mysql"
  docker exec "$ci_mysql" mysql -uroot -p"$ci_password" -Ducms_existing_ci --execute="source /tmp/ucms-baseline.sql"
  docker exec "$ci_mysql" mysql -uroot -p"$ci_password" -Ducms_existing_ci --execute="source /tmp/flyway-existing-schema.mysql"

  docker run --rm \
    --network "$ci_network" \
    -v "$migration_dir:/flyway/sql:ro" \
    -e "FLYWAY_URL=${flyway_common}/ucms_existing_ci?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Seoul&allowPublicKeyRetrieval=true" \
    -e FLYWAY_USER=root \
    -e FLYWAY_PASSWORD="$ci_password" \
    -e FLYWAY_LOCATIONS=filesystem:/flyway/sql \
    -e FLYWAY_VALIDATE_MIGRATION_NAMING=true \
    -e FLYWAY_BASELINE_VERSION=0.0.1 \
    -e FLYWAY_BASELINE_ON_MIGRATE=true \
    -e FLYWAY_CONNECT_RETRIES=30 \
    "$FLYWAY_IMAGE" migrate
  docker run --rm \
    --network "$ci_network" \
    -v "$migration_dir:/flyway/sql:ro" \
    -e "FLYWAY_URL=${flyway_common}/ucms_existing_ci?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Seoul&allowPublicKeyRetrieval=true" \
    -e FLYWAY_USER=root \
    -e FLYWAY_PASSWORD="$ci_password" \
    -e FLYWAY_LOCATIONS=filesystem:/flyway/sql \
    -e FLYWAY_VALIDATE_MIGRATION_NAMING=true \
    "$FLYWAY_IMAGE" validate

  existing_history="$(docker exec "$ci_mysql" mysql -uroot -p"$ci_password" -Ducms_existing_ci --batch --skip-column-names --execute="SELECT COUNT(*), SUM(success), SUM(type = 'BASELINE') FROM flyway_schema_history WHERE version IN ('0.0.1', '0.1.1');")"
  [ "$existing_history" = "$(printf '2\t2\t1')" ]
  relink_state="$(docker exec "$ci_mysql" mysql -uroot -p"$ci_password" -Ducms_existing_ci --batch --skip-column-names --execute="SELECT u.id, u.kakao_id IS NULL, u.status, m.user_id, (SELECT COUNT(*) FROM event_participants WHERE event_id = 700001 AND user_id = 700001), (SELECT author_id FROM events WHERE id = 700001), (SELECT COUNT(*) FROM sessions), (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('pending_auth', 'group_chat_rooms')), (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'chat_room_id') FROM users u JOIN members m ON m.user_id = u.id WHERE u.id = 700001 AND m.student_id = '9999970001';")"
  [ "$relink_state" = "$(printf '700001\t1\tpending_relink\t700001\t1\t700001\t0\t0\t0')" ]

  docker run --rm \
    --network "$ci_network" \
    --user "$(id -u):$(id -g)" \
    -e HOME=/tmp \
    -e GRADLE_USER_HOME=/tmp/gradle \
    -e DB_HOST="$ci_mysql" \
    -e DB_PORT=3306 \
    -e DB_NAME=ucms_ci \
    -e DB_USER=root \
    -e DB_PASSWORD="$ci_password" \
    -e FLYWAY_BASELINE_ON_MIGRATE=false \
    -v "$WORKSPACE/dev/UCMS_Spring/ucms:/workspace" \
    -w /workspace \
    "$JAVA_IMAGE" \
    sh ./gradlew --no-daemon test
}

run_images() {
  DOCKER_BUILDKIT=1 docker build --target prod -t "ucms-ci-web:${BUILD_NUMBER}" "$WORKSPACE/dev/UCMS_WebServer"
  DOCKER_BUILDKIT=1 docker build --target prod -t "ucms-ci-sharedb:${BUILD_NUMBER}" "$WORKSPACE/dev/UCMS_ShareDB"
  DOCKER_BUILDKIT=1 docker build --target prod -t "ucms-ci-react:${BUILD_NUMBER}" "$WORKSPACE/dev/UCMS_React"
  # 2026-08-23: New backend capabilities ship from Spring and must have a reproducible production image.
  DOCKER_BUILDKIT=1 docker build --target prod -t "ucms-ci-spring:${BUILD_NUMBER}" "$WORKSPACE/dev/UCMS_Spring/ucms"
  docker compose -f "$WORKSPACE/infra/docker-compose.jenkins.yml" config --quiet
}

run_cleanup() {
  rm -rf "$ci_cache_dir"
  docker rm -f "$ci_mysql" >/dev/null 2>&1 || true
  docker network rm "$ci_network" >/dev/null 2>&1 || true
  docker image rm \
    "ucms-ci-web:${BUILD_NUMBER}" \
    "ucms-ci-sharedb:${BUILD_NUMBER}" \
    "ucms-ci-react:${BUILD_NUMBER}" \
    "ucms-ci-spring:${BUILD_NUMBER}" \
    >/dev/null 2>&1 || true
}

# 2026-08-22: Clean build-scoped resources even when a standalone stage fails or receives a termination signal.
on_exit() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ "$status" -ne 0 ]; then
    run_cleanup
  fi
  exit "$status"
}

on_signal() {
  trap - EXIT HUP INT TERM
  run_cleanup
  exit 130
}

trap on_exit EXIT
trap on_signal HUP INT TERM

case "${1:-}" in
  guard) run_guard ;;
  react) run_react ;;
  node) run_node ;;
  spring) run_spring ;;
  images) run_images ;;
  cleanup) run_cleanup ;;
  *)
    echo "Usage: $0 {guard|react|node|spring|images|cleanup}" >&2
    exit 2
    ;;
esac
