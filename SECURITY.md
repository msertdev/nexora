# Security policy

NEXORA is a self-hosted application. Operators are responsible for protecting
the host, database, environment files, backups, SMTP credentials, and network
boundary.

## Reporting a vulnerability

Please do not report suspected vulnerabilities in a public issue or pull
request. Once private vulnerability reporting is enabled for the GitHub
repository, use its **Report a vulnerability** flow. Until then, contact the
maintainer through a verified private channel and do not include exploit
details in a public forum.

Include the affected version or commit, impact, prerequisites, and a
reproducible description. Redact credentials, session cookies, invitation or
verification tokens, and personal data. The maintainer may request additional
details or a coordinated disclosure timeline.

## Supported versions

No release has been published yet. Until a release policy is announced, report
issues against the latest main-branch version and include the commit or
container image tag.

## Deployment guidance

- Keep `deploy/runtime.env` private and out of source control.
- Use unique production credentials and restrict access to the host and
  backups.
- Use the production Compose file with HTTPS and a trusted SMTP service; do
  not expose PostgreSQL, the API, or Mailpit directly.
- Keep registration invite-only unless public signup is an explicit policy.
- Back up PostgreSQL before upgrades and review migrations before deployment.
- Review [DEPLOYMENT.md](DEPLOYMENT.md) for proxy trust, bootstrap, upgrades,
  and backup procedures.

Security checks and penetration tests are bounded evidence, not a guarantee
that NEXORA is free of vulnerabilities.
