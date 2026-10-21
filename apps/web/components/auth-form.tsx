"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiClient, ApiError } from "../lib/api-client";
import { safeAuthReturnTo } from "../lib/team-collaboration";
import { useAuth } from "./auth-provider";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuth();
  const returnTo = searchParams.get("returnTo");
  const safeReturnTo = safeAuthReturnTo(returnTo);
  const isRegister = mode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFieldError("");

    if (isRegister && !name.trim()) {
      setFieldError("Enter your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFieldError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setFieldError("Enter your password.");
      return;
    }
    if (isRegister && password.length < 12) {
      setFieldError("Use at least 12 characters.");
      return;
    }
    if (isRegister && password !== confirmPassword) {
      setFieldError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      if (isRegister) {
        await apiClient.register({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        });
        router.replace(
          safeReturnTo === "/"
            ? "/login?registered=1"
            : `/login?registered=1&returnTo=${encodeURIComponent(safeReturnTo)}`,
        );
        return;
      }

      const user = await apiClient.login({
        email: email.trim().toLowerCase(),
        password,
      });
      setUser(user);
      router.replace(safeReturnTo);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-decoration auth-decoration--diamond" aria-hidden="true" />
      <div className="auth-decoration auth-decoration--spark" aria-hidden="true" />
      <div className="auth-layout">
        <section className="auth-intro" aria-labelledby="auth-brand-title">
          <Link className="auth-brand" href="/" aria-label="NEXORA home">
            <Image
              src="/nexora-logo.svg"
              width={44}
              height={44}
              alt=""
              priority
            />
            <span>NEXORA</span>
          </Link>
          <p className="auth-eyebrow">YOUR WORK, IN FOCUS</p>
          <h1 id="auth-brand-title">
            Make space for
            <br />
            <span>meaningful work.</span>
          </h1>
          <p className="auth-intro__copy">
            Bring projects, priorities, and people together in one thoughtful
            workspace.
          </p>
          <div className="auth-points" aria-label="NEXORA workspace benefits">
            <span><i aria-hidden="true" /> Clear priorities</span>
            <span><i aria-hidden="true" /> Work in sync</span>
          </div>
        </section>

        <section className="auth-card" aria-labelledby="auth-title">
          <p className="auth-card__eyebrow">
            {isRegister ? "GET STARTED" : "WELCOME BACK"}
          </p>
          <h2 id="auth-title">{isRegister ? "Create your account" : "Sign in"}</h2>
          <p className="auth-card__subtitle">
            {isRegister
              ? "Set up your NEXORA account to continue."
              : "Enter your credentials to continue."}
          </p>

          {!isRegister && searchParams.get("registered") === "1" ? (
            <p className="auth-notice" role="status">
              Your account was created. Sign in to continue.
            </p>
          ) : null}
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {isRegister ? (
              <label className="auth-field">
                <span>Name</span>
                <input
                  autoComplete="name"
                  maxLength={100}
                  name="name"
                  required
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setFieldError("");
                  }}
                  aria-invalid={Boolean(fieldError && !name.trim())}
                />
              </label>
            ) : null}
            <label className="auth-field">
              <span>Email</span>
              <input
                autoComplete="email"
                maxLength={254}
                name="email"
                type="email"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setFieldError("");
                }}
                placeholder="you@example.com"
                aria-invalid={Boolean(
                  fieldError &&
                    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
                )}
              />
            </label>
            <label className="auth-field">
              <span>Password</span>
              <span className="auth-password">
                <input
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  maxLength={128}
                  minLength={isRegister ? 12 : 1}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFieldError("");
                  }}
                  aria-describedby={isRegister ? "password-hint" : undefined}
                  aria-invalid={Boolean(fieldError)}
                />
                <button
                  type="button"
                  className="auth-password__toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            {isRegister ? (
              <>
                <p className="auth-hint" id="password-hint">
                  Use at least 12 characters.
                </p>
                <label className="auth-field">
                  <span>Confirm password</span>
                  <input
                    autoComplete="new-password"
                    maxLength={128}
                    name="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      setFieldError("");
                    }}
                    aria-invalid={Boolean(
                      fieldError && password !== confirmPassword,
                    )}
                  />
                </label>
              </>
            ) : null}
            {fieldError ? (
              <p className="auth-error" role="alert">
                {fieldError}
              </p>
            ) : null}
            <button
              className="auth-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? isRegister
                  ? "Creating account…"
                  : "Signing in…"
                : isRegister
                  ? "Create account"
                  : "Sign in"}
              <span aria-hidden="true">→</span>
            </button>
          </form>
          <p className="auth-switch">
            {isRegister ? "Already have an account?" : "New to NEXORA?"}{" "}
            <Link
              href={`${isRegister ? "/login" : "/register"}${
                safeReturnTo === "/"
                  ? ""
                  : `?returnTo=${encodeURIComponent(safeReturnTo)}`
              }`}
            >
              {isRegister ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </section>
      </div>
      <p className="auth-footer">NEXORA · BUILD BETTER. TOGETHER.</p>
    </main>
  );
}
