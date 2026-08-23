# Repository Guidelines

## Scope and Sources of Truth

This is the single `AGENTS.md` for the UCMS repository and applies to every directory unless a task explicitly states otherwise. UCMS is a university club management system. Use `README.md` for setup details and `handoffs/HANDOFF.md` for migration history; read the handoff before migration work.

## Project Structure

Active development lives under `dev/`:

- `dev/UCMS_WebServer/`: Node.js Express/EJS MVC app. Keep URL wiring in `routes/`, request flow in `controllers/`, MySQL access in `models/`, and EJS/browser assets in `public/`.
- `dev/UCMS_ShareDB/`: ShareDB WebSocket service for collaborative evaluation notes.
- `dev/UCMS_WebServer/InterviewScheduler/`: Python OR-Tools interview scheduler.
- `dev/React/UCMS_React/`: Vite React application written in TypeScript.
- `dev/UCMS_Bot/`: separate bot project.

Development orchestration and helper files, including `docker-compose.yml`, `initialData.sql`, `start-all.bat`, and `mysqlTerminal.bat`, are under `dev/`. Production scaffolding lives under `prod/`.

## Build and Development Commands

Run commands from the repository root unless noted otherwise:

- `cd dev && docker compose up --build`: build and run the development stack. It expects the external Docker network `UCMS-network` and service-specific `keys/.env.dev` files.
- `cd dev/UCMS_WebServer && npm install && npm run dev`: run the Express app with `nodemon` and `NODE_ENV=dev`.
- `cd dev/UCMS_ShareDB && npm install && npm run dev`: run the ShareDB service in development mode.
- `npm run prod` from either Node service: run that service in production mode.
- `cd dev/React/UCMS_React && npm install && npm run dev`: run the Vite app.
- `cd dev/React/UCMS_React && npm run lint && npm run build`: lint and build React.
- `cd dev/UCMS_WebServer/InterviewScheduler && pip install -r requirements.txt && python main.py 32`: run the scheduler with `inputs/input_32.json`.

Install dependencies separately for each service. Do not assume a repository-wide package manager or test runner.

## Coding Style and Architecture

Preserve module boundaries and the local style of each file; prefer targeted edits over broad refactors.

- Node services use CommonJS and usually 2-space indentation in JavaScript/EJS.
- React uses TypeScript ES modules.
- Use `camelCase` for functions and controller files such as `recruitController.js`, `PascalCase` for classes and model files such as `InterviewSchedule.js`, `UPPER_CASE` for constants, and `*Router.js` for route modules.
- Keep routes focused on URL wiring, controllers on request handling, and models on database access.

When modifying code, add a concise dated comment to the changed block explaining when and why it changed, for example `// 2026-07-16: ...`. Keep comments meaningful; do not add them for formatting-only changes.

## Testing and Verification

No repository-wide automated test suite is configured. Verify the smallest relevant scope and report what was run:

- For Express/EJS changes, run the affected service and manually exercise changed routes, views, and API endpoints.
- For ShareDB changes, verify the affected WebSocket/collaboration path with the service running.
- For React changes, run `npm run lint` and `npm run build`, then check visible changes in the browser.
- 2026-08-21: For any frontend or visual change, capture and inspect representative desktop and mobile screenshots of every affected page/state. Verify layout, spacing, typography, colors, overflow, controls, hover/focus/active behavior, empty/loading/error states when relevant, and the overall UI/UX before declaring the work complete. If no controllable browser is available, report the exact visual checks that remain instead of claiming screenshot verification.
- For scheduler changes, use representative `InterviewScheduler/inputs/input_<id>.json` files and inspect the corresponding `outputs/output_<id>.json`.

## Migration and Refactoring

During the Spring Boot + React migration, keep the Node APIs, ShareDB service, and Python scheduler operational while introducing new services under `/api/v2/*`.

2026-08-23: Implement every newly introduced backend feature in the Spring Boot service. Modify the Node backend only when needed to preserve an existing feature, fix an existing defect, or provide a minimal compatibility adapter while the corresponding flow migrates to `/api/v2/*`; do not add new standalone backend business logic to Node.

For the EJS-to-React refactoring, put all new notes, plans, verification logs, and migration records in `documents/RefactoringDocs/`. Do not create refactoring documents directly under `documents/` or in the misspelled `documents/RefatoringDocs/`.

2026-08-20: Whenever code, database schema, API contracts, authentication behavior, infrastructure, deployment steps, or operating procedures change, update the relevant canonical documentation in the same task. Prefer revising an existing source-of-truth document over creating a new overlapping document, and report explicitly when no documentation update is applicable.

## Security and Data Handling

Treat this repository as sensitive.

- Never commit `keys/`, `.env*`, OAuth credentials or tokens, database passwords, session secrets, certificate/certbot material, logs, scheduler inputs or outputs, or production database dumps.
- Keep environment-specific values in `.env.dev` or `.env.prod` files under the appropriate untracked `keys/` directory.
- `prod/initialData.sql` and `documents/` may contain real personal data; inspect them only when the task explicitly requires it.
- Recheck authentication, authority, and ownership checks when changing member, finance, recruit, POS, event, or API behavior.

## Commits and Pull Requests

Follow the existing convention of short, focused Korean summaries using a date or clear feature description. Pull requests should state the purpose, affected modules or routes, required environment changes, and manual verification steps; include screenshots for visible UI changes.

2026-08-23: Every development deployment must increment the root `VERSION` in the `0.1.x` series by running `infra/scripts/bump-dev-version.ps1` before packaging. Use that version in the release identifier and deployment record. A successful dev deployment is complete only after its tested source, incremented `VERSION`, and canonical documentation are committed and pushed; never include ignored secrets or runtime data.
