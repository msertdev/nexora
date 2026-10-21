# NEXORA email delivery

NEXORA sends account-verification and workspace-invitation email through
configurable SMTP. No external email API is required. The API fails closed:
email-dependent requests return an error when SMTP is incomplete or unavailable.

## Local development with Mailpit

1. Copy the root `.env.example` to `.env` and replace the placeholder
   `POSTGRES_PASSWORD` with a local-only password. Keep the existing PostgreSQL
   volume; do not use database reset commands.
2. Copy `apps/api/.env.example` to `apps/api/.env` and use the same password in
   `DATABASE_URL`.
3. From the repository root, start the existing database and local mail catcher:

   ```powershell
   docker compose up -d db mailpit
   ```

   This preserves the existing `postgres_data` volume. Mailpit listens only on
   loopback at SMTP `127.0.0.1:1025` and web UI `http://localhost:8025`.
4. Start the NestJS API from `apps/api`, so its existing `.env` loading resolves
   `apps/api/.env`:

   ```powershell
   pnpm --filter api start:dev
   ```

   When NestJS runs directly on the host, configure `SMTP_HOST=127.0.0.1`.
   When the API runs in the same Compose network, use `SMTP_HOST=mailpit`.
   Do not use `localhost` from inside the API container; it refers to that
   container. Mailpit's host ports remain bound to `127.0.0.1`, not public
   interfaces.
5. Open `http://localhost:8025` to view locally captured messages. Mailpit
   accepts unauthenticated, unencrypted SMTP for development only.

Mailpit is not an outbound relay and its inbox is not intended for production.
The Compose service is isolated from public interfaces by its loopback port
bindings. The image currently uses the upstream `latest` tag; pin a reviewed
version or digest when reproducible local infrastructure is required.

## SMTP configuration

Configure these variables for the API process:

| Variable | Requirement | Meaning |
| --- | --- | --- |
| `SMTP_HOST` | Required to send | SMTP hostname or reachable address |
| `SMTP_PORT` | Required with host | SMTP port (for example 587, 465, or local Mailpit 1025) |
| `SMTP_SECURE` | Required with host | `true` for implicit TLS (typically 465); `false` for STARTTLS |
| `SMTP_USER` | Optional | SMTP authentication username |
| `SMTP_PASSWORD` | Optional | SMTP authentication password; configure together with `SMTP_USER` |
| `SMTP_FROM` | Required with host | Sender mailbox, for example `noreply@example.org` |
| `PUBLIC_APP_URL` | Required with SMTP | Public application origin, no path/query/fragment; HTTPS is mandatory in production |

When `SMTP_SECURE=false`, the SMTP client requires STARTTLS except for the
explicit local-development Mailpit configuration (port 1025 on `localhost`,
`127.0.0.1`, or the Compose hostname `mailpit`). TLS certificate verification
is always enabled. Never configure production SMTP to use a plaintext endpoint.
Do not put real credentials in tracked files; use deployment secret injection
for `SMTP_USER` and `SMTP_PASSWORD`.

In production, SMTP host, port, secure mode, sender, and an HTTPS
`PUBLIC_APP_URL` are required at application startup. In development without
SMTP configuration, the API can start, but email requests fail with HTTP 503.
`PUBLIC_APP_URL` is validated as an origin before it is used to build links.

## Verification and invitation behavior

- `POST /api/auth/email-verification/request` requires an authenticated session.
  It creates a cryptographically random, expiring token, stores only its SHA-256
  hash, and sends the link to the account's registered address.
- `POST /api/auth/email-verification/confirm` accepts `{ "token": "..." }`.
  Only confirmation of a live, unused token marks the address verified.
- Verification links carry their token in the URL fragment. Fragments are not
  sent in the HTTP request to the web server. The frontend should read the
  fragment and POST the token to the confirmation endpoint; do not log it.
- Invitation creation sends to the normalized target address and carries the
  invitation token in a fragment. The invitation is revoked if SMTP delivery
  fails, and the API reports an error rather than a false success. The
  authorized creation response retains the one-time invitation link; normal
  invitation listings never contain token material.
- Invitation acceptance still requires an authenticated account with a
  verified email matching the invitation address. Registration alone does not
  verify an account.

For a safe local test, register with an address you can identify (Mailpit does
not deliver externally), request verification, inspect the message in Mailpit,
copy the fragment token into the confirmation request, then create an
invitation and inspect its recipient and link in Mailpit. Do not use real
production tokens or credentials in automated tests; SMTP tests use a mocked
transport. The repository does not yet contain frontend verification/acceptance
screens, so exercise those API routes or implement a client UI separately.

Throttle limits currently use NestJS's in-memory storage. They are per-process;
configure a shared throttler storage backend before running multiple API
instances if cross-instance rate limits are required.
