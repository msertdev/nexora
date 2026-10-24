# Browser end-to-end tests

These Playwright tests exercise the real NEXORA UI and API through the isolated
`nexora-local-test` Compose deployment. They are intentionally separate from
the default test command and CI because they require two verified local users,
organization memberships, and an existing issue.

## Prerequisites

1. Start only the loopback deployment documented in `DEPLOYMENT.md` with the
   project name `nexora-local-test`.
2. Create one member who can access the target issue and a second verified user
   who is not a member of that organization. Use fictional `example.com`
   addresses and Mailpit; do not use real identities or credentials.
3. Install Chromium once:

   ```sh
   pnpm exec playwright install chromium
   ```

## Run

Set credentials only in the current shell. Do not save them in the repository
or paste them into logs. On PowerShell:

```powershell
$env:NEXORA_E2E_BASE_URL = "http://localhost:8080"
$env:NEXORA_E2E_MEMBER_EMAIL = "<fictional member email>"
$env:NEXORA_E2E_MEMBER_PASSWORD = "<local password>"
$env:NEXORA_E2E_NON_MEMBER_EMAIL = "<fictional non-member email>"
$env:NEXORA_E2E_NON_MEMBER_PASSWORD = "<local password>"
$env:NEXORA_E2E_ISSUE_PATH = "/orgs/<slug>/projects/<project-uuid>/issues/<number>"
pnpm test:e2e
```

On POSIX shells, export the same six variables before running
`pnpm test:e2e`. The issue path must be relative and must identify an issue the
member can access. Test traces, screenshots, videos, and HTML reports are
ignored by Git.
