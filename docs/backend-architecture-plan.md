# SchoolTrack backend architecture

The original Codex pass completed Phase 1 only: Express/TypeScript, PostgreSQL/Prisma connectivity, health/readiness, request logging, Docker, and basic tests. This continuation completes the backend as a modular monolith while preserving the existing static frontend and Pages deployment.

## Architecture
- Node.js 22 + TypeScript + Express 5
- PostgreSQL 16
- Prisma 7 with `@prisma/adapter-pg`
- Zod request validation
- Pino structured logs with request IDs and sensitive-header redaction
- JWT-style HS256 access tokens implemented with Node crypto
- opaque rotating refresh tokens stored only as SHA-256 hashes
- Node `scrypt` password hashing
- REST APIs plus SSE for live vehicle updates

## Security model
Every sensitive query is school-scoped server-side. Role checks are not delegated to the frontend. Parent, teacher, and transport access adds relationship/assignment checks. Device checkpoint ingestion uses separately registered device credentials. GPS devices cannot create child checkpoint events.

## Domain separation
`VehicleLocation` is transport telemetry. `CheckpointEvent` is evidence that a specific student event was recorded. No code path converts a bus coordinate into student presence, and no later checkpoint fills in a missing earlier one.

`AttendanceRecord` stores the current attendance state while `AttendanceCorrection` preserves changes. `AuditLog` is append-only through ordinary APIs.

## Data retention
Vehicle location samples are bounded by `VEHICLE_LOCATION_RETENTION_DAYS` and purged during new location ingestion. Operational deployments should also schedule a database retention job for low-traffic vehicles. Audit/attendance retention should be set by school policy and applicable law before production use.

## Backend module map
- `auth`: login, refresh rotation, logout, current user, development-only registration
- `me` / `students`: guardian-scoped student data and today projection
- `teacher` / `attendance`: class roster, classroom checkpoint, attendance and corrections
- `transport`: assigned routes, journey start/end, boarding/handover, vehicle GPS and SSE
- `checkpoints`: staff and registered-device checkpoint ingestion
- `admin` / `devices`: school management operations
- `notifications`: persistent user notification feed
- `audit`: admin-visible audit trail
- `docs`: OpenAPI and human-readable API notes

## Production gaps outside backend scope
The current marketing/demo frontend still uses fictional browser-local state. Wiring it to these APIs is a separate integration step so the backend can be verified independently first. Production rollout also requires a managed PostgreSQL deployment, HTTPS/reverse proxy, secret manager, monitoring, backups, push-notification provider, school onboarding/consent workflows, and a legal/privacy review for child/location data.
