import assert from "node:assert/strict";
import test from "node:test";
import { apiClient } from "./api-client.ts";

test("issue permalink lookup uses the authenticated slug and project route", async () => {
  const projectId = "6ed463d6-d31a-4a0e-a913-94130ab22fd4";
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(
      JSON.stringify({
        id: "issue-id",
        projectId,
        issueNumber: 7,
        identifier: "WEB-7",
        title: "Example issue",
        description: null,
        status: "TODO",
        priority: "MEDIUM",
        assigneeId: null,
        dueDate: null,
        createdAt: "2026-10-23T00:00:00.000Z",
        updatedAt: "2026-10-23T00:00:00.000Z",
        assignee: null,
        project: { key: "WEB" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const issue = await apiClient.issueByPermalink(
      "example-team",
      projectId,
      7,
    );
    const request = calls[0];

    assert.equal(
      new URL(request.url).pathname,
      `/api/organizations/by-slug/example-team/projects/${projectId}/issues/7`,
    );
    assert.equal(request.init.credentials, "include");
    assert.equal(issue.identifier, "WEB-7");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
