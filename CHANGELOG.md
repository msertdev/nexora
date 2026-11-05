# Changelog

All notable changes to NEXORA are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-11-05

### Added

- Issue comments: a comment thread in the issue detail panel with paging,
  create, edit and delete. Authors can edit their own comments; authors and
  `ADMIN`/`OWNER` members can delete them. Additive database migration
  `20261104000000_issue_comments` (#27, #34). Thanks @codekongdev!
- Code of conduct for contributors.

### Changed

- Production dependencies updated (minor and patch releases).

## [0.1.0] - 2026-11-03

First preview release. NEXORA is usable for self-hosted evaluation; an
independent human penetration test has not yet been completed (see
[the automated security report](docs/security/penetration-test-report-2026-10-21.md)).

### Added

- Organizations with server-enforced `OWNER`, `ADMIN`, and `MEMBER` roles.
- Tenant-scoped projects and sequentially numbered issues with status,
  priority, description, due date, and assignee.
- Issue list, issue detail panel, create-issue dialog, and Roadmap status board.
- Secure issue permalinks.
- Database-backed sessions in HttpOnly cookies with request-origin validation.
- Email verification and team invitations, with public or invite-only
  registration controlled by the operator.
- SMTP delivery for production and an optional Mailpit overlay for local testing.
- Self-hosted Docker Compose deployment with PostgreSQL 17 and Caddy (automatic
  HTTPS), plus an interactive `bootstrap:admin` CLI for the first owner.
- `scripts/local-setup.mjs` to create a local environment file in one command.
- Light and dark themes, mobile layout, and keyboard-accessible issue panel.

### Security

- Remediated findings from the automated penetration test of 2026-10-21.
- Dependency audit gate in CI with reviewed exceptions, CodeQL, secret
  scanning, and actions pinned to commit SHAs.

[0.2.0]: https://github.com/msertdev/nexora/releases/tag/v0.2.0
[0.1.0]: https://github.com/msertdev/nexora/releases/tag/v0.1.0
