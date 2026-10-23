import { IssueWorkspace } from "../../../../../../../components/issue-workspace";
import { ProtectedRoute } from "../../../../../../../components/auth-route";

export default function IssuePermalinkPage() {
  return (
    <ProtectedRoute>
      <IssueWorkspace />
    </ProtectedRoute>
  );
}
