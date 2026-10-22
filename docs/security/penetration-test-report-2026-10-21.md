# NEXORA Controlled Penetration Test Report

**Assessment date:** 2026-10-21
**Target:** Dedicated local Compose project `nexora-pentest`
**Target origin:** `http://localhost:18187` (loopback only)
**Baseline:** `main` at `50cbf1eb179f3c3605d7e516ead1bb52446ca58a`; worktree already contained unrelated tracked and untracked changes
**Scope:** Bounded application/API and deployment checks against this isolated target only

## Executive summary

Real HTTP requests were sent to the isolated NEXORA deployment. The final evaluated exercise comprised **106 application test requests**: 97 in the consolidated API test run, six rate-limit requests after a clean cooldown, and three requests verifying what an unverified registrant can do. This excludes deployment health checks, header probes, Mailpit API retrieval, and preliminary harness calibration attempts.

The consolidated run recorded 118 assertions: 116 matched their initial expected results. Two login-rate assertions expected `401` but received `429` because earlier login probes shared the same rate-limit window. After waiting for the window to reset, a dedicated six-request test produced the expected `401, 401, 401, 401, 401, 429` sequence. This was a test expectation/window issue, not a bypass.

**Confirmed low-severity findings:** the invitation-creation response contains a bearer invitation URL that the current frontend discards, and the live web response lacked common browser-hardening headers. **Conditional policy concern:** public registration accepts unverified accounts, which can log in and create organizations; no registration-disable or invite-only setting was found. Severity depends on the operator's registration policy.

No cross-organization access or unauthorized RBAC mutation succeeded in the tested cases. This is evidence for the exercised routes and identities, not proof of complete security or OWASP coverage.

## Environment and isolation evidence

- Inspected Git baseline and Docker projects before starting. Existing `nexora-acceptance` and development containers were running separately and were not changed.
- Built and started `compose.prod.yaml` plus `compose.local-test.yaml` under the unique Compose project `nexora-pentest`.
- The test deployment has its own PostgreSQL volume, `nexora-pentest_postgres_data`, plus its own `nexora-pentest_backend` and `nexora-pentest_ingress` networks.
- PostgreSQL, API, and web had no host-published ports. Caddy was published only on `127.0.0.1:18187` and `127.0.0.1:18447`; Mailpit was published only on `127.0.0.1:11036` and `127.0.0.1:18036`.
- Live API database health returned `200` with `{"status":"ok","database":"connected"}`. API, database, web, and Mailpit reported healthy; the migration container exited successfully.
- The isolated database was initially created on its own empty volume. Final contents were synthetic test data only: 25 users, 7 organizations, 16 memberships, 6 projects, 21 issues, and 18 invitations. The test volume and containers remain in place by request.
- API and web runtime containers ran as UID 1000 and were not privileged. The database, proxy, and Mailpit container exec defaults were UID 0; `Privileged=false` and no extra capabilities were configured. Compose does not set `cap_drop`, `read_only`, or `no-new-privileges`. PostgreSQL's actual server process UID was not separately verified.
- `.dockerignore` excludes `.env` files. No `.env`, PEM, or key files were found in the final API or web image filesystems. A heuristic tracked-source scan found only password-like test fixtures in `apps/api/src/auth/auth.controller.spec.ts`; no production credential was identified. API and proxy logs were checked for token-fragment URLs; none were found. No secret values are included in this report.
- No database reset, `down -v`, volume removal, commit, push, or cleanup was performed. Repository changes that existed at the baseline were preserved; this report is the only workspace file added for this assessment.

### Reproduction commands

The Compose commands below used a session-private env file with newly generated local-only database credentials. Those values are deliberately not recorded here.

```powershell
docker compose --env-file "<session-private nexora-pentest.env>" -p nexora-pentest `
  -f compose.prod.yaml -f compose.local-test.yaml config --format json

docker compose --env-file "<session-private nexora-pentest.env>" -p nexora-pentest `
  -f compose.prod.yaml -f compose.local-test.yaml up -d --build

docker compose --env-file "<session-private nexora-pentest.env>" -p nexora-pentest `
  -f compose.prod.yaml -f compose.local-test.yaml ps

curl.exe -sS http://localhost:18187/api/health/db
```

The existing test environment can be stopped without deleting its volume using the same Compose arguments with `stop`. Do not use `down -v`.

## API attack surface inventory

The route inventory below reflects the inspected NestJS controllers and live API paths. All unsafe HTTP methods are subject to the global exact-Origin CSRF guard; requests with missing or forged `Origin` returned `403`. DTO validation transforms input, whitelists declared fields, and rejects unknown fields. The configured global limit is 60 requests per 60 seconds, with tighter endpoint limits noted.

Controller and control references: [AuthController](../../apps/api/src/auth/auth.controller.ts), [OrganizationsController](../../apps/api/src/organizations/organizations.controller.ts), [TeamCollaborationController](../../apps/api/src/organizations/team-collaboration.controller.ts), [ProjectsController](../../apps/api/src/projects/projects.controller.ts), [IssuesController](../../apps/api/src/projects/issues.controller.ts), [CsrfGuard](../../apps/api/src/auth/csrf.guard.ts), and [API bootstrap](../../apps/api/src/main.ts).

| Method and route | Authentication / role | Scope and sensitive operation | Validation / controls |
|---|---|---|---|
| `GET /` | Public | API root | No mutation |
| `GET /api/health` | Public | Application health | No mutation |
| `GET /api/health/db` | Public | Database availability status | Read-only; no connection details returned |
| `POST /api/auth/register` | Public | Account creation | Email/name/password DTO; 5/minute; email verification is not required to register |
| `POST /api/auth/login` | Public | Session creation | Email/password DTO; 5/minute; session token is set as cookie, not JSON |
| `POST /api/auth/logout` | Session | Session revocation | Exact-Origin CSRF check |
| `POST /api/auth/email-verification/request` | Session | Sends verification email to current user | 3/minute; exact-Origin CSRF check |
| `POST /api/auth/email-verification/confirm` | Public bearer token | Verifies account | Token DTO; 10/minute; single-use/expiry checked |
| `GET /api/auth/me` | Session | Current account | Read-only |
| `POST /api/organizations` | Session; any authenticated account | Creates organization and OWNER membership | Name DTO; no email-verification check observed |
| `GET /api/organizations` | Session | Caller’s organizations only | User-scoped query |
| `GET /api/organizations/:organizationId` | Session + membership | Organization details | OWNER/ADMIN/MEMBER |
| `GET /api/organizations/:organizationId/members` | Session + membership | Member details | OWNER/ADMIN/MEMBER |
| `POST /api/organizations/:organizationId/invitations` | Session + membership; OWNER/ADMIN; service restricts ADMIN to MEMBER invitations | Sends invitation | Role/email DTO; 10/minute; invitation token is included in the creation response |
| `GET /api/organizations/:organizationId/invitations` | Session + membership; OWNER/ADMIN | Pending invitation metadata | Token/hash/link omitted from list response |
| `POST /api/organizations/:organizationId/invitations/:invitationId/revoke` | Session + membership; OWNER/ADMIN | Revokes invitation | 10/minute; service enforces role rules |
| `PATCH /api/organizations/:organizationId/members/:userId` | Session + membership; OWNER only | Changes ADMIN/MEMBER role | OWNER target cannot be changed; DTO rejects other roles |
| `DELETE /api/organizations/:organizationId/members/:userId` | Session + membership; service authorizes OWNER to remove ADMIN/MEMBER and ADMIN to remove MEMBER | Removes member and clears their issue assignments | Service denies MEMBER action and protects OWNER membership |
| `POST /api/invitations/accept` | Session; verified account with matching invitation email | Accepts one invitation | 10/minute; token, expiry, revocation, recipient, and replay checks |
| `GET /api/organizations/:organizationId/projects` | Session + organization membership | Lists projects in organization | Pagination/filter DTO |
| `POST /api/organizations/:organizationId/projects` | Session + membership; OWNER/ADMIN | Creates project | Project DTO; normalized project key |
| `GET /api/organizations/:organizationId/projects/:projectId` | Session + membership | Reads project scoped to organization | UUID route validation |
| `PATCH /api/organizations/:organizationId/projects/:projectId` | Session + membership; OWNER/ADMIN | Updates project | Update DTO; scoped lookup |
| `GET /api/organizations/:organizationId/projects/:projectId/issues` | Session + organization membership | Lists project issues | Pagination/status/priority/assignee DTO |
| `POST /api/organizations/:organizationId/projects/:projectId/issues` | Session + organization membership; any member | Creates issue and allocates number | Issue DTO; assignee must be a member of the same organization |
| `GET /api/organizations/:organizationId/projects/:projectId/issues/:issueId` | Session + organization membership | Reads issue scoped to project | UUID route validation |
| `PATCH /api/organizations/:organizationId/projects/:projectId/issues/:issueId` | Session + organization membership; any member | Updates issue/assignee | Explicit field mapping and same-organization assignee check |

No project, issue, or organization deletion route was found in the inspected controllers.

## Coverage matrix

| Area | Executed test | Result |
|---|---|---|
| Unauthenticated access | `/me`, organizations, issue collection | `401` |
| Public health | Database health | `200`, safe status only |
| Login/account enumeration | Wrong password for known and nonexistent users | Both `401`; same generic message |
| Rate limiting | Six login attempts after a clean cooldown | Five `401`, then `429` |
| Session lifecycle | Fixed-cookie login, logout, reuse old session | Login replaced supplied cookie; logout `204`; replay `401` |
| Cookie flags | Local HTTP development response | `HttpOnly`, `SameSite=Lax`, `Path=/api`; no `Secure` in the expected development mode |
| CSRF / Origin | Unsafe requests without Origin and with forged Origin | Both `403` |
| Registration policy | Public registration, login, and organization creation before verification | `201`, `200`, `201`; account remained unverified |
| Verification | Mailpit delivery, confirmation, reuse, malformed token | Mail sent; confirmation `200`; reuse `409`; malformed token `400` |
| Invitations | Wrong recipient, unverified recipient, accepted/replayed, revoked, expired, malformed, OWNER role injection | Wrong/unverified denied `403`; accept `201`; replay `409`; revoked/expired `410`; malformed/OWNER assignment rejected |
| RBAC | Member/admin role change, invitation and member-removal attempts; owner role change | Unauthorized operations denied; owner role change succeeded; owner membership protected |
| Tenant isolation | Beta member against Alpha project/issue; Alpha owner against Beta issue | `404` for cross-tenant resource lookups; cross-tenant assignee rejected `400` |
| Assignee handling | Same-tenant assign and unassign | `200`; follow-up API representation reflected assignment then null |
| Mass assignment | `ownerId`, `organizationId`, `role`, and invitation role fields | Rejected `400`; `__proto__`-like input was accepted, but no unauthorized fields/effect appeared in the issue response |
| SQL-like input | Bounded SQL metacharacters in issue title | Stored and returned as literal title; no injection observed in this probe |
| HTML-like input | Bounded image/event-handler string in issue title | Returned as JSON string; browser rendering/execution was not tested |
| Malformed and oversized input | Malformed JSON; title/description over DTO bounds; repeated status parameters | Rejected `400`; malformed error contained no stack/path indicators |
| Issue-number race | Two concurrent issue creates | Both succeeded and received distinct issue numbers |
| Headers and CORS | Live web root and health response with allowed/forged Origin | CORS response advertised only configured origin; common hardening headers absent on root |
| Logs and image files | Test token-pattern scan of API/proxy logs; final image file-name scan | No token-fragment URLs in scanned logs; no `.env`, PEM, or key files found |
| Container exposure | Compose inspection and `docker inspect` | Only loopback proxy/Mailpit ports; no direct DB/API/web host ports; containers not privileged |

## Confirmed findings

### PENTEST-01 — Invitation bearer link returned unnecessarily in create response

- **Severity:** LOW
- **Confidence:** High for observed behavior; moderate for practical impact
- **Affected endpoint:** `POST /api/organizations/:organizationId/invitations`
- **Preconditions:** Authenticated OWNER or ADMIN with invitation permission.
- **Evidence:** A real invitation request returned `201` and included `invitationLink` containing a bearer token. The raw URL/token is redacted. The same link was delivered through the isolated Mailpit flow. The pending-invitation list omitted token, token hash, and link. The current web UI awaits the create response but discards `invitationLink`.
- **Impact:** The link is exposed to the authorized caller's browser JavaScript and any API response telemetry or body logging that may exist outside this test. An attacker still needs a verified account whose email matches the invitation, which limits the value of token theft. No invitation token fragment was found in the scanned API/proxy logs.
- **Root cause:** The invitation service returns the generated URL as `invitationLink` after sending it by email.
- **Code reference:** [TeamCollaborationService](../../apps/api/src/organizations/team-collaboration.service.ts).
- **Recommended remediation:** Stop returning the bearer URL if no supported user flow needs it. If a deliberate “copy invite link” feature is required, document the threat model, restrict access, avoid response-body logging, and add tests that list endpoints never expose tokens.
- **Regression test:** Assert creation responses omit `invitationLink` unless a product requirement explicitly retains it; continue asserting list responses never include `token`, `tokenHash`, or the link.

### PENTEST-02 — Common browser-hardening headers absent on web response

- **Severity:** LOW
- **Confidence:** High for the tested response
- **Affected component:** Web response through Caddy at `/`
- **Preconditions:** None; unauthenticated request.
- **Evidence:** `GET http://localhost:18187/` returned `200`. The live response did not include `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, or `Permissions-Policy`. The inspected Caddy configuration only routes `/api/*` to the API and other traffic to web.
- **Impact:** Reduced defense-in-depth against browser content injection, framing, and content-type confusion. This test did not establish an exploitable XSS or clickjacking path.
- **Root cause:** No security-header policy was observed in the live response or Caddy routing configuration.
- **Code reference:** [Caddyfile](../../deploy/Caddyfile) and [API bootstrap](../../apps/api/src/main.ts).
- **Recommended remediation:** Define and verify a production header policy (at minimum `nosniff`, an appropriate frame policy, and a tested CSP/`frame-ancestors`; add a restrictive referrer and permissions policy). Add HSTS only for HTTPS production deployments after confirming the full domain/subdomain policy.
- **Regression test:** Assert expected headers through the deployed proxy on both web and API responses. Validate CSP against actual Next.js assets and flows before enforcement.

## Suspected / policy-dependent concern

### PENTEST-03 — Public registration has no observed disable/invite-only control

- **Severity:** MEDIUM if registration should be restricted; otherwise an intentional product setting
- **Confidence:** High that the behavior exists; low-to-moderate that it violates intended policy
- **Affected endpoints:** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/organizations`
- **Preconditions:** Network reachability to the application; no account required initially.
- **Evidence:** A synthetic user registered successfully (`201`) with `emailVerified=false`, logged in (`200`), and created an organization (`201`) without verifying the email. The route is public and the searched application/deployment configuration did not expose an administrator setting to disable registration or enforce invite-only signup. Login/register throttles reduce but do not remove the behavior.
- **Impact:** On an internet-reachable instance this permits unsolicited account and workspace creation, creating potential abuse, spam, and resource-consumption costs. No cross-tenant data exposure was demonstrated.
- **Root cause:** Registration is unconditionally enabled; email verification is not a prerequisite for login or organization creation.
- **Code reference:** [AuthController](../../apps/api/src/auth/auth.controller.ts), [AuthService](../../apps/api/src/auth/auth.service.ts), and [OrganizationsController](../../apps/api/src/organizations/organizations.controller.ts).
- **Recommended remediation:** Decide and document the product policy. If private deployments must restrict signup, add a default-safe operator setting for disabled/invite-only registration and enforce it server-side; consider requiring verified email before organization creation. If public signup is intended, document it and provide abuse controls.
- **Regression test:** Test both enabled and disabled registration modes, including that disabled registration creates no user and that an unverified account cannot create an organization when verification is required.

## False positives and not-tested areas

### False positives / non-findings for tested probes

- **Prototype-like field:** A JSON `__proto__`-like property received `201`, but the issue response contained no role/owner/organization property and the inspected issue service explicitly maps DTO fields into database input. No prototype-pollution effect was observed. Other tested mass-assignment fields were rejected.
- **SQL injection:** The bounded SQL-like title was preserved literally. This is a narrow negative result, not proof that all query paths are safe.
- **Cross-tenant access:** The tested resource-ID substitutions returned `404` or `400`; no unauthorized read/update was observed.

### Not tested

- Browser execution/rendering of stored HTML-like issue content; the API probe only established JSON behavior.
- Production HTTPS cookie behavior, HSTS, external reverse-proxy trust, and certificate configuration. The isolated target intentionally used local HTTP with `NODE_ENV=development`; `Secure` cookies were therefore not expected. Production cookie behavior was not claimed as live-tested.
- Full UI workflows, keyboard/browser security, OAuth/SSO, password reset, backup/restore, external SMTP, distributed rate-limit behavior, and multi-replica deployment.
- Broad SQL injection fuzzing, exhaustive business-logic permutations, high-concurrency races, denial-of-service testing, and full OWASP ASVS coverage.
- OWASP ZAP and Semgrep: neither executable nor image was available locally, and none was installed or claimed to have run.
- Independent review of every dependency or historical Git object. The known full dependency audit residual (`braces@3.0.3`, HIGH, development tooling; no fixed version listed) remains separate from this HTTP assessment. The previously reported production dependency audit was clean; it was not rerun as part of this test.

## Remediation priorities

1. Decide whether public self-registration and unverified workspace creation are intended for every self-hosted deployment. If not, add/enforce an operator-controlled registration policy before public exposure.
2. Remove `invitationLink` from the create response if the UI does not need it; retain one-time/email-recipient validation and add response-shape regression tests.
3. Add a deliberate, tested browser security-header policy, especially CSP and `nosniff`, without breaking Next.js assets.
4. Before production release, test `Secure` cookies and Caddy/TLS behavior against the actual HTTPS deployment configuration and trusted proxy boundary.
5. Continue tracking the known development-only `braces` HIGH dependency advisory; do not treat the clean production audit as proof that the entire toolchain is vulnerability-free.

## Test commands and retained environment

The actual target was configured and launched with:

```powershell
docker compose --env-file "<session-private nexora-pentest.env>" -p nexora-pentest `
  -f compose.prod.yaml -f compose.local-test.yaml config --format json
docker compose --env-file "<session-private nexora-pentest.env>" -p nexora-pentest `
  -f compose.prod.yaml -f compose.local-test.yaml up -d --build
curl.exe -sS http://localhost:18187/api/health/db
```

The API requests were sent by a bounded Python `urllib` harness to `127.0.0.1:18187`, with the configured browser Origin and isolated synthetic accounts. Verification and invitation messages were fetched only from the dedicated Mailpit service. Tokens and session cookies were held in memory, redacted from output, and not stored in this report. A temporary sanitized evidence summary is stored in session-private workspace state; it contains no credentials or bearer tokens.

No request was sent to a public website, GitHub, another host, or a third-party SMTP service. The pentest Compose project, synthetic records, and dedicated volumes remain running/present intentionally.

## Remediation and regression follow-up — 2026-10-21

The findings above describe the original baseline. This follow-up records the fixes and retest against the same loopback-only `nexora-pentest` project after rebuilding the API and web images. The worktree remained dirty throughout; the baseline commit is unchanged. No database reset, volume removal, commit, or push was performed.

### Results by finding

| Finding | Remediation and live evidence | Status |
|---|---|---|
| PENTEST-01 — Invitation bearer-link exposure | Invitation creation still sends the link through isolated Mailpit but no longer returns a URL or token in its `201` JSON response. Pending-list responses omit link/token/hash fields. The API regression test checks both response secrecy and delivery continuity. The live retest checked 52 emailed invitation tokens against API container logs and found zero matches. | Resolved for the tested create/list responses and logs. |
| PENTEST-02 — Browser security headers | Caddy sends `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and a restrictive `Permissions-Policy`; API responses use a no-content CSP. Next.js sends a per-request nonce CSP without `unsafe-inline` or `unsafe-eval`. Live `/`, `/login`, and `/register` responses had all expected headers; 31 rendered script tags used their response's nonce, all three page nonces differed, and no inline `style` attributes were present. Headless Chrome completed registration, login, workspace/project/issue creation, Inbox and Roadmap navigation, with zero CSP, hydration, or unexpected JavaScript errors. | Resolved for the tested production-mode localhost deployment. The single browser console network error was the expected unauthenticated `GET /api/auth/me` (`401`) before login. |
| PENTEST-03 — Uncontrolled public registration | `REGISTRATION_MODE=public` allowed synthetic signup; `invite-only` rejected signup without a token, with a malformed token, and with a token for another email (`403`). A matching invitee registered, verified email, and accepted the invitation; replay returned `409`. The accepted role remained the invited `MEMBER`/`ADMIN`, never `OWNER`; registration alone created no membership. Production Compose configuration without an override resolves to `invite-only`. | Resolved for the tested public and invite-only flows. |

### Live HTTP retest coverage

The bounded harness made **44 API security-test requests** and recorded **68 response/state assertions; all 68 passed**. Additional health probes, Compose restarts, and Mailpit retrieval are excluded from that count. The checks included public registration, invite-only denials and invited signup, email verification and invitation delivery/acceptance/replay, invitation response/list secrecy, unauthorized invitation and role changes, post-attempt membership-state reads, cross-tenant issue access and assignment, missing/forged Origin, cookie `HttpOnly`/`SameSite=Lax`, logout, and old-session replay. Unauthorized role mutations returned `403`; follow-up owner reads showed the owner remained `OWNER` and the member remained `MEMBER`. Cross-tenant reads returned `404`, cross-tenant assignment returned `400`, and old-session replay returned `401`.

The report's earlier API inventory and coverage matrix remain a historical account of the initial baseline. The implementation now additionally accepts `invitationToken` only for invite-only signup; that token is submitted in the registration body rather than an API response or URL query. New account creation does not accept or assign an organization role; membership and its restricted role are applied only through the existing verified-email invitation acceptance flow.

### Production-mode browser and HTTPS validation

A second, separate Compose project (`nexora-release-tls`) was created with a fresh dedicated PostgreSQL volume, no real user data, and only loopback-published HTTP/HTTPS ports. Its API ran with `NODE_ENV=production`; public registration was explicitly enabled for the disposable browser scenario. No development or acceptance database was used. Database, migration, API, web, and Caddy services started successfully.

Installed headless Google Chrome exercised the actual production-mode Next.js UI over Caddy TLS. It registered and signed in a disposable account, verified the browser session remained HttpOnly and inaccessible to `document.cookie`, created a workspace, project, and issue, and navigated Inbox and Roadmap. Chrome reported **zero CSP violations, zero hydration/runtime errors, and zero unexpected JavaScript errors**. The only console network error was an expected `401` for the initial unauthenticated session lookup before login. The browser confirmed the session cookie had `Secure`, `HttpOnly`, and `SameSite=Lax`; an authenticated `/api/auth/me` request returned `200`.

The actual interface was captured at [docs/images/nexora-workspace.png](../images/nexora-workspace.png). This is a screenshot of the running app, not a mockup; it contains only synthetic demonstration data.

The HTTPS probe used Caddy's automatically generated **local internal certificate**, and Chrome was launched with certificate errors ignored so it could exercise the local deployment. TLS transport and production cookie behavior were verified, but public CA issuance, certificate-chain/hostname trust for a real production domain, and external DNS/firewall behavior were **not** tested. The current Caddy response did not include HSTS; HSTS policy should be decided and checked against the actual production domain and subdomain topology before enabling it.

### Validation after remediation

- `pnpm install --frozen-lockfile` — passed.
- `pnpm audit --prod` — no known production advisories.
- `pnpm audit` — **one HIGH advisory remains**: `braces@3.0.3`, `GHSA-vfj7-8cjw-p6xm`, via `@repo/eslint-config > @next/eslint-plugin-next > fast-glob > micromatch > braces`; the audit lists no patched version. This development-tooling advisory remains a separate release/toolchain risk and is not hidden by the clean production audit.
- API lint/build — passed; Vitest — 67 tests passed.
- Web lint/type-check/build — passed; frontend Node regression tests — 10 passed.
- Docs lint/type-check/build — passed.
- `prisma validate --config prisma7.config.ts` — passed.
- Docker API, migration, and web image builds — passed. API and web were recreated from those images; the isolated database health endpoint returned `200`/`connected`.
- Production plus local-test Compose configuration — valid. Sanitized production config confirmed the invite-only registration default.
- The built bootstrap CLI rejected empty non-TTY input before accessing the database; no input or bootstrap data was supplied.
- Headless Chromium against the separate production-mode TLS deployment — registration, login, Secure cookie, workspace, project, issue, and Inbox/Roadmap navigation passed; zero CSP, hydration, or unexpected JavaScript errors.

### Remaining limitations and release actions

- PENTEST-02 passed the tested browser flows, but this does not cover all browsers, extensions, accessibility modes, or every route. If a CSP compatibility issue is found, adjust narrowly with nonces rather than adding broad inline/eval allowances.
- Validate public CA certificate issuance, production DNS/firewall, HSTS policy, and the actual trusted-proxy boundary on the intended public deployment.
- Track and remediate or explicitly accept the unresolved `braces@3.0.3` development-tooling HIGH advisory before release; do not characterize the complete dependency tree as vulnerability-free.
- These results are bounded regression evidence, not a full OWASP assessment. Independent human penetration testing remains recommended before a first public release.

## Dependency advisory follow-up — 2026-10-22

A fresh audit identified two newly published Next.js advisories affecting the
previously pinned `16.3.8` release: `GHSA-2464-fhr4-w9xw` (critical) and
`GHSA-p3m5-59mp-jv5r` (high). Both the web and documentation applications, plus
the matching ESLint plugin, were updated to Next.js `16.4.2`.

After the update, `pnpm install --frozen-lockfile`, web and documentation lint,
type-check, and production builds passed. Fresh API, migration, and web Docker
images also built successfully. `pnpm audit --prod` returned no known
vulnerabilities. The full `pnpm audit` still reports only the previously
documented `braces@3.0.3` development-tooling advisory
(`GHSA-vfj7-8cjw-p6xm`), for which the audit currently lists no patched
version.

## Next.js 16.4.2 browser smoke follow-up — 2026-10-22

After the dependency update, the existing production web build was served on a
loopback-only port and exercised with the installed stable Google Chrome in
headless mode. The `/`, `/login`, and `/register` routes each returned `200`,
rendered Next.js markup, and supplied a per-response nonce CSP. Chrome exited
successfully for all three routes with no observed CSP refusal, hydration
error, uncaught exception, `TypeError`, or `ReferenceError`.

This follow-up did not start Docker, change a database, register a user, or
repeat the authenticated workspace flow. The earlier isolated HTTPS test still
provides the end-to-end evidence for Secure cookies and authenticated
navigation; this narrower follow-up confirms that the Next.js `16.4.2` update
did not break the public production-rendered routes or their nonce CSP.
