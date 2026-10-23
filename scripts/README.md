# NEXORA browser captures

`capture-screenshots.mjs` records the real loopback-only NEXORA interface with
Playwright. It does not mock API responses or persist browser authentication
state. Each run captures five desktop screens in both themes, one mobile issue
list, and a 20–30 second issue-workflow video with a visible animated cursor.

Raw PNGs, Playwright video, palette, and conversion intermediates stay in an
external run directory. Only named, size-checked final WebP, GIF, and WebM
assets are published to `docs/images` after every conversion succeeds.

## Prerequisites

- Node.js 24 or newer.
- Docker Engine and Docker Compose v2 for the isolated local deployment.
- A running `nexora-local-test` stack at <http://localhost:8080>, with Mailpit
  at <http://localhost:8026>.
- The local demo manifest loaded by `scripts/demo-seed.mjs`:
  - owner: `NEXORA Demo Owner <demo.owner@nexora.test>`;
  - team: `NEXORA Demo Admin`, `NEXORA Demo Engineer`, and
    `NEXORA Demo Reviewer`;
  - workspace: `NEXORA AI Lab (Demo)`;
  - project: `NEXORA AI Agent v1 (AGENT)`;
  - issues: `Define agent execution contract`, `Build planner and executor
loop`, and `Implement tool registry and permission policy`.
- Playwright installed in a throwaway directory outside this checkout. Do not
  add it to the monorepo merely to run captures.
- FFmpeg available as `ffmpeg`, or through `FFMPEG_PATH`, with the `libwebp`,
  `gif`, and `libvpx-vp9` encoders.

Verify FFmpeg before starting:

```text
ffmpeg -hide_banner -encoders
```

Create an external Playwright installation with npm. Chromium is installed by
that external Playwright package, normally in Playwright's user cache.

POSIX shell:

```sh
export NEXORA_PLAYWRIGHT_DIR="$(mktemp -d)"
export PLAYWRIGHT_BROWSERS_PATH="$NEXORA_PLAYWRIGHT_DIR/ms-playwright"
npm install --prefix "$NEXORA_PLAYWRIGHT_DIR" --no-save playwright
npm exec --prefix "$NEXORA_PLAYWRIGHT_DIR" -- playwright install chromium
```

PowerShell:

```powershell
$env:NEXORA_PLAYWRIGHT_DIR = Join-Path ([IO.Path]::GetTempPath()) "nexora-playwright"
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:NEXORA_PLAYWRIGHT_DIR "ms-playwright"
npm install --prefix $env:NEXORA_PLAYWRIGHT_DIR --no-save playwright
npm exec --prefix $env:NEXORA_PLAYWRIGHT_DIR -- playwright install chromium
```

On Linux, install the Chromium system libraries required by Playwright using
the supported package-manager command for that host.

## Environment

| Variable                   | Required | Purpose                                                                                                                            |
| -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `BASE_URL`                 | Yes      | Loopback-only NEXORA web origin; use `http://localhost:8080` for the documented local stack                                        |
| `NEXORA_PLAYWRIGHT_DIR`    | Yes      | External directory containing `node_modules/playwright`                                                                            |
| `PLAYWRIGHT_BROWSERS_PATH` | No       | External Chromium cache; set it during both browser installation and capture when using an isolated cache                          |
| `NEXORA_DEMO_PASSWORD`     | Yes      | 12–128 character password shared by the synthetic seed accounts; deleted from the child process environment before Chromium starts |
| `NEXORA_DEMO_EMAIL`        | No       | Seed owner email; defaults to `demo.owner@nexora.test`                                                                             |
| `NEXORA_CAPTURE_OUTPUT`    | No       | External parent directory for raw artifacts; defaults to a verified OS temporary directory                                         |
| `NEXORA_ASSET_OUTPUT`      | No       | Final-asset directory inside the checkout; defaults to `docs/images`                                                               |
| `NEXORA_CAPTURE_DATE`      | No       | Seed: UTC date (`YYYY-MM-DD`); capture: ISO-8601 browser timestamp. Both default to the current UTC date                           |
| `FFMPEG_PATH`              | No       | FFmpeg executable path; defaults to `ffmpeg`                                                                                       |

`BASE_URL` rejects non-loopback hosts, credentials, paths, query strings, and
fragments. Playwright and raw capture paths are rejected when they resolve
inside the repository. The final asset path is rejected unless it resolves to
a subdirectory inside this repository.

## Start and seed localhost:8080

From the repository root, copy `deploy/runtime.local.env.example` to
`deploy/runtime.env`. Replace the database password placeholders with a new
local-only password and its URL-encoded equivalent, then start the isolated
stack:

```sh
docker compose --env-file deploy/runtime.env -p nexora-local-test \
  -f compose.prod.yaml -f compose.local-test.yaml up -d --build
```

Read the synthetic demo password without hard-coding it in a file or command.
The same password is used for all four disposable seed accounts.

POSIX shell:

```sh
printf "Demo password: "
read -r -s NEXORA_DEMO_PASSWORD
printf "\n"
export NEXORA_DEMO_PASSWORD
export NEXORA_DEMO_BASE_URL="http://localhost:8080"
export NEXORA_DEMO_MAILPIT_URL="http://localhost:8026"
export NEXORA_CAPTURE_DATE="$(date -u +%F)"
node scripts/demo-seed.mjs
```

PowerShell:

```powershell
$secret = Read-Host "Demo password" -AsSecureString
$env:NEXORA_DEMO_PASSWORD = [Net.NetworkCredential]::new("", $secret).Password
$env:NEXORA_DEMO_BASE_URL = "http://localhost:8080"
$env:NEXORA_DEMO_MAILPIT_URL = "http://localhost:8026"
$captureDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
$env:NEXORA_CAPTURE_DATE = $captureDate
node scripts/demo-seed.mjs
```

## Capture and publish

Keep the password environment variable from the seed step, then run the
capture. These commands place raw files outside the checkout and publish only
the size-checked final candidates under `docs/images`. Inspect every candidate
for fictional data, error states, and accidental disclosure before committing.

POSIX shell:

```sh
export BASE_URL="http://localhost:8080"
export NEXORA_CAPTURE_OUTPUT="$(mktemp -d)"
export NEXORA_ASSET_OUTPUT="docs/images"
export NEXORA_CAPTURE_DATE="${NEXORA_CAPTURE_DATE}T12:00:00.000Z"
raw_video="$(node scripts/capture-screenshots.mjs)"
printf "Raw video: %s\n" "$raw_video"
unset NEXORA_DEMO_PASSWORD
```

PowerShell:

```powershell
$env:BASE_URL = "http://localhost:8080"
$env:NEXORA_CAPTURE_OUTPUT = Join-Path ([IO.Path]::GetTempPath()) "nexora-captures"
$env:NEXORA_ASSET_OUTPUT = "docs/images"
$env:NEXORA_CAPTURE_DATE = "${captureDate}T12:00:00.000Z"
$rawVideo = node scripts/capture-screenshots.mjs
Write-Output "Raw video: $rawVideo"
Remove-Item Env:NEXORA_DEMO_PASSWORD
```

With the same environment already set, the exact rerun command is:

```text
node scripts/capture-screenshots.mjs
```

Every invocation uses a unique external run directory. The video creates one
additional synthetic issue, so use a disposable database and reseed a pristine
local volume before a polished rerun if the list must contain only manifest
issues.

## Outputs and checks

The sole standard-output line is the absolute raw `.webm` path. Progress and
the final asset directory are written to standard error.

External raw output contains:

- `desktop-light-{issue-list,issue-detail,create-issue,members-roles,roadmap}.png`;
- `desktop-dark-{issue-list,issue-detail,create-issue,members-roles,roadmap}.png`;
- `mobile-dark-issue-list.png`;
- `raw-video/` and `final-staging/` intermediates.

The final asset directory receives only:

- `nexora-issue-list-light.webp` and `nexora-issue-list-dark.webp`;
- `nexora-issue-detail.webp`, `nexora-create-issue.webp`,
  `nexora-members-roles.webp`, and `nexora-roadmap.webp`;
- `nexora-mobile-issue-list.webp`;
- `nexora-demo.gif` and `nexora-demo.webm`.

Each WebP must be smaller than 500,000 bytes. The GIF is generated at 12 fps,
tries widths from 1000 to 900 pixels, and must remain below 5,000,000 bytes.
The WebM fallback is a metadata-stripped VP9 encode. Existing named finals are
replaced only after every staged file passes generation and size checks; a
failed publication attempts to restore the previous set.

Desktop captures use a `1440 × 900` CSS-pixel viewport at device scale factor 2. The mobile capture uses `390 × 844` at device scale factor 2. Before every
still, the script rejects visible alerts and transient notices, plus browser
console, page, and HTTP errors observed after login. The video uses a local DOM
cursor overlay, keeps authentication out of the recording, and fails if a
successful local run exceeds 30 seconds.

The browser clock override affects only JavaScript `Date` reads in the page.
Network requests and API responses are not intercepted or rewritten.
