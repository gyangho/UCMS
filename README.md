# UCMS

UCMS (University Club Management System) is a club operations platform for managing members, events, recruiting, interviews, settlements, POS sales, and real-time evaluation notes. The current production schema baseline is 0.0.1, and the next planned application/database version is 0.1.1.

The root `VERSION` tracks development application deployments separately from Flyway schema versions. Each dev deployment increments the `0.1.x` patch number with `powershell -ExecutionPolicy Bypass -File infra/scripts/bump-dev-version.ps1`, uses the resulting value in its release record, and commits and pushes the deployed source after verification. The current dev deployment version is `0.1.2`; Flyway remains at the pending production migration `0.1.1` until that database release is finalized.

## Project Structure

```text
dev/
  UCMS_WebServer/        Main Express/EJS web application
  UCMS_ShareDB/          WebSocket collaboration server
  UCMS_Bot/              Bot project
  MySQL/                 Local database-related files
  docker-compose.yml     Development service composition
  initialData.sql        Initial database data
```

The web server follows an MVC-style layout:

- `UCMS_WebServer/main.js`: Express entry point, sessions, routing, and access control
- `UCMS_WebServer/controllers/`: request handlers and business flow
- `UCMS_WebServer/models/`: MySQL access layer
- `UCMS_WebServer/routes/`: page and API route definitions
- `UCMS_WebServer/public/`: EJS views, browser JavaScript, CSS, and images
- `UCMS_WebServer/InterviewScheduler/`: Python OR-Tools interview scheduling engine

## Main Features

- UCMS email/password login, mandatory email 2FA, and MySQL-backed sessions
- Verified email registration with email/name/phone legacy-account claiming while preserving stable user IDs and audit history
- Administrator-controlled session and trusted-device revocation with audit logging
- Member management and authority-based access control
- Event calendar, participation, recruiting period management, and holiday import
- Recruiting form sync, response review, and interview planning
- Automated interview scheduling with OR-Tools
- Finance settlement creation and participant payment tracking
- POS instances, sales entry, and records
- WebSocket-based shared evaluation notes with line locking and version checks

## Development Setup

Create environment files before running services:

```text
dev/UCMS_WebServer/keys/.env.dev
dev/UCMS_ShareDB/keys/.env.dev
```

Required values include database connection settings, session and email-code secrets, Spring's personal Gmail SMTP address/app password, service ports, domain, and external API keys.

Install dependencies when running outside Docker:

```bash
cd dev/UCMS_WebServer
npm install

cd ../UCMS_ShareDB
npm install
```

Run each service locally:

```bash
npm run dev
npm run prod
```

Run the Docker development stack from `dev/`:

```bash
docker compose up --build
```

The compose file expects an external Docker network named `UCMS-network` and a MySQL service reachable as `mysql`.

## Browser UI Verification

The React app includes a Playwright workflow for Codex CLI and local terminal use. It checks both a 1440 x 900 desktop viewport and a Pixel 7 mobile viewport, rejects uncaught page errors and horizontal overflow, and stores full-page screenshots in the ignored `dev/UCMS_React/artifacts/playwright/` directory.

```bash
cd dev/UCMS_React
npm install
npm run browser:install
npm run browser:check
```

The default target is `https://localhost` (the test browser accepts the local Cloudflare origin certificate). Override the target and comma-separated routes only when a remote environment must be checked explicitly:

```bash
UCMS_BASE_URL=http://localhost UCMS_PATHS="/,/recruit" npm run browser:check
```

For authenticated pages, create the local session interactively, complete UCMS email/password and email-code login in the opened Chromium window, and press Enter after the dashboard appears. The session file is local-only and must never be committed.

```bash
npm run browser:session
npm run browser:system-admin
UCMS_USE_AUTH=1 UCMS_PATHS="/,/mypage" npm run browser:check
```

`browser:system-admin` uses the real administrator UI to enter the credential-less `ui-test-admin` account and replaces the saved cookie with the regenerated impersonation session. Return to the authenticated human administrator from the banner before performing identity, OAuth, or other non-test operations.

2026-08-22: Playwright authentication state, screenshots, traces, videos, and HTML reports are intentionally excluded from Git because they may contain credentials or personal data.

## Interview Scheduler

The scheduler lives in `dev/UCMS_WebServer/InterviewScheduler/` and uses Python OR-Tools.

```bash
cd dev/UCMS_WebServer/InterviewScheduler
pip install -r requirements.txt
python main.py 32
```

Input files are read from `inputs/input_<id>.json`, and results are written to `outputs/output_<id>.json`.

## Jenkins CI

The root `Jenkinsfile` runs credential-free checks on the isolated `ucms-ci docker linux` agent. It rejects tracked secret/runtime paths, runs React lint/build, checks both Node services, tests Spring and both Flyway paths against a disposable MySQL container, and builds the three production images with BuildKit. The Flyway stage covers a fresh `0.0.1 -> 0.1.1` database and first adoption of a non-empty 0.0.1 database, including stable user/reference checks. Node and React stages fail on high or critical `npm audit` findings. PR CI does not deploy and receives no production credentials.

The Jenkins controller, inbound WebSocket agent, and isolated Docker-in-Docker daemon are defined in `infra/docker-compose.jenkins.yml`. The inbound-agent secret must exist only on the server at `infra/jenkins/secrets/jenkins-agent-secret`; that directory is ignored by Git and mounted read-only.

```bash
cd /home/gyangho/services/ucms-jenkins
docker compose -p ucms-jenkins build jenkins-agent
docker compose -p ucms-jenkins up -d
docker compose -p ucms-jenkins ps
```

The controller listens only on the server loopback interface. Start a local tunnel when administration is needed, then open `http://localhost:8081`:

```powershell
C:\Windows\System32\OpenSSH\ssh.exe -N -L 127.0.0.1:8081:127.0.0.1:8081 -p 22 gyangho@192.168.0.102
```

## Security Notes

Do not commit `keys/`, `.env.*`, OAuth credentials, database passwords, session secrets, certificate files, or generated runtime data. Keep production secrets outside the repository.

Since 2026-08-22, the legacy student-ID-only recruit-result API returns `410 Gone`; use `POST /api/public/recruit-results/search` with student ID, name, and phone. Direct event detail and participation routes enforce the same visibility boundary as event lists, and ShareDB tickets use normalized semantic authority ranks (`임원진=3`).

`POST /api/public/recruit-responses/search` requires login and ignores client-supplied identity fields. It derives name, normalized phone, and student ID from the verified UCMS account and returns only applications matching all three.

## Flyway Migration Policy

The schema-only `V0_0_1__baseline.sql` contains the immutable 0.0.1 structure without application data. The canonical pending migration is `dev/UCMS_Spring/ucms/src/main/resources/db/migration/V0_1_1__ucms_changes.sql`.

- 2026-08-19: Keep every unapplied change for release 0.1.1 in this single file.
- Before the 0.1.1 production deployment, update this file instead of creating another 0.1.1 migration.
- If the pending file changes after a development or staging database already applied it, restore that database to the 0.0.1 baseline and run 0.1.1 again. Do not use `flyway repair` to pretend newly added DDL has run.
- After 0.1.1 has been applied to production, never edit or rename it; create one new migration file for the next release version.
- The existing production database has no Flyway history. Set `FLYWAY_BASELINE_ON_MIGRATE=true` only for its first Flyway migration so Flyway records baseline 0.0.1 and then applies 0.1.1.
- After the baseline/history table exists, return `FLYWAY_BASELINE_ON_MIGRATE` to `false`.
- 2026-08-22: First adoption also supports the legacy mixed schema where `notice_posts`, `inquiry_posts`, `inquiry_comments`, and the complete POS audit-column block already exist. Verify those objects match the canonical definitions before migration; Flyway preserves them instead of recreating them.
- Back up production and verify the target schema before running migration commands. Never place production data or data dumps in a Flyway migration.

### 0.1.1 native email account transition

The pending 0.1.1 migration adds scrypt password hashes, verified-email timestamps, account student/major fields, hashed email challenges, and revocable trusted-device tokens. Signup asks only for email, password, name, and phone; student ID and major remain member-record attributes. A passwordless legacy member whose email was cleared by migration is claimed by an exact member name and normalized phone match, while an account that already has an email must also match that email. This preserves the stable `users.id` and its member authority; unmatched signups become general accounts. Submitted credentials remain pending until mailbox verification succeeds. Login normally sends a 6-digit, 5-minute email code unless a valid 30-day HttpOnly trusted-device token exists. Spring Boot sends text mail through `smtp.gmail.com:587` with SMTP AUTH, STARTTLS, and a personal Gmail app password; Google Drive/Forms OAuth no longer requests `gmail.send`. Set `GMAIL_USERNAME`, `GMAIL_APP_PASSWORD`, and a shared `UCMS_INTERNAL_MAIL_TOKEN` only in untracked environment files. As a temporary development exception, `NODE_ENV=dev` or `EMAIL_VERIFICATION_ENABLED=false` activates registration immediately and completes password login without email; production defaults to verification and must explicitly keep `EMAIL_VERIFICATION_ENABLED=true`. Logout and administrator reauthentication revoke trusted-device bypasses; the administrator action also closes only the target user's sessions and records an audit without clearing identity data. The retired authentication-code and room-binding storage remains removed, and the future Kakao Business chatbot is limited to utterance-response behavior.

### One-shot migration commands

Copy `infra/env/example/dev/flyway.env.example` or `infra/env/example/prod/flyway.env.example` to the matching untracked `infra/env/<environment>/flyway.env`, then fill in a dedicated migration account.

```powershell
# Development
docker compose -f infra/docker-compose.flyway.yml --profile dev run --rm flyway-dev info
docker compose -f infra/docker-compose.flyway.yml --profile dev run --rm flyway-dev migrate
docker compose -f infra/docker-compose.flyway.yml --profile dev run --rm flyway-dev validate

# Production: run info, take/verify a backup, then migrate and validate.
docker compose -f infra/docker-compose.flyway.yml --profile prod run --rm flyway-prod info
docker compose -f infra/docker-compose.flyway.yml --profile prod run --rm flyway-prod migrate
docker compose -f infra/docker-compose.flyway.yml --profile prod run --rm flyway-prod validate
```

For the first migration of the existing non-empty 0.0.1 production schema only, temporarily set `FLYWAY_BASELINE_ON_MIGRATE=true`. Confirm that `info` reports 0.0.1 as the baseline and 0.1.1 as pending, run `migrate`, then immediately restore the value to `false`.

### Isolated verification

The following command creates a uniquely named Docker network and tmpfs-backed MySQL. It tests both a fresh database (`0.0.1` then `0.1.1`) and first-time Flyway adoption of a non-empty 0.0.1 schema, validates and reruns Flyway, then exercises Node schema/POS, email registration/2FA/trusted-device revocation, impersonation, and Spring context smoke tests. It does not connect to the current dev or production database and removes its temporary resources in `finally`.

```powershell
powershell -ExecutionPolicy Bypass -File infra/scripts/test-flyway-migrations.ps1
```
