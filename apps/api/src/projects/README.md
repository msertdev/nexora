# Projects and issues API

All routes require a valid session cookie and an active membership in the
organization named in the route. Project and issue queries are additionally
scoped by the organization and project path identifiers.

## Routes

- `GET /api/organizations/:organizationId/projects`
- `POST /api/organizations/:organizationId/projects`
- `GET /api/organizations/:organizationId/projects/:projectId`
- `PATCH /api/organizations/:organizationId/projects/:projectId`
- `GET /api/organizations/:organizationId/projects/:projectId/issues`
- `POST /api/organizations/:organizationId/projects/:projectId/issues`
- `GET /api/organizations/:organizationId/projects/:projectId/issues/:issueId`
- `PATCH /api/organizations/:organizationId/projects/:projectId/issues/:issueId`

Only `OWNER` and `ADMIN` memberships can create or edit projects. All
organization members can read projects and create, read, or edit issues.
Issue edits are limited to title, description, status, priority, assignee, and
due date; organization, project, and issue number are never writable. Because
the current schema has no issue creator/reporter field, members who can access
an organization can edit its issues; add an explicit authorship/permission
model before introducing finer-grained issue editing rules.

Issue list queries accept `page` (default `1`), `limit` (default `50`, maximum
`100`), `status`, `priority`, and `assigneeId`. Results are ordered by issue
number descending and include `items`, `page`, `limit`, `total`, and
`totalPages`.

Project list queries accept `page` (default `1`) and `limit` (default `50`,
maximum `100`) and return the same paginated response envelope.

Issue creation increments the existing `Project.lastIssueNumber` column using
an atomic database update in the same transaction as issue insertion. The
unique `(projectId, issueNumber)` constraint is the final integrity guarantee.
No schema change or migration is required.
