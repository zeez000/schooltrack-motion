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

## Integrated frontend

`site/real.js` resolves the role from `/api/auth/me` and composes the original design components. `site/api/client.js` owns JSON requests, typed API errors, serialized refresh rotation and bearer-authenticated SSE reconnects. Resource modules contain endpoint mappings. Public build configuration lives in `site/config.js`; no production localhost endpoint is injected by default.

The real and fictional demo applications have an explicit mode boundary. Only observed backend success creates real confirmations. Parent vehicle telemetry remains separate from checkpoint status, with server-configured staleness and honest unavailable/reconnecting states. Teacher corrections and guardian handover retain server authorization and audit history. School-local timestamp boundaries are distinct from date-only journey keys, including DST.

Notifications are persisted in PostgreSQL. Future FCM/APNs/SMS/email delivery should consume notification records through a retryable outbox adapter, preserving recipient scope and idempotent delivery; browser receipts must never rewrite checkpoints. No paid delivery provider is connected.

## Deployment boundary

The included Caddy/API/private-PostgreSQL stack and operator-only initial administrator provisioning are deployment-ready. See `docs/deployment.md`. One API replica is the supported topology: SSE subscriptions and rate limits are process-local. Horizontal scaling requires shared pub/sub and gateway limits. Real-school identity/consent policies, secret custody, monitoring and backup/restore scheduling remain deployment-operator responsibilities, not automated child-safety guarantees.
