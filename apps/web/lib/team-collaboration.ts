import type { MembershipRole } from "./api-client";

const ISSUE_RETURN_PATH_PATTERN =
  /^\/orgs\/([a-z0-9]+(?:-[a-z0-9]+)*)\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/issues\/([1-9]\d*)$/i;
const MAX_ISSUE_NUMBER = 2_147_483_647;

function safeIssueReturnTo(value: string): string | null {
  const match = ISSUE_RETURN_PATH_PATTERN.exec(value);
  if (!match) return null;

  const organizationSlug = match[1];
  const projectId = match[2];
  const issueNumber = match[3];
  if (!organizationSlug || !projectId || !issueNumber) return null;

  const parsedIssueNumber = Number(issueNumber);
  if (
    organizationSlug.length > 83 ||
    !Number.isSafeInteger(parsedIssueNumber) ||
    parsedIssueNumber > MAX_ISSUE_NUMBER
  ) {
    return null;
  }

  return `/orgs/${organizationSlug.toLowerCase()}/projects/${projectId.toLowerCase()}/issues/${parsedIssueNumber}`;
}

export function safeAuthReturnTo(value: string | null) {
  if (value === "/invitations/accept" || value === "/verify-email") {
    return value;
  }

  return value ? (safeIssueReturnTo(value) ?? "/") : "/";
}

export function loginPathFor(pathname: string) {
  const returnTo = safeAuthReturnTo(pathname);
  return returnTo === "/"
    ? "/login"
    : `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function canInviteRole(
  actorRole: MembershipRole,
  inviteRole: "ADMIN" | "MEMBER",
) {
  return (
    actorRole === "OWNER" || (actorRole === "ADMIN" && inviteRole === "MEMBER")
  );
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
