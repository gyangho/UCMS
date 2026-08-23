[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# 2026-08-20: Exercise migrations and both application DB clients in a disposable network and tmpfs-backed MySQL.
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$migrationPath = Join-Path $repoRoot "dev/UCMS_Spring/ucms/src/main/resources/db/migration"
$webPath = Join-Path $repoRoot "dev/UCMS_WebServer"
$springPath = Join-Path $repoRoot "dev/UCMS_Spring/ucms"
$suffix = [Guid]::NewGuid().ToString("N").Substring(0, 12)
$networkName = "ucms-migration-test-$suffix"
$mysqlName = "ucms-migration-mysql-$suffix"
$nodeImage = "ucms-node-schema-smoke:$suffix"
$databaseName = "ucms_migration_test"
$existingDatabaseName = "ucms_existing_test"
$databaseUser = "ucms_migrator"
$databasePassword = [Guid]::NewGuid().ToString("N")
$rootPassword = [Guid]::NewGuid().ToString("N")
$migrationMount = "${migrationPath}:/flyway/sql:ro"
$baselinePath = Join-Path $migrationPath "V0_0_1__baseline.sql"
$existingFixturePath = Join-Path $PSScriptRoot "fixtures/flyway-existing-schema.mysql"
$springMount = "${springPath}:/workspace"
$networkCreated = $false
$mysqlCreated = $false
$nodeImageBuilt = $false

function Invoke-Docker {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Docker command failed with exit code $LASTEXITCODE."
  }
}

try {
  Invoke-Docker @("network", "create", $networkName)
  $networkCreated = $true
  Invoke-Docker @(
    "run", "--detach", "--name", $mysqlName,
    "--network", $networkName,
    "--tmpfs", "/var/lib/mysql:rw,noexec,nosuid,size=1g",
    "--env", "MYSQL_DATABASE=$databaseName",
    "--env", "MYSQL_USER=$databaseUser",
    "--env", "MYSQL_PASSWORD=$databasePassword",
    "--env", "MYSQL_ROOT_PASSWORD=$rootPassword",
    "--health-cmd", "mysqladmin ping --protocol=tcp -h 127.0.0.1 -uroot -p$rootPassword --silent",
    "--health-interval", "2s", "--health-timeout", "3s", "--health-retries", "45",
    "mysql:8.4"
  )
  $mysqlCreated = $true

  $healthy = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $health = & docker inspect --format "{{.State.Health.Status}}" $mysqlName 2>$null
    if ($health -eq "healthy") {
      $healthy = $true
      break
    }
    if ($health -eq "unhealthy") {
      throw "Disposable MySQL became unhealthy."
    }
    Start-Sleep -Seconds 2
  }
  if (-not $healthy) {
    throw "Timed out waiting for disposable MySQL."
  }

  $flywayArgs = @(
    "run", "--rm", "--network", $networkName,
    "--volume", $migrationMount,
    "--env", "FLYWAY_URL=jdbc:mysql://${mysqlName}:3306/${databaseName}?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Seoul&allowPublicKeyRetrieval=true",
    "--env", "FLYWAY_USER=$databaseUser",
    "--env", "FLYWAY_PASSWORD=$databasePassword",
    "--env", "FLYWAY_LOCATIONS=filesystem:/flyway/sql",
    "--env", "FLYWAY_VALIDATE_MIGRATION_NAMING=true",
    "--env", "FLYWAY_CONNECT_RETRIES=30",
    "flyway/flyway:13.3.0"
  )
  Invoke-Docker ($flywayArgs + "migrate")
  Invoke-Docker ($flywayArgs + "validate")
  Invoke-Docker ($flywayArgs + "migrate")

  $historyResult = & docker @(
    "exec", $mysqlName,
    "mysql", "--user=$databaseUser", "--password=$databasePassword", "--database=$databaseName",
    "--batch", "--skip-column-names",
    "--execute=SELECT COUNT(*), SUM(success) FROM flyway_schema_history WHERE version IN ('0.0.1', '0.1.1');"
  )
  if ($LASTEXITCODE -ne 0 -or $historyResult.Trim() -ne "2`t2") {
    throw "Flyway history does not contain successful 0.0.1 and 0.1.1 rows."
  }
  Write-Host "Flyway history OK"

  # 2026-08-20: Reproduce the production adoption path: non-empty 0.0.1 schema with no Flyway history.
  Invoke-Docker @(
    "exec", $mysqlName,
    "mysql", "--user=root", "--password=$rootPassword",
    "--execute=CREATE DATABASE $existingDatabaseName CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; GRANT ALL PRIVILEGES ON ${existingDatabaseName}.* TO '$databaseUser'@'%'; FLUSH PRIVILEGES;"
  )
  Invoke-Docker @("cp", $baselinePath, "${mysqlName}:/tmp/ucms-baseline.sql")
  Invoke-Docker @(
    "exec", $mysqlName,
    "mysql", "--user=$databaseUser", "--password=$databasePassword", "--database=$existingDatabaseName",
    "--execute=source /tmp/ucms-baseline.sql"
  )
  # 2026-08-20: Seed synthetic references to prove that relinking preserves users.id, authorship, and participation.
  Invoke-Docker @("cp", $existingFixturePath, "${mysqlName}:/tmp/flyway-existing-schema.mysql")
  Invoke-Docker @(
    "exec", $mysqlName,
    "mysql", "--user=$databaseUser", "--password=$databasePassword", "--database=$existingDatabaseName",
    "--execute=source /tmp/flyway-existing-schema.mysql"
  )

  $existingFlywayArgs = @(
    "run", "--rm", "--network", $networkName,
    "--volume", $migrationMount,
    "--env", "FLYWAY_URL=jdbc:mysql://${mysqlName}:3306/${existingDatabaseName}?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Seoul&allowPublicKeyRetrieval=true",
    "--env", "FLYWAY_USER=$databaseUser",
    "--env", "FLYWAY_PASSWORD=$databasePassword",
    "--env", "FLYWAY_LOCATIONS=filesystem:/flyway/sql",
    "--env", "FLYWAY_VALIDATE_MIGRATION_NAMING=true",
    "--env", "FLYWAY_CONNECT_RETRIES=30",
    "--env", "FLYWAY_BASELINE_VERSION=0.0.1",
    "--env", "FLYWAY_BASELINE_ON_MIGRATE=true",
    "flyway/flyway:13.3.0"
  )
  Invoke-Docker ($existingFlywayArgs + "migrate")
  Invoke-Docker ($existingFlywayArgs + "validate")
  $existingHistory = & docker @(
    "exec", $mysqlName,
    "mysql", "--user=$databaseUser", "--password=$databasePassword", "--database=$existingDatabaseName",
    "--batch", "--skip-column-names",
    "--execute=SELECT COUNT(*), SUM(success), SUM(type = 'BASELINE') FROM flyway_schema_history WHERE version IN ('0.0.1', '0.1.1');"
  )
  if ($LASTEXITCODE -ne 0 -or $existingHistory.Trim() -ne "2`t2`t1") {
    throw "Existing-schema adoption did not record baseline 0.0.1 and apply 0.1.1."
  }
  $relinkMigration = & docker @(
    "exec", $mysqlName,
    "mysql", "--user=$databaseUser", "--password=$databasePassword", "--database=$existingDatabaseName",
    "--batch", "--skip-column-names",
    "--execute=SELECT u.id, u.kakao_id IS NULL, u.status, m.user_id, (SELECT COUNT(*) FROM event_participants WHERE event_id = 700001 AND user_id = 700001), (SELECT author_id FROM events WHERE id = 700001), (SELECT COUNT(*) FROM sessions), (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('pending_auth', 'group_chat_rooms')), (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'chat_room_id') FROM users u JOIN members m ON m.user_id = u.id WHERE u.id = 700001 AND m.student_id = '9999970001';"
  )
  if (
    $LASTEXITCODE -ne 0 -or
    $relinkMigration.Trim() -ne "700001`t1`tpending_relink`t700001`t1`t700001`t0`t0`t0"
  ) {
    throw "User relink migration did not preserve IDs/references or remove legacy authentication storage."
  }
  Write-Host "Existing 0.0.1 schema adoption OK"

  Invoke-Docker @("build", "--target", "dev", "--tag", $nodeImage, $webPath)
  $nodeImageBuilt = $true
  Invoke-Docker @(
    "run", "--rm", "--network", $networkName,
    "--env", "DB_HOST=$mysqlName", "--env", "DB_USER=$databaseUser",
    "--env", "DB_PASSWORD=$databasePassword", "--env", "DB_NAME=$databaseName",
    $nodeImage, "node", "scripts/smokeDatabaseSchema.js"
  )
  Invoke-Docker @(
    "run", "--rm", "--network", $networkName,
    "--env", "DB_HOST=$mysqlName", "--env", "DB_USER=$databaseUser",
    "--env", "DB_PASSWORD=$databasePassword", "--env", "DB_NAME=$databaseName",
    "--env", "MIGRATION_SMOKE_TEST=true",
    $nodeImage, "node", "scripts/smokeEmailAuthentication.js"
  )
  Invoke-Docker @(
    "run", "--rm", "--network", $networkName,
    "--env", "DB_HOST=$mysqlName", "--env", "DB_USER=$databaseUser",
    "--env", "DB_PASSWORD=$databasePassword", "--env", "DB_NAME=$databaseName",
    "--env", "MIGRATION_SMOKE_TEST=true",
    $nodeImage, "node", "scripts/smokeUserImpersonation.js"
  )

  Invoke-Docker @(
    "run", "--rm", "--network", $networkName,
    "--volume", $springMount, "--workdir", "/workspace",
    "--env", "DB_HOST=$mysqlName", "--env", "DB_PORT=3306",
    "--env", "DB_USER=$databaseUser", "--env", "DB_PASSWORD=$databasePassword",
    "--env", "DB_NAME=$databaseName", "--env", "FLYWAY_BASELINE_ON_MIGRATE=false",
    "gradle:9.7.0-jdk26", "./gradlew", "test", "--no-daemon"
  )

  Write-Host "Fresh/existing migrations, stable-ID account transition, impersonation, Node, and Spring smoke all passed."
}
finally {
  # 2026-08-20: Only remove resources that this invocation successfully created, preserving the original failure.
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  if ($mysqlCreated) {
    & docker rm --force $mysqlName 2>$null | Out-Null
  }
  if ($nodeImageBuilt) {
    & docker image rm --force $nodeImage 2>$null | Out-Null
  }
  if ($networkCreated) {
    & docker network rm $networkName 2>$null | Out-Null
  }
  $ErrorActionPreference = $previousErrorActionPreference
}
