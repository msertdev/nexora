import { Suspense } from "react";
import { AuthForm } from "../../components/auth-form";
import { PublicOnlyRoute } from "../../components/auth-route";

export default function LoginPage() {
  return (
    <PublicOnlyRoute>
      <Suspense fallback={<div className="workspace-loading">Loading…</div>}>
        <AuthForm mode="login" />
      </Suspense>
    </PublicOnlyRoute>
  );
}
