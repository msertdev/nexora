import type { MembershipRole } from "./api-client";

export function safeAuthReturnTo(value: string | null) {
  return value === "/invitations/accept" || value === "/verify-email"
    ? value
    : "/";
}

export function canInviteRole(
  actorRole: MembershipRole,
  inviteRole: "ADMIN" | "MEMBER",
) {
  return actorRole === "OWNER" || (actorRole === "ADMIN" && inviteRole === "MEMBER");
}

export function canChangeMemberRole(
  actorRole: MembershipRole,
  targetRole: MembershipRole,
) {
  return actorRole === "OWNER" && targetRole !== "OWNER";
}

export function canRemoveMember(
  actorRole: MembershipRole,
  targetRole: MembershipRole,
) {
  return (
    (actorRole === "OWNER" && targetRole !== "OWNER") ||
    (actorRole === "ADMIN" && targetRole === "MEMBER")
  );
}

export function invitationFailureState(status: number) {
  if (status === 400) return "invalid" as const;
  if (status === 410) return "expired" as const;
  if (status === 409) return "used" as const;
  if (status === 403) return "wrong-account" as const;
  return "error" as const;
}

export function verificationFailureState(status: number) {
  if (status === 400) return "invalid" as const;
  if (status === 410) return "expired" as const;
  if (status === 409) return "used" as const;
  return "error" as const;
}
