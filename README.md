# UCMS

UCMS (University Club Management System) is a club operations platform for managing members, events, recruiting, interviews, settlements, POS sales, and real-time evaluation notes. Version 1.0.0 is organized as a Docker-ready development stack under `dev/`.

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

- Kakao OAuth login and MySQL-backed sessions
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

Required values include database connection settings, session secret, service ports, domain, Kakao OAuth credentials, and external API keys.

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

## Interview Scheduler

The scheduler lives in `dev/UCMS_WebServer/InterviewScheduler/` and uses Python OR-Tools.

```bash
cd dev/UCMS_WebServer/InterviewScheduler
pip install -r requirements.txt
python main.py 32
```

Input files are read from `inputs/input_<id>.json`, and results are written to `outputs/output_<id>.json`.

## Security Notes

Do not commit `keys/`, `.env.*`, OAuth credentials, database passwords, session secrets, certificate files, or generated runtime data. Keep production secrets outside the repository.
