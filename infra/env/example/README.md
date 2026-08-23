# 환경 파일 예제

이 디렉터리는 `infra/env`에서 사용하는 파일 구조를 비밀값 없이 보여줍니다.

## 적용 위치

다음 파일을 같은 상대 경로로 복사한 뒤 `CHANGE_ME` 값을 변경합니다.

```text
example/infra/ports.env.example  -> infra/ports.env
example/infra/db.env.example     -> infra/db.env
example/dev/common.env.example   -> dev/common.env
example/dev/web.env.example      -> dev/web.env
example/dev/spring.env.example   -> dev/spring.env
example/dev/sharedb.env.example  -> dev/sharedb.env
example/dev/flyway.env.example   -> dev/flyway.env
example/prod/common.env.example  -> prod/common.env
example/prod/web.env.example     -> prod/web.env
example/prod/spring.env.example  -> prod/spring.env
example/prod/sharedb.env.example -> prod/sharedb.env
example/prod/flyway.env.example  -> prod/flyway.env
```

# 2026-08-19: `infra/ports.env`는 Nginx 운영/개발 호스트와 인증서 이름, WebServer, ShareDB, React의 Docker 내부 포트를 한 번에 관리합니다.
서비스별 환경 파일에는 `PORT`를 중복해서 두지 않으며, 애플리케이션 컨테이너 포트는 호스트에 게시하지 않습니다.

실제 `dev`, `prod`, `infra`, `keys` 파일은 커밋하지 않습니다.

## 데이터베이스

예제는 개발과 운영에서 서로 다른 `ucms_dev`, `ucms_prod` 스키마와 계정을 사용합니다. MySQL 공식 이미지의 `MYSQL_DATABASE`와 `MYSQL_USER`는 최초 실행 시 한 세트만 생성하므로, 운영 스키마와 운영 계정은 별도 초기화 SQL 또는 마이그레이션 관리 도구로 생성하고 권한을 분리해야 합니다.

2026-08-20: `flyway.env`는 one-shot Flyway 컨테이너 전용입니다. 애플리케이션 계정과 분리된 마이그레이션 계정을 사용하고, 실제 파일은 커밋하지 않습니다. 기존 0.0.1 운영 DB를 Flyway에 최초 등록할 때만 `FLYWAY_BASELINE_ON_MIGRATE=true`로 바꾸고, 적용 직후 반드시 `false`로 되돌립니다.

## UCMS 이메일 인증

2026-08-23부터 인증번호 상태는 기존 WebServer가 관리하고 메일 발송은 Spring Boot의 Gmail SMTP 서비스가 담당한다. `web.env`에는 `EMAIL_VERIFICATION_ENABLED`, `EMAIL_CODE_SECRET`, `SPRING_MAIL_BASE_URL`, `UCMS_INTERNAL_MAIL_TOKEN`을 두고, `spring.env`에는 `GMAIL_USERNAME`, `GMAIL_APP_PASSWORD`만 둔다. 내부 토큰은 dev/prod마다 다른 32바이트 이상의 난수로 만들고 두 서비스가 같은 값을 사용해야 한다. 인증번호는 6자리 숫자, 유효시간 5분, 입력 최대 5회이며 같은 사용자·목적의 발송은 15분에 5회로 제한한다. 현재 dev 우회를 유지하려면 `EMAIL_VERIFICATION_ENABLED=false`, 실제 SMTP 인증을 시험하려면 `true`로 둔다.

개인 Gmail에서 2단계 인증을 먼저 활성화한 뒤 Google 계정의 앱 비밀번호 메뉴에서 메일용 16자리 앱 비밀번호를 만든다. 화면에 표시되는 공백은 제거해 `GMAIL_APP_PASSWORD`에 저장하고 일반 Google 비밀번호는 사용하지 않는다. 실제 `spring.env`는 Git에 커밋하지 않는다.

## Google 인증 파일

Google 관련 JSON은 환경변수 파일이 아닙니다. 발급받은 다음 파일을 `infra/env/keys/google`에 직접 배치합니다.

```text
oauth_credentials.json
token.json
서비스 계정 JSON
```

`token.json`은 Google 계정 승인 절차에서 생성합니다. 이 OAuth 연결은 Form 관리용 Drive/Forms 권한에만 사용하며 메일 발송에는 사용하지 않습니다. 예제 JSON이나 실제 인증정보를 저장소에 커밋하지 않습니다.

## 값 작성 시 주의사항

- `SESSION_SECRET`은 개발과 운영에서 서로 다른 충분히 긴 난수로 설정합니다.
- `DOMAIN`은 프로토콜을 포함하고 마지막 `/`는 제외합니다.
- `HOLIDAY_API_KEY`는 공공데이터포털에서 제공한 URL 인코딩 값을 사용합니다.
- 개발 계정은 운영 DB에, 운영 계정은 개발 DB에 접근 권한을 부여하지 않습니다.
