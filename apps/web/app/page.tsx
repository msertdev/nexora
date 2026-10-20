import { IssueWorkspace } from "../components/issue-workspace";
import { ProtectedRoute } from "../components/auth-route";

export default function Home() {
  return (
    <ProtectedRoute>
      <IssueWorkspace />
    </ProtectedRoute>
  );
}