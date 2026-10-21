"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiClient } from "../../lib/api-client";
import { useAuth } from "../../components/auth-provider";
import {
  safeAuthReturnTo,
  verificationFailureState,
} from "../../lib/team-collaboration";

type VerificationState =
  | "checking"
  | "ready"
  | "sent"
  | "verified"
  | "invalid"
  | "expired"
  | "used"
  | "error";

function VerifyEmailContent() {
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeAuthReturnTo(searchParams.get("returnTo"));
  const [state, setState] = useState<VerificationState>("checking");
  const [message, setMessage] = useState("");
  const [continuePath, setContinuePath] = useState(returnTo);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const started = useRef(false);

  const confirmToken = useCallback((token: string) => {
    setState("checking");
    setMessage("");
    void apiClient
      .confirmEmailVerification(token)
      .then(async () => {
        setPendingToken(null);
        setState("verified");
        setMessage("Your email address is verified.");
        if (auth.status === "authenticated") await auth.refresh();
        const nextPath =
          returnTo === "/" &&
          sessionStorage.getItem("nexora.invitation.accept.token")
            ? "/invitations/accept"
            : returnTo;
        setContinuePath(nextPath);
        if (nextPath !== "/") router.replace(nextPath);
      })
      .catch((error: unknown) => {
        const nextState =
          error instanceof ApiError
            ? verificationFailureState(error.status)
            : "error";
        setState(nextState);
        if (nextState !== "error") {
          setPendingToken(null);
          return;
        }
        setPendingToken(token);
        setMessage(
          error instanceof ApiError
            ? error.message
            : "We couldn’t verify your email. Please try again.",
        );
      });
  }, [auth, returnTo, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );

    if (!token) {
      if (
        returnTo === "/" &&
        sessionStorage.getItem("nexora.invitation.accept.token")
      ) {
        setContinuePath("/invitations/accept");
      }
      setState("ready");
      return;
    }

    setPendingToken(token);
    void confirmToken(token);
  }, [confirmToken, returnTo]);

  async function resend() {
    setState("checking");
    setMessage("");
    try {
      const response = await apiClient.requestEmailVerification();
      if (response.status === "verified") {
        setState("verified");
        setMessage("Your email address is already verified.");
        await auth.refresh();
      } else {
        setState("sent");
        setMessage("A fresh verification link has been sent to your account email.");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        auth.setUser(null);
      }
      setState("error");
      setMessage(
        error instanceof ApiError
          ? error.message
          : "We couldn’t send a verification email. Please try again.",
      );
    }

  }

  const heading =
    state === "verified"
      ? "Email verified"
      : state === "invalid"
        ? "Invalid verification link"
        : state === "expired"
          ? "Verification link expired"
          : state === "used"
            ? "Link already used"
            : "Verify your email";

  return (
    <main className="auth-page">
      <section className="auth-card verification-card" aria-labelledby="verify-title">
        <p className="auth-card__eyebrow">ACCOUNT SECURITY</p>
        <h1 id="verify-title">{heading}</h1>
        {state === "checking" ? (
          <p role="status">Checking your verification link…</p>
        ) : null}
        {state === "ready" ? (
          auth.status === "authenticated" ? (
            auth.user.emailVerified ? (
              <>
                <p>Your account email is verified.</p>
                {continuePath !== "/" ? (
                  <Link className="auth-submit verification-link" href={continuePath}>
                    Continue to invitation <span aria-hidden="true">→</span>
                  </Link>
                ) : null}
              </>
            ) : (
              <>
                <p className="auth-card__subtitle">
                  We’ll send a single-use verification link to {auth.user.email}.
                </p>
                <button className="auth-submit" type="button" onClick={() => void resend()}>
                  Send verification email <span aria-hidden="true">→</span>
                </button>
              </>
            )
          ) : auth.status === "loading" ? (
            <p role="status">Checking your session…</p>
          ) : auth.status === "unavailable" ? (
            <button className="auth-submit" type="button" onClick={() => void auth.refresh()}>
              Retry session check <span aria-hidden="true">→</span>
            </button>
          ) : (
            <>
              <p>Sign in to request a new verification link for your account.</p>
              <Link className="auth-submit verification-link" href="/login?returnTo=%2Fverify-email">
                Sign in <span aria-hidden="true">→</span>
              </Link>
            </>
          )
        ) : null}
        {message ? (
          <p className={state === "error" ? "auth-error" : "auth-notice"} role={state === "error" ? "alert" : "status"}>
            {message}
          </p>
        ) : null}
        {state === "invalid" || state === "expired" || state === "used" ? (
          auth.status === "authenticated" && !auth.user.emailVerified ? (
            <button className="auth-submit" type="button" onClick={() => void resend()}>
              Send a new link <span aria-hidden="true">→</span>
            </button>
          ) : null
        ) : null}
        {state === "error" && auth.status === "authenticated" && !auth.user.emailVerified ? (
          <button className="auth-submit" type="button" onClick={() => void resend()}>
            Try sending again <span aria-hidden="true">→</span>
          </button>
        ) : null}
        {state === "error" && pendingToken ? (
          <button className="auth-submit" type="button" onClick={() => void confirmToken(pendingToken)}>
            Retry verification <span aria-hidden="true">→</span>
          </button>
        ) : null}
        {state === "verified" ? (
          <Link className="auth-submit verification-link" href={continuePath}>
            Continue <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        {state === "sent" ? (
          <button className="auth-submit" type="button" onClick={() => void resend()}>
            Resend email <span aria-hidden="true">→</span>
          </button>
        ) : null}
      </section>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="workspace-loading">Loading verification…</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
