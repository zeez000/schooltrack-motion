# Production deployment handoff

No usable backend-hosting credentials/provider or API domain were found in accessible repository secrets, Actions variables or deployment environment configuration. GitHub authentication and Pages access are available; Pages cannot host Express or PostgreSQL. **Owner step: external hosting credentials / domain configuration required.** No backend production deployment has been claimed.

## Server and DNS

Use a Linux VM with Docker Engine and Compose v2, at least 2 vCPU, 4 GB RAM, 20 GB durable disk plus database/backup capacity, and outbound HTTPS. Use one API replica. Point `api.your-domain.example` A/AAAA records to the server (publish AAAA only if IPv6 works). Allow inbound TCP 80/443 and optionally UDP 443 for Caddy, restricted SSH administration, and deny 4000/5432. Caddy obtains TLS automatically; persist its volumes. PostgreSQL has no published port.

## Exact initial deployment (Linux operator shell)

```bash
git clone https://github.com/zeez000/schooltrack-motion.git
cd schooltrack-motion
git checkout main
umask 077
cp .env.example .env
openssl rand -hex 32 # generate a unique PostgreSQL password
openssl rand -hex 48 # generate a separate JWT signing secret
```

Edit `.env` privately (never commit it), replacing placeholders:

```dotenv
POSTGRES_DB=schooltrack
POSTGRES_USER=schooltrack
POSTGRES_PASSWORD=<first generated hex value>
DATABASE_URL=postgresql://schooltrack:<same hex password>@postgres:5432/schooltrack?schema=public
DOMAIN=api.your-domain.example
CORS_ORIGINS=https://zeez000.github.io
JWT_ACCESS_SECRET=<second generated hex value>
LOG_LEVEL=info
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=30
VEHICLE_LOCATION_STALE_SECONDS=300
VEHICLE_LOCATION_RETENTION_DAYS=7
CHECKPOINT_MAX_AGE_SECONDS=86400
EVENT_MAX_FUTURE_SKEW_SECONDS=300
SSE_MAX_CONNECTION_SECONDS=900
```

Use the frontend **origin**, not its `/schooltrack-motion/` path. Production Compose fixes `NODE_ENV=production`, `ENABLE_DEV_REGISTRATION=false`, and `TRUST_PROXY=true`. Do not expose the backend directly. Hex passwords avoid URL-encoding ambiguity. Replace secrets in your managed secret store before a pilot; restrict `.env` permissions to the deploy operator.

```bash
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml run --rm backend npm run db:migrate:deploy
docker compose -f docker-compose.prod.yml up -d
```

Both immutable committed migrations are applied in order. Backend startup also runs migrate deploy idempotently. **Never run db:seed in production.** For an upgrade, back up first, fetch reviewed green `main`, rebuild, deploy migrations and restart. Do not roll back an applied migration by rewriting its SQL history.

### Provision the first real school administrator

The empty production database has no demo users. The operator-only command below creates the first school/admin transactionally, records an audit, and refuses an existing nonempty database. It is not an HTTP endpoint and prints no password. It requires a unique 16–128 character password. Use the admin UI to provision subsequent users/classes/relationships; additional tenant onboarding requires a trusted operator workflow, not public registration.

```bash
export BOOTSTRAP_SCHOOL_NAME='Your school'
export BOOTSTRAP_SCHOOL_ADDRESS='Your campus address'
export BOOTSTRAP_TIMEZONE='Asia/Kolkata'
export BOOTSTRAP_ADMIN_EMAIL='verified.owner@your-school.example'
read -rsp 'Initial administrator password: ' BOOTSTRAP_ADMIN_PASSWORD; echo
export BOOTSTRAP_ADMIN_PASSWORD
docker compose -f docker-compose.prod.yml exec -T \
  -e BOOTSTRAP_SCHOOL_NAME -e BOOTSTRAP_SCHOOL_ADDRESS -e BOOTSTRAP_TIMEZONE \
  -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_PASSWORD \
  backend node dist/ops/bootstrap-admin.js
unset BOOTSTRAP_ADMIN_PASSWORD
```

Deliver the initial password through an approved private channel. Log in over HTTPS and change it. Do not put passwords in command arguments, public issues or CI logs.

## HTTPS and application verification

```bash
curl --fail --show-error https://api.your-domain.example/health
curl --fail --show-error https://api.your-domain.example/ready
curl --fail --show-error https://api.your-domain.example/openapi.json
curl -i -X OPTIONS https://api.your-domain.example/api/auth/login \
  -H 'Origin: https://zeez000.github.io' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
docker compose -f docker-compose.prod.yml ps
```

Expect `/health` and `/ready` 200 and the exact frontend `Access-Control-Allow-Origin` (no wildcard or credential-cookie header). Do not accept a health-only deployment: verify real login, `/api/auth/me`, provision a pilot class/student/guardian and each role assignment, teacher correction, transport boarding and authorized handover, parent tenant denial, notification read, and GPS/SSE independently of checkpoint evidence. Stop the pilot if these fail.

Publish the real public API URL to Pages from an authenticated operator workstation:

```bash
gh variable set SCHOOLTRACK_API_BASE_URL --repo zeez000/schooltrack-motion \
  --body 'https://api.your-domain.example'
gh workflow run deploy.yml --repo zeez000/schooltrack-motion --ref main
gh run list --repo zeez000/schooltrack-motion --workflow deploy.yml --limit 3
```

Wait for successful verification and Pages deployment, then open `https://zeez000.github.io/schooltrack-motion/`, verify login against the production domain in browser network tools, test role workflows/mobile/reduced motion, and confirm there are no demo fallbacks. An unset API URL intentionally produces an unconfigured notice.

## Backups, restore, monitoring and retention

Run an encrypted daily database backup on the server using an operator-managed encryption recipient; never store the encryption private key next to backups:

```bash
set -o pipefail
docker compose -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  | age -r '<backup encryption recipient>' > '/protected-backups/schooltrack.dump.age'
```

Install `age` on the operator host and create `/protected-backups` with restricted permissions first. Schedule via the host's backup system, use dated filenames, copy off-host, alert on failures, and adopt a school-approved retention policy. Monthly restore drill into an isolated **empty test database**, never live production:

```bash
set -o pipefail
age -d -i /secure/operator-backup-key /protected-backups/schooltrack.dump.age \
  | docker compose -f docker-compose.prod.yml exec -T postgres \
      pg_restore -U schooltrack -d schooltrack_restore_test --no-owner --exit-on-error
```

Create that isolated database first; verify counts, roles, audits and application smoke tests against it. Preserve Caddy volumes and deployment configuration, with secrets managed separately. Monitor external `/health` and `/ready` every minute and alert on repeated failures, authentication replay, failed device ingestion, database/disk growth, and backup age. Configure a scheduled GPS-retention SQL job (matching the chosen retention period) for inactive fleets; ingestion already prunes active vehicle history. Staff need a manual student-accounting procedure during outages. Never treat this software or GPS as the sole safety system.

Notifications are PostgreSQL-only. FCM/APNs/SMS/email are optional future adapters, not deployment dependencies. Horizontal scaling requires shared SSE pub/sub and shared gateway rate limiting; do not silently add replicas to the current process-local design.
