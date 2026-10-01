# SchoolTrack API

SchoolTrack is a multi-tenant school journey API. The backend deliberately keeps **bus GPS** separate from **student checkpoint evidence**. A later student event never silently confirms an earlier missing event.

## Authentication

User endpoints use a short-lived HS256 bearer access token and an opaque refresh token. Refresh tokens are hashed in PostgreSQL and rotated on every refresh. Reuse of an already-revoked refresh token revokes the user's remaining active refresh sessions. Passwords use Node.js `scrypt` with per-password random salts.

Development self-registration is disabled by default and cannot be enabled in production. School admins create user accounts through the admin API for normal operation.

## Tenant boundary

Every school-owned query is constrained by the authenticated `schoolId`. Additional authorization applies:
- parents require an active `Guardian` relationship;
- teachers require an active `TeacherClass` assignment;
- transport staff require an active `TransportAssignment` and student route assignment;
- admins are restricted to their own school.

A cross-school identifier is treated as not found.

## Journey truth model

`CheckpointEvent` is append-oriented. The API does not create earlier checkpoint events when a later one arrives. The `GET /api/students/:studentId/today` projection reports:
- `RECORDED` when that exact event exists;
- `NOT_RECORDED` when a later event exists but the earlier event does not;
- `AWAITING_RECORD` when no later evidence exists yet;
- `NOT_APPLICABLE` when transport is not assigned for that step;
- `UPDATE_UNAVAILABLE` for stale or missing vehicle data.

Vehicle GPS is stored in `VehicleLocation` and never implies that a student boarded the bus.

## Main routes

### Auth
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/change-password`
- `GET /api/auth/me`
- `POST /api/auth/register` (development-only when explicitly enabled)

### Parent / student
- `GET /api/me/students`
- `GET /api/students/:studentId`
- `GET /api/students/:studentId/today`
- `GET /api/students/:studentId/journeys`
- `GET /api/students/:studentId/attendance`
- `GET /api/students/:studentId/notifications`

### Teacher
- `GET /api/teacher/classes`
- `GET /api/classes/:classId/students`
- `GET /api/classes/:classId/attendance`
- `POST /api/classes/:classId/attendance`
- `POST /api/students/:studentId/checkpoints/classroom`

Attendance corrections require a reason and write both an `AttendanceCorrection` and an audit record.

### Transport
- `GET /api/transport/routes/me`
- `POST /api/routes/:routeId/start`
- `POST /api/routes/:routeId/end`
- `POST /api/students/:studentId/boarding`
- `POST /api/students/:studentId/handover` — requires `guardianId` for an active authorized pickup guardian
- `POST /api/vehicles/:vehicleId/location`
- `GET /api/vehicles/:vehicleId/location`
- `GET /api/vehicles/:vehicleId/stream` (SSE)

Vehicle locations older than `VEHICLE_LOCATION_STALE_SECONDS` are returned as stale. Old samples are deleted according to `VEHICLE_LOCATION_RETENTION_DAYS` when new samples arrive.

### Checkpoints / hardware
- `POST /api/checkpoints` for authorized staff/admins
- `POST /api/device/checkpoints` using `x-device-id` + `x-device-token`
- `POST /api/device/vehicles/:vehicleId/location` for a GPS tracker bound to that exact vehicle

Registered scanner/tablet devices have an explicit `allowedEventTypes` allowlist. GPS tracker devices are explicitly blocked from creating student checkpoint events.

### Notifications and audit
- `GET /api/notifications`
- `PATCH /api/notifications/:notificationId/read`
- `GET /api/admin/audit`

### Admin
Admin routes under `/api/admin` manage users, students, guardians, classes, vehicles, routes, student-route assignments, teacher-class assignments, transport assignments, and devices.

Device administration includes `POST /api/admin/devices/:deviceId/rotate-token`; the previous token becomes invalid immediately.

## Errors
Errors use:
```json
{"error":{"code":"STUDENT_NOT_AUTHORIZED","message":"You do not have access to this student.","requestId":"..."}}
```
Zod validation errors use `VALIDATION_ERROR` and may include field-level `details`.

## Interactive reference
- `GET /openapi.json`
- `GET /docs`


## Production security behavior

- Refresh tokens are rotated atomically. Detected replay revokes the active refresh-session family and invalidates outstanding access tokens through token-version increment.
- Login is throttled by source IP and hashed account identifier.
- Parent vehicle-location access requires an active journey for one of the parent's linked students.
- Transport student actions are checked against the relevant MORNING/RETURN route direction.
- Staff checkpoint source is derived server-side; clients cannot claim RFID/teacher/driver provenance.
- Checkpoint and vehicle timestamps outside the configured recording window are rejected.
- Device credentials can be rotated and device capabilities are provisioned explicitly.
- Production startup rejects wildcard/non-HTTPS CORS and weak/default JWT secrets.

See `SECURITY.md` for deployment and incident-response requirements.
