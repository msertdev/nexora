import assert from "node:assert/strict";
import test from "node:test";
import {
  canChangeMemberRole,
  canInviteRole,
  canRemoveMember,
  invitationFailureState,
  loginPathFor,
  safeAuthReturnTo,
  verificationFailureState,
} from "./team-collaboration.ts";

test("invitation permissions match OWNER and ADMIN policy", () => {
  assert.equal(canInviteRole("OWNER", "ADMIN"), true);
  assert.equal(canInviteRole("OWNER", "MEMBER"), true);
  assert.equal(canInviteRole("ADMIN", "MEMBER"), true);
  assert.equal(canInviteRole("ADMIN", "ADMIN"), false);
  assert.equal(canInviteRole("MEMBER", "MEMBER"), false);
});

test("member controls cannot change or remove owners and admins are limited", () => {
  assert.equal(canChangeMemberRole("OWNER", "ADMIN"), true);
  assert.equal(canChangeMemberRole("OWNER", "MEMBER"), true);
  assert.equal(canChangeMemberRole("OWNER", "OWNER"), false);
  assert.equal(canChangeMemberRole("ADMIN", "MEMBER"), false);
  assert.equal(canRemoveMember("OWNER", "ADMIN"), true);
  assert.equal(canRemoveMember("OWNER", "OWNER"), false);
  assert.equal(canRemoveMember("ADMIN", "MEMBER"), true);
  assert.equal(canRemoveMember("ADMIN", "ADMIN"), false);
  assert.equal(canRemoveMember("MEMBER", "MEMBER"), false);
});

test("verification and invitation failures map to explicit safe UI states", () => {
  assert.equal(verificationFailureState(400), "invalid");
  assert.equal(verificationFailureState(410), "expired");
  assert.equal(verificationFailureState(409), "used");
  assert.equal(verificationFailureState(503), "error");
  assert.equal(invitationFailureState(400), "invalid");
  assert.equal(invitationFailureState(410), "expired");
  assert.equal(invitationFailureState(409), "used");
  assert.equal(invitationFailureState(403), "wrong-account");
  assert.equal(invitationFailureState(503), "error");
});

test("authentication return paths allow only the required internal flows", () => {
  const projectId = "6ed463d6-d31a-4a0e-a913-94130ab22fd4";
  assert.equal(safeAuthReturnTo("/invitations/accept"), "/invitations/accept");
  assert.equal(safeAuthReturnTo("/verify-email"), "/verify-email");
  assert.equal(
    safeAuthReturnTo(
      `/orgs/Example-Team/projects/${projectId.toUpperCase()}/issues/42`,
    ),
    `/orgs/example-team/projects/${projectId}/issues/42`,
  );
  assert.equal(safeAuthReturnTo("//attacker.example"), "/");
  assert.equal(safeAuthReturnTo("https://attacker.example"), "/");
  assert.equal(safeAuthReturnTo("/admin"), "/");
  assert.equal(
    safeAuthReturnTo(
      `/orgs/example-team/projects/${projectId}/issues/not-a-number`,
    ),
    "/",
  );
  assert.equal(safeAuthReturnTo(null), "/");
});

test("authentication return paths reject external, backslash and encoded variants", () => {
  const directUnsafePaths = [
    "//attacker.example",
    "https://attacker.example",
    String.raw`\attacker.example`,
    String.raw`\\attacker.example`,
    String.raw`/\attacker.example`,
  ];
  const encodedQueryValues = [
    "%2F%2Fattacker.example",
    "%5C%5Cattacker.example",
    "%2F%5Cattacker.example",
    "https%3A%2F%2Fattacker.example",
    "%252F%252Fattacker.example",
    "%255C%255Cattacker.example",
  ];

  for (const value of directUnsafePaths) {
    assert.equal(safeAuthReturnTo(value), "/", value);
    assert.equal(loginPathFor(value), "/login", value);
  }

  for (const queryValue of encodedQueryValues) {
    const decodedValue = new URLSearchParams(`returnTo=${queryValue}`).get(
      "returnTo",
    );
    assert.notEqual(decodedValue, null, queryValue);
    assert.equal(safeAuthReturnTo(decodedValue), "/", queryValue);
    assert.equal(loginPathFor(decodedValue ?? ""), "/login", queryValue);
  }
});

test("protected routes retain only safe issue paths through authentication", () => {
  const projectId = "6ed463d6-d31a-4a0e-a913-94130ab22fd4";
  assert.equal(loginPathFor("/"), "/login");
  assert.equal(
    loginPathFor(`/orgs/example-team/projects/${projectId}/issues/42`),
    `/login?returnTo=${encodeURIComponent(`/orgs/example-team/projects/${projectId}/issues/42`)}`,
  );
  assert.equal(loginPathFor("//attacker.example"), "/login");
});
