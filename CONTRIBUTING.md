# Contributing to NEXORA

Thanks for considering a contribution. Keep changes focused, explain the
problem they solve, and include tests or reproducible steps when behavior
changes.

## Before you start

- Search existing issues and pull requests for related work.
- For a significant feature or architectural change, open an issue first to
  agree on scope.
- Do not include secrets, production data, session cookies, invitation or
  verification tokens, or local environment files.
- Do not add dependencies without explaining why the existing stack is
  insufficient.

## Development setup

Requirements: Node.js 24 or later, pnpm 11.25.0, and Docker Compose v2 for
database-backed local testing.

```sh
corepack enable
pnpm install --frozen-lockfile
```

Use the isolated Compose setup in [DEPLOYMENT.md](DEPLOYMENT.md) for local
email/database flows. Do not point tests or local services at production,
acceptance, or another developer's database.

## Checks

Run the checks relevant to your change. For a broad application change, run:

```sh
pnpm install --frozen-lockfile
pnpm --filter api lint
pnpm --filter api build
pnpm --filter api test
pnpm --filter api exec prisma validate --config prisma7.config.ts
pnpm --filter web lint
pnpm --filter web check-types
node --test apps/web/lib/*.spec.mjs
pnpm --filter web build
pnpm --filter docs lint
pnpm --filter docs check-types
pnpm --filter docs build
pnpm audit --prod
git diff --check
```

For deployment changes, also validate both Compose configurations and build the
affected Docker images. Never use destructive database or volume commands
against a non-disposable environment.

## Pull requests

- Describe the user-facing or operational impact.
- Link related issues and list the exact checks run, including failures or
  skipped checks.
- Include screenshots only for real UI changes, captured from the application;
  remove personal information and secrets first.
- Call out migrations, configuration changes, new permissions, or security
  assumptions explicitly.
- Keep each pull request reviewable and avoid unrelated formatting churn.

No project license has been selected yet. Discuss licensing and redistribution
terms with the maintainer before submitting code that depends on a particular
license being granted.
