export type SafeUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

export type MembershipRole = "OWNER" | "ADMIN" | "MEMBER";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  role: MembershipRole;
};

export type OrganizationMember = {
  role: MembershipRole;
  user: Pick<SafeUser, "id" | "email" | "name">;
};

export type OrganizationInvitation = {
  id: string;
  organizationId: string;
  email: string;
  role: "ADMIN" | "MEMBER";
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  invitedBy: Pick<SafeUser, "id" | "name" | "email">;
};

export type Project = {
  id: string;
  organizationId: string;
  name: string;
  key: string;
  createdAt: string;
  updatedAt: string;
};

export type IssueStatus =
  | "BACKLOG"
  | "TODO"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "DONE";

export type IssuePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type Issue = {
  id: string;
  projectId: string;
  issueNumber: number;
  identifier: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeId: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: Pick<SafeUser, "id" | "email" | "name"> | null;
  project: { key: string };
};

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type IssueInput = {
  title: string;
  description?: string | null;
  status?: IssueStatus;
  priority?: IssuePriority;
  assigneeId?: string | null;
  dueDate?: string | null;
};

export type IssueUpdateInput = Partial<IssueInput>;

export type ProjectInput = {
  name: string;
  key: string;
};

type AuthInput = {
  email: string;
  password: string;
};

type RegisterInput = AuthInput & {
  name: string;
};

export class ApiError extends Error {
  readonly status: number;

  constructor(
    status: number,
    message: string,
  ) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ??
  "http://localhost:4000";

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(0, "Unable to reach NEXORA. Check your connection and try again.");
  }

  if (!response.ok) {
    const messageByStatus: Record<number, string> = {
      400: "Check the information you entered and try again.",
      401: "Your session has expired. Please sign in again.",
      403: "You don’t have permission to perform this action.",
      404: "The requested resource could not be found.",
      409: "This change conflicts with existing data. Review your input and try again.",
      429: "Too many attempts. Please wait a moment and try again.",
      503: "NEXORA is temporarily unavailable. Please try again.",
    };

    let serverMessage: string | string[] | undefined;
    try {
      const body: unknown = await response.json();
      if (
        typeof body === "object" &&
        body !== null &&
        "message" in body &&
        (typeof body.message === "string" ||
          (Array.isArray(body.message) &&
            body.message.every((item) => typeof item === "string")))
      ) {
        serverMessage = body.message;
      }
    } catch {
      serverMessage = undefined;
    }

    const firstServerMessage = Array.isArray(serverMessage)
      ? serverMessage[0]
      : serverMessage;
    const message =
      response.status === 401 && serverMessage === "Invalid email or password"
        ? "Email or password is incorrect."
        : response.status === 409 &&
            serverMessage === "Unable to register with these details"
          ? "An account with this email already exists. Try signing in instead."
          : response.status === 409 &&
              serverMessage ===
                "Unable to create an organization with that name"
            ? "That workspace name is already in use. Try another."
            : response.status === 400 && firstServerMessage
              ? firstServerMessage
          : messageByStatus[response.status] ??
            "Something went wrong. Please try again.";

    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(0, "NEXORA returned an unexpected response.");
  }
}

export const apiClient = {
  login(input: AuthInput) {
    return request<SafeUser>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  register(input: RegisterInput) {
    return request<SafeUser>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  me() {
    return request<SafeUser>("/api/auth/me");
  },

  logout() {
    return request<void>("/api/auth/logout", { method: "POST" });
  },

  organizations() {
    return request<Organization[]>("/api/organizations");
  },

  createOrganization(input: { name: string }) {
    return request<Organization>("/api/organizations", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  organizationMembers(organizationId: string) {
    return request<OrganizationMember[]>(
      `/api/organizations/${encodeURIComponent(organizationId)}/members`,
    );
  },

  organizationInvitations(organizationId: string) {
    return request<OrganizationInvitation[]>(
      `/api/organizations/${encodeURIComponent(organizationId)}/invitations`,
    );
  },

  createInvitation(
    organizationId: string,
    input: { email: string; role: "ADMIN" | "MEMBER" },
  ) {
    return request<OrganizationInvitation & { invitationLink: string }>(
      `/api/organizations/${encodeURIComponent(organizationId)}/invitations`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  revokeInvitation(organizationId: string, invitationId: string) {
    return request<{ id: string; revokedAt: string }>(
      `/api/organizations/${encodeURIComponent(organizationId)}/invitations/${encodeURIComponent(invitationId)}/revoke`,
      { method: "POST" },
    );
  },

  updateMemberRole(
    organizationId: string,
    userId: string,
    role: "ADMIN" | "MEMBER",
  ) {
    return request<{ userId: string; role: MembershipRole }>(
      `/api/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
      { method: "PATCH", body: JSON.stringify({ role }) },
    );
  },

  removeMember(organizationId: string, userId: string) {
    return request<{ userId: string; removed: true }>(
      `/api/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
  },

  requestEmailVerification() {
    return request<{ status: "sent" | "verified" }>(
      "/api/auth/email-verification/request",
      { method: "POST" },
    );
  },

  confirmEmailVerification(token: string) {
    return request<{ status: "verified" }>(
      "/api/auth/email-verification/confirm",
      { method: "POST", body: JSON.stringify({ token }) },
    );
  },

  acceptInvitation(token: string) {
    return request<{ organizationId: string; role: MembershipRole }>(
      "/api/invitations/accept",
      { method: "POST", body: JSON.stringify({ token }) },
    );
  },

  projects(organizationId: string, page = 1, limit = 100) {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) });
    return request<PaginatedResponse<Project>>(
      `/api/organizations/${encodeURIComponent(organizationId)}/projects?${query}`,
    );
  },

  createProject(organizationId: string, input: ProjectInput) {
    return request<Project>(
      `/api/organizations/${encodeURIComponent(organizationId)}/projects`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  issues(
    organizationId: string,
    projectId: string,
    query: {
      page?: number;
      limit?: number;
      status?: IssueStatus;
      priority?: IssuePriority;
      assigneeId?: string;
    } = {},
  ) {
    const params = new URLSearchParams({
      page: String(query.page ?? 1),
      limit: String(query.limit ?? 100),
    });
    if (query.status) params.set("status", query.status);
    if (query.priority) params.set("priority", query.priority);
    if (query.assigneeId) params.set("assigneeId", query.assigneeId);
    return request<PaginatedResponse<Issue>>(
      `/api/organizations/${encodeURIComponent(organizationId)}/projects/${encodeURIComponent(projectId)}/issues?${params}`,
    );
  },

  createIssue(
    organizationId: string,
    projectId: string,
    input: IssueInput,
  ) {
    return request<Issue>(
      `/api/organizations/${encodeURIComponent(organizationId)}/projects/${encodeURIComponent(projectId)}/issues`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  updateIssue(
    organizationId: string,
    projectId: string,
    issueId: string,
    input: IssueUpdateInput,
  ) {
    return request<Issue>(
      `/api/organizations/${encodeURIComponent(organizationId)}/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
  },
};
