# Issue comments

Each issue detail panel includes a paginated discussion with plain-text comments.
Members can add comments and edit or delete their own. ADMIN and OWNER can also
delete another member's comment, but cannot edit it. The API enforces these rules
using the authenticated session and existing organization membership guard;
client-supplied authors or roles are not accepted.

## API

All routes are relative to:

`/api/organizations/:organizationId/projects/:projectId/issues/:issueId/comments`

| Method | Path              | Result                                                           |
| ------ | ----------------- | ---------------------------------------------------------------- |
| GET    | /?page=1&limit=50 | Chronological page with items, page, limit, total and totalPages |
| POST   | /                 | Create a comment; returns the comment with status 201            |
| PATCH  | /:commentId       | Update the author's comment; returns the updated comment         |
| DELETE | /:commentId       | Delete an allowed comment; returns status 204                    |

POST and PATCH accept only `{ "body": "An update" }`. Bodies are trimmed and must
contain 1–10,000 characters after trimming. Page numbers start at 1; page size is
1–100 (default 50). Ordering uses creation time and ID for deterministic ties.
Author information contains only ID and display name.

Reads and writes scope an issue/comment to the organization and project in the
route. Missing or mismatched resources return 404; attempting to edit or delete
another author's comment without permission returns 403. Existing session,
origin validation and rate limits apply.

The thread preserves input after failed writes, displays retryable loading
errors, confirms deletion, and moves to the latest page after adding a comment.
Comment bodies render as text, including strings that look like HTML.

## Database upgrade

Apply the additive `20261104000000_issue_comments` migration using the existing
[deployment upgrade procedure](../DEPLOYMENT.md#migrations-and-upgrades).
The migration creates the Comment table and indexes for issue chronology and
author lookup; it does not rewrite existing data. Both foreign keys cascade:
deleting an issue or a user deletes their associated comments.

## Validation

Run the normal [contribution checks](../CONTRIBUTING.md). The mocked-Prisma API
suite covers authorization, input validation, route scoping, pagination and
safe database errors. For real PostgreSQL persistence and cascade coverage, set
DATABASE_URL to an **isolated migrated test database**, then run:

```sh
pnpm --filter api test:e2e
```

The integration suite creates UUID-scoped fixtures and removes only those
fixtures at the end. Never point it at production or another developer's DB.

For Chromium CRUD, reload persistence, failure recovery and mobile text layout,
run the app using the isolated stack and a disposable member account with a
known issue, then set:

```sh
export NEXORA_E2E_BASE_URL=http://localhost:8080
export NEXORA_E2E_MEMBER_EMAIL=member@example.test
export NEXORA_E2E_MEMBER_PASSWORD='<local-test-password>'
export NEXORA_E2E_ISSUE_PATH='/orgs/<slug>/projects/<uuid>/issues/1'
pnpm exec playwright test tests/e2e/issue-comments.spec.ts --project=chromium
```

Replace the path placeholders with the disposable test issue. These browser
tests require live local services and create/delete their own comments.
