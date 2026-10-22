import assert from "node:assert/strict";
import test from "node:test";
import { apiClient, ApiError } from "./api-client.ts";

test("collaboration API calls use authenticated routes and send secrets only in POST bodies", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await apiClient.organizationInvitations("org-id");
    await apiClient.createInvitation("org-id", {
      email: "member@example.test",
      role: "MEMBER",
    });
    await apiClient.revokeInvitation("org-id", "invite-id");
    await apiClient.updateMemberRole("org-id", "user-id", "ADMIN");
    await apiClient.removeMember("org-id", "user-id");
    await apiClient.acceptInvitation("synthetic-invitation-token");
    await apiClient.requestEmailVerification();
    await apiClient.confirmEmailVerification("synthetic-verification-token");

    assert.deepEqual(
      calls.map(({ url }) => new URL(url).pathname),
      [
        "/api/organizations/org-id/invitations",
        "/api/organizations/org-id/invitations",
        "/api/organizations/org-id/invitations/invite-id/revoke",
        "/api/organizations/org-id/members/user-id",
        "/api/organizations/org-id/members/user-id",
        "/api/invitations/accept",
        "/api/auth/email-verification/request",
        "/api/auth/email-verification/confirm",
      ],
    );
    for (const { url, init } of calls) {
      assert.equal(init.credentials, "include");
      assert.equal(new URL(url).search, "");
      assert.equal(new URL(url).hash, "");
    }
    assert.equal(calls[2].init.method, "POST");
    assert.deepEqual(JSON.parse(calls[3].init.body), { role: "ADMIN" });
    assert.equal(calls[4].init.method, "DELETE");
    assert.deepEqual(JSON.parse(calls[5].init.body), {
      token: "synthetic-invitation-token",
    });
    assert.deepEqual(JSON.parse(calls[7].init.body), {
      token: "synthetic-verification-token",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("collaboration API failures retain HTTP status for permission and conflict handling", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "Not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  try {
    await assert.rejects(
      apiClient.updateMemberRole("org-id", "user-id", "ADMIN"),
      (error) => error instanceof ApiError && error.status === 403,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("registration sends an invitation token only in the JSON body", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(
      JSON.stringify({
        id: "user-id",
        email: "member@example.test",
        name: "Member",
        emailVerified: false,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    await apiClient.register({
      email: "member@example.test",
      name: "Member",
      password: "synthetic-password",
      invitationToken: "synthetic-invitation-token",
    });
    assert.equal(new URL(calls[0].url).search, "");
    assert.equal(new URL(calls[0].url).hash, "");
    assert.equal(calls[0].init.credentials, "include");
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      email: "member@example.test",
      name: "Member",
      password: "synthetic-password",
      invitationToken: "synthetic-invitation-token",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("invitation creation response contract does not include a bearer link", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: "invitation-id",
        organizationId: "org-id",
        email: "member@example.test",
        role: "MEMBER",
        expiresAt: "2026-10-28T00:00:00.000Z",
        acceptedAt: null,
        revokedAt: null,
        createdAt: "2026-10-21T00:00:00.000Z",
        invitedBy: {
          id: "owner-id",
          name: "Owner",
          email: "owner@example.test",
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  try {
    const invitation = await apiClient.createInvitation("org-id", {
      email: "member@example.test",
      role: "MEMBER",
    });
    assert.equal("invitationLink" in invitation, false);
    assert.equal("tokenHash" in invitation, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
