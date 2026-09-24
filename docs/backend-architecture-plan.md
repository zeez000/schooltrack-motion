# SchoolTrack backend architecture plan

## Existing application inspection

The deployed application is a dependency-free static frontend in `site/`. Its build copies the site into `dist/` and also creates a portable `preview.html`. The current GitHub Pages workflow runs the existing frontend tests and build, so backend work must not change that deployment contract until a later, explicit integration phase.

The interactive prototype exposes three demo views:

- **Parent:** Today, Journey, Attendance, and Updates for two fictional children.
- **Teacher:** a Grade 3 / Section A roster with search, selection, review, and classroom confirmation.
- **School:** route search, assigned-student totals, latest transport samples, and a missing-update exception.

There is no current login or server boundary. Role switching is a design control only. All mutations live in memory and reset on refresh.

## Hardcoded data to replace incrementally

| Current frontend sample | Current location | Future API source |
| --- | --- | --- |
| Mira and Rohan, class labels, guardian relationship | `site/app.js` `students` | `GET /api/me/students`, `GET /api/students/:studentId` |
| Home, boarding, gate, classroom, return, and handover events | `site/app.js` `events` and each student's `recorded` / `skipped` sets | `GET /api/students/:studentId/today`, journey and checkpoint APIs |
| September attendance calendar and computed metrics | `attendanceData()` | `GET /api/students/:studentId/attendance` |
| In-session activity and notification counter | `state.notices`, `activity()` | notification APIs |
| Route 04 / Bus A parent card and illustrative map | `routes[0]`, `mapCard()` | authorised route assignment plus separate latest vehicle-location API |
| Teacher roster, status, and confirmation mutations | `roster`, `teacherView()` | teacher class and attendance APIs |
| School transport routes, counts, and stale update | `routes`, `schoolView()` | admin transport and route APIs |
| Scenario controls and "next sample event" | local state/action handlers | retained only as a clearly labelled demo mode |
| Hero and marketing-page times | `site/index.html` | remain illustrative marketing content unless later product copy changes |

API failures must never be converted into successful-looking demo data. During Phase 9 the frontend will gain an API service layer and explicit loading, empty, stale, error, and demo states.

## Target architecture

Use a **modular monolith** with Node.js, TypeScript, Express, PostgreSQL, Prisma, Zod, structured logging, and REST APIs.

```text
backend/
  src/
    config/            environment and runtime configuration
    modules/           auth, schools, users, students, guardians,
                       classes, transport, journeys, checkpoints,
                       attendance, notifications, audit
    middleware/        request IDs, authentication, RBAC, validation, errors
    services/          cross-module orchestration and integrations
    utils/             shared, side-effect-free helpers
    app.ts              Express composition without opening a port
    server.ts           process lifecycle and graceful shutdown
  prisma/              schema, migrations, and later demo seed
  tests/               API and authorisation tests
```

### Security and tenancy boundary

- UUIDs for public domain identifiers.
- Every school-owned query is scoped by the authenticated user's `schoolId` in the backend.
- Parent access additionally requires an active guardian relationship.
- Teacher access additionally requires an active teacher-class assignment.
- Transport staff access additionally requires an assigned route/vehicle.
- Sensitive mutations create append-only audit records.
- Request validation happens at the API boundary and API errors use one consistent envelope.

### Safety-critical domain boundary

Vehicle location and student presence are separate models and services:

- `VehicleLocation` answers where a vehicle last reported itself, with retention and staleness rules.
- `CheckpointEvent` records an explicit student event and its source.
- A location never creates a boarding event.
- A later checkpoint never creates or completes an earlier checkpoint.
- Journey projections return neutral states such as `AWAITING_RECORD`, `NOT_RECORDED`, and `UPDATE_UNAVAILABLE`.

## Delivery phases

1. **Foundation:** TypeScript/Express service, environment validation, PostgreSQL/Prisma connection, Docker, structured logging, request IDs, error envelope, `/health`, `/ready`, and tests.
2. Authentication and RBAC.
3. Schools, users, students, guardians, classes, and teacher assignments.
4. Vehicles, routes, stops, and student-route assignments.
5. Journeys and append-oriented checkpoint events.
6. Attendance and correction history.
7. Stored notifications and future delivery adapters.
8. Audit logs, journey projections, and exception handling.
9. Incremental frontend API integration without visual redesign.
10. Full security/authorisation suite, documentation, and deployment hardening.

## Phase 1 implementation contract

Phase 1 will add only foundation infrastructure:

- a backend workspace using TypeScript and Express;
- validated environment configuration with no committed secrets;
- a Prisma PostgreSQL connection with domain models intentionally deferred;
- `GET /health` for process liveness;
- `GET /ready` for database readiness;
- structured request logging with request IDs and redaction;
- security headers, CORS configuration, JSON size limits, 404 handling, and a consistent error shape;
- graceful startup/shutdown;
- Dockerfile and Docker Compose services for backend and PostgreSQL;
- Vitest/Supertest tests for liveness, readiness, request IDs, 404s, and malformed JSON;
- CI coverage for the backend tests/build while preserving the existing Pages deployment.

Phase 1 will not add users, authentication, student records, routes, checkpoint events, attendance, seed accounts, or frontend API calls. Those belong to later phases and must not be represented as complete before their authorisation rules exist.
