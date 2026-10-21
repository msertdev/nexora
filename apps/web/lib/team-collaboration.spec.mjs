import assert from "node:assert/strict";
import test from "node:test";
import {
  canChangeMemberRole,
  canInviteRole,
  canRemoveMember,
  invitationFailureState,
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
  assert.equal(safeAuthReturnTo("/invitations/accept"), "/invitations/accept");
  assert.equal(safeAuthReturnTo("/verify-email"), "/verify-email");
  assert.equal(safeAuthReturnTo("//attacker.example"), "/");
  assert.equal(safeAuthReturnTo("https://attacker.example"), "/");
  assert.equal(safeAuthReturnTo("/admin"), "/");
  assert.equal(safeAuthReturnTo(null), "/");
});
