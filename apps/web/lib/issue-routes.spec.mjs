import assert from "node:assert/strict";
import test from "node:test";
import { buildIssuePath, isIssuePath, parseIssuePath } from "./issue-routes.ts";

const projectId = "6ed463d6-d31a-4a0e-a913-94130ab22fd4";

test("issue paths use canonical organization, project and issue identifiers", () => {
  assert.equal(
    buildIssuePath({
      organizationSlug: "Example-Team",
      projectId: projectId.toUpperCase(),
      issueNumber: 42,
    }),
    `/orgs/example-team/projects/${projectId}/issues/42`,
  );
  assert.deepEqual(
    parseIssuePath(
      `/orgs/Example-Team/projects/${projectId.toUpperCase()}/issues/42`,
    ),
    {
      organizationSlug: "example-team",
      projectId,
      issueNumber: 42,
    },
  );
});

test("a copied issue deep link restores the same issue coordinates after refresh", () => {
  const copiedPath = buildIssuePath({
    organizationSlug: "example-team",
    projectId,
    issueNumber: 42,
  });

  assert.deepEqual(parseIssuePath(copiedPath), {
    organizationSlug: "example-team",
    projectId,
    issueNumber: 42,
  });
});

test("issue path candidates remain detectable when the issue number is invalid", () => {
  assert.equal(
    isIssuePath(`/orgs/example-team/projects/${projectId}/issues/not-a-number`),
    true,
  );
  assert.equal(
    parseIssuePath(
      `/orgs/example-team/projects/${projectId}/issues/not-a-number`,
    ),
    null,
  );
  assert.equal(isIssuePath(`/orgs/example-team/projects/${projectId}`), false);
});

test("issue path parsing rejects malformed or non-canonical identifiers", () => {
  const invalidPaths = [
    `/orgs/example-team/projects/${projectId}/issues/0`,
    `/orgs/example-team/projects/${projectId}/issues/01`,
    `/orgs/example-team/projects/${projectId}/issues/1.5`,
    `/orgs/example-team/projects/${projectId}/issues/2147483648`,
    `/orgs/example_team/projects/${projectId}/issues/1`,
    "/orgs/example-team/projects/not-a-uuid/issues/1",
    `/orgs/example-team/projects/${projectId}/issues/1/extra`,
    `/orgs/example-team/projects/${projectId}/issues/%2Fadmin`,
    `//attacker.example/orgs/example-team/projects/${projectId}/issues/1`,
  ];

  for (const pathname of invalidPaths) {
    assert.equal(parseIssuePath(pathname), null, pathname);
  }
});

test("issue path building rejects values outside the persisted route domain", () => {
  assert.throws(
    () =>
      buildIssuePath({
        organizationSlug: "example-team",
        projectId,
        issueNumber: 0,
      }),
    /Invalid issue route parameters/,
  );
});
