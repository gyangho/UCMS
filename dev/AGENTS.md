# Repository Guidelines

## Project Structure & Module Organization

This repository contains the UCMS development stack. `UCMS_WebServer/` is the main Node.js Express application, organized with `controllers/`, `models/`, `routes/`, and EJS views/assets under `public/`. `UCMS_ShareDB/` runs the WebSocket collaboration server for shared evaluation notes. `UCMS_WebServer/InterviewScheduler/` contains the Python OR-Tools interview scheduler. `UCMS_Bot/` is a separate bot project. Root-level files include `docker-compose.yml`, `initialData.sql`, and Windows helper scripts such as `start-all.bat` and `mysqlTerminal.bat`.

## Build, Test, and Development Commands

Install dependencies separately in each Node service:

```bash
cd UCMS_WebServer && npm install
cd ../UCMS_ShareDB && npm install
```

Run the web server in development mode with `npm run dev` from `UCMS_WebServer/`; it starts `nodemon` with `NODE_ENV=dev`. Run the collaboration server the same way from `UCMS_ShareDB/`. Use `npm run prod` in either service for production mode. The root `docker-compose.yml` builds and runs `ucms_web` and `ucms_sharedb`; it expects the external Docker network `UCMS-network` and service-specific `keys/.env.dev` files. The Python scheduler dependency is listed in `UCMS_WebServer/InterviewScheduler/requirements.txt`.

## Coding Style & Naming Conventions

Use CommonJS modules and the existing MVC pattern. Keep controllers focused on request handling, models on database access, and routes on URL wiring. Follow existing JavaScript naming: `PascalCase` for classes, `camelCase` for methods and files such as `eventController.js`, and uppercase names for constants. Prefer 2-space indentation in routes/controllers that already use it and preserve local file style when editing.

## Testing Guidelines

No automated test framework is currently configured. Before submitting changes, run the affected service locally with `npm run dev` and exercise the changed routes or views manually. For scheduler changes, run the Python entry point against an input file in `InterviewScheduler/inputs/` and inspect the generated `outputs/output_*.json`.

## Commit & Pull Request Guidelines

Recent commits use short Korean summaries with dates or feature descriptions, for example `2026.02.22 이경호 dockerize 시작` and `정산기능 추가`. Keep commits focused and descriptive. Pull requests should include the purpose, changed routes or modules, required environment changes, manual test steps, and screenshots for visible UI changes.

## Security & Configuration Tips

Do not commit `keys/`, OAuth credentials, database passwords, session secrets, or certificate material. Keep environment-specific values in `.env.dev` or `.env.prod`. Validate authority checks when adding member, finance, recruit, POS, or event-management endpoints.
