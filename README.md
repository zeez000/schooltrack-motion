# SchoolTrack

SchoolTrack combines the existing premium school-day frontend concept with a complete multi-tenant backend for verified school journey events. The product name and all included demo people/schools are provisional and fictional.

## Backend

The backend lives in `backend/` and uses Node.js 22, TypeScript, Express 5, PostgreSQL 16, Prisma 7, Zod, Pino, REST, and SSE.

Core safety rule: **bus GPS does not prove a child is on the bus, and a later student checkpoint never automatically confirms an earlier missing checkpoint.** The API returns explicit missing/stale states instead.

### Run with Docker

```bash
cp .env.example .env
# Replace POSTGRES_PASSWORD, DATABASE_URL and JWT_ACCESS_SECRET.
docker compose up --build -d
```

The backend container applies committed Prisma migrations before starting. Check:
- `http://localhost:4000/health`
- `http://localhost:4000/ready`
- `http://localhost:4000/docs`
- `http://localhost:4000/openapi.json`

### Run directly

```bash
cd backend
cp .env.example .env
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run dev
```

Useful commands:
```bash
npm --prefix backend test
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix backend run db:migrate:deploy
npm --prefix backend run db:seed
```

## Fictional development seed

`npm run db:seed` creates clearly fictional data for local development:
- `parent@schooltrack.demo`
- `teacher@schooltrack.demo`
- `admin@schooltrack.demo`
- `driver@schooltrack.demo`

Development-only password: `SchoolTrackDemo!2026`

It also creates a normal journey, a **missing boarding record with a later school-entry record**, a current bus location, a deliberately stale bus location, and a demo RFID reader. Never reuse these credentials in a real deployment.

## Authentication and authorization

- Passwords use `scrypt` with random salts.
- Access tokens are short-lived signed tokens.
- Refresh tokens are high-entropy opaque values, stored only as SHA-256 hashes and rotated on refresh.
- School tenant scope is enforced in backend queries.
- Parents require active guardian links, teachers require active class assignments, and transport staff require active route assignments.
- Development self-registration is off by default and cannot be enabled in production.

## Location and retention

Vehicle samples become stale after `VEHICLE_LOCATION_STALE_SECONDS` (default 300 seconds). New location ingestion deletes samples older than `VEHICLE_LOCATION_RETENTION_DAYS` (default 7 days) for that vehicle. Low-traffic production fleets should also run a scheduled retention job.

## API documentation

See [`docs/api.md`](docs/api.md) and [`docs/backend-architecture-plan.md`](docs/backend-architecture-plan.md).

## Frontend

The existing `site/` remains the polished fictional design prototype and is still published with GitHub Pages. Backend completion intentionally does not silently replace its demo data. Connecting the frontend to authenticated API states is a separate integration pass.

## Testing and CI

GitHub Actions provisions PostgreSQL, installs the locked backend dependencies, applies the Prisma migration, runs backend tests, typechecks and builds the API, then runs the existing frontend tests/build before publishing Pages.

Backend integration tests cover invalid/unauthenticated access, guardian scope, cross-school denial, teacher assignment denial, checkpoint non-inference, GPS/presence separation, attendance corrections + audit history, persistent notifications, stale GPS, and transport assignment denial.

## Production checklist

Before using this with real schools or children, add managed secrets, HTTPS, monitoring/alerting, database backups, scheduled retention, push delivery, school/guardian verification workflows, privacy/consent controls, and jurisdiction-specific legal review. This repository does not claim those operational controls are already deployed.
