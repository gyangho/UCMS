# 환경 파일 예제

이 디렉터리는 `infra/env`에서 사용하는 파일 구조를 비밀값 없이 보여줍니다.

## 적용 위치

다음 파일을 같은 상대 경로로 복사한 뒤 `CHANGE_ME` 값을 변경합니다.

```text
example/ports.env.example -> ../ports.env
example/dev/common.env    -> dev/common.env
example/dev/web.env       -> dev/web.env
example/dev/sharedb.env   -> dev/sharedb.env
example/prod/common.env   -> prod/common.env
example/prod/web.env      -> prod/web.env
example/prod/sharedb.env  -> prod/sharedb.env
example/infra/db.env      -> infra/db.env
```

# 2026-07-24: `ports.env`는 WebServer, ShareDB, React의 Docker 내부 포트를 한 번에 관리합니다.
서비스별 환경 파일에는 `PORT`를 중복해서 두지 않으며, 애플리케이션 컨테이너 포트는 호스트에 게시하지 않습니다.

실제 `dev`, `prod`, `infra`, `keys` 파일은 커밋하지 않습니다.

## 데이터베이스

예제는 개발과 운영에서 서로 다른 `ucms_dev`, `ucms_prod` 스키마와 계정을 사용합니다. MySQL 공식 이미지의 `MYSQL_DATABASE`와 `MYSQL_USER`는 최초 실행 시 한 세트만 생성하므로, 운영 스키마와 운영 계정은 별도 초기화 SQL 또는 마이그레이션 관리 도구로 생성하고 권한을 분리해야 합니다.

## Google 인증 파일

Google 관련 JSON은 환경변수 파일이 아닙니다. 발급받은 다음 파일을 `infra/env/keys/google`에 직접 배치합니다.

```text
oauth_credentials.json
token.json
서비스 계정 JSON
```

`token.json`은 Google 계정 승인 절차에서 생성합니다. 예제 JSON이나 실제 인증정보를 저장소에 커밋하지 않습니다.

## 값 작성 시 주의사항

- `SESSION_SECRET`은 개발과 운영에서 서로 다른 충분히 긴 난수로 설정합니다.
- `DOMAIN`은 프로토콜을 포함하고 마지막 `/`는 제외합니다.
- `HOLIDAY_API_KEY`는 공공데이터포털에서 제공한 URL 인코딩 값을 사용합니다.
- 개발 계정은 운영 DB에, 운영 계정은 개발 DB에 접근 권한을 부여하지 않습니다.
