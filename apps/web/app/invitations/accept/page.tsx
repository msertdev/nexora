"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiClient } from "../../../lib/api-client";
import { useAuth } from "../../../components/auth-provider";
import { useWorkspaces } from "../../../components/workspace-provider";
import { invitationFailureState } from "../../../lib/team-collaboration";

const INVITATION_TOKEN_KEY = "nexora.invitation.accept.token";

type AcceptanceState =
  | "checking"
  | "needs-auth"
  | "unverified"
  | "accepted"
  | "invalid"
  | "expired"
  | "used"
  | "wrong-account"
  | "error";

export default function AcceptInvitationPage() {
  const auth = useAuth();
  const workspaces = useWorkspaces();
  const router = useRouter();
  const [state, setState] = useState<AcceptanceState>("checking");
  const [message, setMessage] = useState("");
  const [tokenReady, setTokenReady] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [joinedOrganizationId, setJoinedOrganizationId] = useState<string | null>(null);
  const started = useRef(false);
  const accepting = useRef(false);
  const { refresh } = workspaces;

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const tokenFromFragment = new URLSearchParams(
      window.location.hash.slice(1),
    ).get("token");
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    if (tokenFromFragment) {
      sessionStorage.setItem(INVITATION_TOKEN_KEY, tokenFromFragment);
    }
    if (!sessionStorage.getItem(INVITATION_TOKEN_KEY)) {
      setState("invalid");
    } else {
      setState("checking");
    }
    setTokenReady(true);
  }, []);

  useEffect(() => {
    if (!tokenReady || accepting.current) return;
    if (auth.status === "loading") return;
    if (auth.status === "unavailable") {
      setState("error");
      setMessage("We couldn’t check your session. Try again when NEXORA is available.");
      return;
    }
    if (auth.status === "unauthenticated") {
      setState("needs-auth");
      return;
    }
    if (!auth.user.emailVerified) {
      setState("unverified");
      return;
    }

    const token = sessionStorage.getItem(INVITATION_TOKEN_KEY);
    if (!token) {
      setState("invalid");
      return;
    }

    accepting.current = true;
    setState("checking");
    void apiClient
      .acceptInvitation(token)
      .then(async ({ organizationId }) => {
        sessionStorage.removeItem(INVITATION_TOKEN_KEY);
        setJoinedOrganizationId(organizationId);
        const organizations = await refresh(organizationId);
        const joined = organizations.find(
          (organization) => organization.id === organizationId,
        );
        if (!joined) {
          setState("error");
          setMessage("You joined the workspace, but it could not be loaded. Refresh workspaces and try again.");
          return;
        }
        setState("accepted");
        setMessage(`You’ve joined ${joined.name}.`);
      })
      .catch((error: unknown) => {
        const nextState =
          error instanceof ApiError
            ? invitationFailureState(error.status)
            : "error";
        if (nextState === "invalid" || nextState === "expired" || nextState === "used") {
          sessionStorage.removeItem(INVITATION_TOKEN_KEY);
          setState(nextState);
        } else if (nextState === "wrong-account") {
          setState("wrong-account");
        } else {
          setState("error");
          setMessage(
            error instanceof ApiError
              ? error.message
              : "We couldn’t accept this invitation. Please try again.",
          );
        }
      })
      .finally(() => {
        accepting.current = false;
      });
  }, [
    auth.status,
    auth.status === "authenticated" ? auth.user.emailVerified : false,
    refresh,
    retryCount,
    tokenReady,
  ]);

  async function switchAccount() {
    try {
      try {
        await apiClient.logout();
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
      }
      auth.setUser(null);
      router.replace("/login?returnTo=%2Finvitations%2Faccept");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof ApiError
          ? error.message
          : "Unable to switch accounts right now.",
      );
    }
  }

  async function retryWorkspaceRefresh() {
    if (!joinedOrganizationId) return;
    const organizations = await refresh(joinedOrganizationId);
    const joined = organizations.find(
      (organization) => organization.id === joinedOrganizationId,
    );
    if (joined) {
      setState("accepted");
      setMessage(`You’ve joined ${joined.name}.`);
    } else {
      setMessage("The invitation was accepted, but workspace data is still unavailable.");
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card verification-card" aria-labelledby="invitation-title">
        <p className="auth-card__eyebrow">WORKSPACE INVITATION</p>
        <h1 id="invitation-title">
          {state === "accepted"
            ? "Invitation accepted"
            : state === "expired"
              ? "Invitation expired"
              : state === "used"
                ? "Invitation already used"
                : state === "invalid"
                  ? "Invalid invitation link"
                  : "Join your workspace"}
        </h1>
        {state === "checking" ? <p role="status">Checking your invitation…</p> : null}
        {state === "needs-auth" ? (
          <>
            <p>Sign in or create an account to continue. Use the email address the invitation was sent to.</p>
            <Link className="auth-submit verification-link" href="/login?returnTo=%2Finvitations%2Faccept">
              Sign in <span aria-hidden="true">→</span>
            </Link>
            <Link className="auth-secondary-link" href="/register?returnTo=%2Finvitations%2Faccept">
              Create an account
            </Link>
          </>
        ) : null}
        {state === "unverified" ? (
          <>
            <p>Verify the email address on your account before accepting this invitation.</p>
            <Link className="auth-submit verification-link" href="/verify-email?returnTo=%2Finvitations%2Faccept">
              Verify email <span aria-hidden="true">→</span>
            </Link>
          </>
        ) : null}
        {state === "wrong-account" ? (
          <>
            <p>This invitation can’t be accepted by the current account. Sign in with the invited, verified email address.</p>
            <button className="auth-submit" type="button" onClick={() => void switchAccount()}>
              Switch account <span aria-hidden="true">→</span>
            </button>
          </>
        ) : null}
        {state === "accepted" ? (
          <>
            <p className="auth-notice" role="status">{message}</p>
            <button className="auth-submit" type="button" onClick={() => router.replace("/")}>
              Open workspace <span aria-hidden="true">→</span>
            </button>
          </>
        ) : null}
        {state === "error" && joinedOrganizationId ? (
          <button className="auth-submit" type="button" onClick={() => void retryWorkspaceRefresh()}>
            Retry workspace refresh <span aria-hidden="true">→</span>
          </button>
        ) : null}
        {state === "expired" || state === "used" || state === "invalid" ? (
          <p className="auth-error" role="alert">
            {state === "expired"
              ? "Ask a workspace owner or admin to send a new invitation."
              : state === "used"
                ? "This invitation has already been accepted."
                : "This link is not valid. Ask the inviter for a new link."}
          </p>
        ) : null}
        {state === "error" ? <p className="auth-error" role="alert">{message}</p> : null}
        {state === "error" && sessionStorage.getItem(INVITATION_TOKEN_KEY) ? (
          <button className="auth-submit" type="button" onClick={() => setRetryCount((value) => value + 1)}>
            Retry invitation <span aria-hidden="true">→</span>
          </button>
        ) : null}
      </section>
    </main>
  );
}
