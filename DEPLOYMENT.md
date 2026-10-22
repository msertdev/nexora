# Self-hosted deployment

This guide covers two isolated Compose deployments. The local test stack is
development-only; the production stack expects a domain, HTTPS and a real SMTP
server. Neither stack changes the existing `compose.yaml` development setup.

## Requirements

- Docker Engine with the Compose plugin.
- A host with enough disk for the PostgreSQL volume and backups.
- Production: a DNS name pointing to the server, inbound TCP 80/443, and a
  standard SMTP account reachable from the API container.
- Build machines need internet access to download base images and pnpm packages.

The Compose files run PostgreSQL 17, a one-shot Prisma migration container,
NestJS, Next.js and Caddy. The database and API have no published ports. Caddy
is the only public ingress. The API's database readiness check and startup
dependency prevent it serving traffic before the database and migration have
succeeded.

## Configuration files and secrets

From the repository root, copy **one** example to `deploy/runtime.env`:

```sh
cp deploy/runtime.local.env.example deploy/runtime.env
# or, for a production deployment:
cp deploy/runtime.production.env.example deploy/runtime.env
```

Replace every placeholder, including passwords and SMTP values. Use unique,
random passwords, URL-encode reserved characters in `DATABASE_URL`, and keep
`deploy/runtime.env` readable only by the deployment operator (for example,
`chmod 600 deploy/runtime.env` on Linux). Do not commit or bake this file into
an image. Compose injects the values as container environment variables; use a
secret manager or Docker secrets with an appropriately adapted deployment if
your operational policy requires secrets to be mounted as files.

`PUBLIC_APP_URL` must match the browser-visible origin exactly. It also
determines email links and the API's allowed frontend Origin.

| Variable                                            | Purpose                                                                                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_DOMAIN`                                        | Caddy site address. Production: public DNS name. Local: `:80`.                                                                                     |
| `BIND_ADDRESS`                                      | Address published by Caddy. Keep `127.0.0.1` for local tests.                                                                                      |
| `HTTP_PORT`, `HTTPS_PORT`                           | Host-side Caddy ports.                                                                                                                             |
| `COMPOSE_PROJECT_NAME`                              | Isolates containers and names the database volume. Use a new name for every disposable test environment.                                           |
| `NEXORA_IMAGE_TAG`                                  | Image tag for this deployment. Use a release tag in production.                                                                                    |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | PostgreSQL initialization settings.                                                                                                                |
| `DATABASE_URL`                                      | API and migration connection string; host must be `db` inside Compose.                                                                             |
| `PUBLIC_APP_URL`                                    | Public app origin; HTTPS is required in production.                                                                                                |
| `REGISTRATION_MODE`                                 | `invite-only` disables public signup; `public` enables unrestricted signup. Production defaults to `invite-only`; local-test defaults to `public`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`             | SMTP endpoint and transport TLS mode.                                                                                                              |
| `SMTP_USER`, `SMTP_PASSWORD`                        | Optional SMTP credentials; configure both or neither.                                                                                              |
| `SMTP_FROM`                                         | Sender address accepted by the SMTP server.                                                                                                        |
| `MAILPIT_SMTP_PORT`, `MAILPIT_WEB_PORT`             | Host ports for the local-test Mailpit overlay only.                                                                                                |

## Local isolated self-hosted test

This mode binds the app and Mailpit only to loopback. It uses its own Compose
project and named database volume; it does not join or modify the existing
development `nexora` Compose project. The local overlay runs the API in
development mode so Mailpit is allowed; Mailpit is included only when
explicitly using this overlay.

1. Copy `deploy/runtime.local.env.example` to `deploy/runtime.env`.
2. Set a local-only `POSTGRES_PASSWORD` and replace `URL_PASSWORD` in
   `DATABASE_URL` with its URL-encoded value.
3. Start the isolated stack:

   ```sh
   docker compose --env-file deploy/runtime.env -p nexora-local-test \
     -f compose.prod.yaml -f compose.local-test.yaml up -d --build
   ```

4. Open the app at `http://localhost:8080` and Mailpit at
   `http://localhost:8026`. Mailpit SMTP is available on host port 1026.
   The API connects to the Mailpit container on its private Compose network.
5. Registration, verification and invitation flows may be tested with
   disposable test accounts created only in this isolated volume. The local
   example explicitly enables public registration; set
   `REGISTRATION_MODE=invite-only` to exercise restricted signup.

The `:80` Caddy address disables automatic HTTPS for this loopback-only mode.
It is not suitable for public exposure. To inspect services:

```sh
docker compose --env-file deploy/runtime.env -p nexora-local-test \
  -f compose.prod.yaml -f compose.local-test.yaml ps
docker compose --env-file deploy/runtime.env -p nexora-local-test \
  -f compose.prod.yaml -f compose.local-test.yaml logs --tail=100 api web proxy migrate
```

Stop without deleting data:

```sh
docker compose --env-file deploy/runtime.env -p nexora-local-test \
  -f compose.prod.yaml -f compose.local-test.yaml down
```

Do not add `-v` when stopping. The volume is removed only by an explicit
destructive volume removal command.

## Production deployment

1. Configure DNS for `APP_DOMAIN`; allow inbound TCP 80 and 443 to the host.
   Caddy obtains and renews certificates automatically. Do not put Mailpit in
   the production Compose invocation.
2. Copy `deploy/runtime.production.env.example` to `deploy/runtime.env`, set
   unique secrets, select a release image tag, and set:
   - `APP_DOMAIN` to the DNS name;
   - `PUBLIC_APP_URL` to `https://<APP_DOMAIN>`;
   - `BIND_ADDRESS=0.0.0.0`, `HTTP_PORT=80`, `HTTPS_PORT=443`;
   - SMTP values for a real, reachable server (never Mailpit or a loopback
     address).
   - `REGISTRATION_MODE=invite-only` unless unrestricted account creation is
     an explicit deployment policy.
3. Build and start:

   ```sh
   docker compose --env-file deploy/runtime.env -p nexora-prod \
     -f compose.prod.yaml up -d --build
   ```

   API startup is gated on the successful `prisma migrate deploy` one-shot
   service. If a migration fails, investigate the migration logs and do not
   bypass the gate or start the API against an incompatible schema.

4. Visit `https://<APP_DOMAIN>`. Caddy forwards `/api/*` to NestJS and all
   other paths to Next.js. Browser API requests use the same origin, so the
   session cookie, Origin validation and CSRF checks continue to apply.
5. For a new, empty database, create the initial verified workspace owner
   through the interactive bootstrap command:

   ```sh
   docker compose --env-file deploy/runtime.env -p nexora-prod \
     -f compose.prod.yaml exec api node dist/auth/bootstrap-admin.js
   ```

   It prompts for owner details and a hidden password, and creates the owner
   and initial workspace atomically. It refuses non-interactive use and any
   database that already contains users. There is no bootstrap HTTP endpoint
   or reusable bootstrap secret. Existing installations do not run this
   command.

With invite-only registration, an invited recipient can open the emailed
invitation link and create an account using the invitation email. The API
checks that the token is active and belongs to that email; the user must still
verify the account, sign in, and accept the invitation. Invitation creation
responses do not return bearer links; the link is delivered by email only.

The API trusts one proxy hop, matching this topology: the API has no published
port and Caddy is its only ingress proxy. Do not attach untrusted containers
to the ingress network or add another proxy hop without reassessing
`TRUST_PROXY_HOPS` and the forwarded-header trust boundary. Production requires
HTTPS and rejects local SMTP endpoints. TLS certificate verification is not
disabled.

## Migrations and upgrades

Back up the database before every upgrade. Pin source/image tags to a reviewed
release. Build the new release and let Compose run the migration gate:

```sh
docker compose --env-file deploy/runtime.env -p nexora-prod \
  -f compose.prod.yaml build
docker compose --env-file deploy/runtime.env -p nexora-prod \
  -f compose.prod.yaml up -d
```

Only `prisma migrate deploy` is used. It applies committed migrations and does
not reset or seed data. Review migration compatibility and release notes before
upgrading; this deployment does not implement rolling or zero-downtime schema
migrations. Keep a verified backup and the previous image tag available for
recovery. Restoring a backup may require rolling application images back to a
compatible version.

## Backup and restore

Take a consistent logical backup to a protected host path:

```sh
umask 077
docker compose --env-file deploy/runtime.env -p nexora-prod \
  -f compose.prod.yaml exec -T db sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "nexora-$(date +%F-%H%M%S).dump"
```

Store backups encrypted and off-host; PostgreSQL volume persistence is not a
backup. Regularly test restore on an isolated database. To restore, stop the
application services, take another backup of the target first, and restore
only into the intended database using `pg_restore`. Verify the target project
name, volume and database before any restore; a restore overwrites database
contents. Do not run a restore command against a development database.

Protect the environment file and Caddy's `caddy_data` volume, which contains
TLS state. The PostgreSQL volume is named from `COMPOSE_PROJECT_NAME` to reduce
accidental sharing. Changing the project name creates a different volume and
does not migrate existing data automatically.

## SMTP and email testing

For local tests, the overlay configures unauthenticated Mailpit SMTP inside the
Compose network; the UI and SMTP host ports bind to loopback. Mailpit is not
present in production. For production, configure a normal SMTP host, port,
TLS mode, sender, and optional paired username/password in `deploy/runtime.env`.
Port 465 normally uses implicit TLS (`SMTP_SECURE=true`); submission on port
587 normally uses STARTTLS (`SMTP_SECURE=false`). Follow the mail server's
published settings and firewall policy.

In local mode, register a disposable account and inspect its message in
Mailpit. Follow the verification link and confirm the account status through
the app. Do not use a real user's account for deployment tests. Delivery
failures are surfaced by the API; they are not reported as successful sends.
Production verification/invitation mail should be tested with an operator-
controlled mailbox and the intended SMTP provider before opening registration
to users.

## Logs and troubleshooting

```sh
docker compose --env-file deploy/runtime.env -p nexora-prod \
  -f compose.prod.yaml ps
docker compose --env-file deploy/runtime.env -p nexora-prod \
  -f compose.prod.yaml logs --tail=200 db migrate api web proxy
```

- **API not starting:** confirm PostgreSQL health, `DATABASE_URL` host `db`,
  migration exit status, required SMTP settings, exact `PUBLIC_APP_URL`, and
  the production domain/HTTPS settings. Do not paste credentials into logs or
  support requests.
- **Migration failed:** inspect the migration output, confirm the backup and
  database target, then resolve the schema issue before restarting the API.
- **No HTTPS:** verify public DNS, host firewall/NAT for 80 and 443, and Caddy
  logs. Local loopback mode intentionally has HTTP only.
- **Email not received:** inspect Mailpit locally, or verify SMTP host, port,
  TLS mode, paired credentials, sender authorization, DNS and egress policy.
- **App/API routing:** only Caddy publishes host ports. Check its routes and
  service health before changing CORS or CSRF policy.

For routine safe shutdown, run `docker compose ... down` without `-v`. This
stops containers but keeps PostgreSQL and Caddy state volumes.
