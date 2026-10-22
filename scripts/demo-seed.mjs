const DEMO_NAMESPACE = "nexora-demo/v1";
const ORGANIZATION_NAME = "NEXORA AI Lab (Demo)";
const VERIFICATION_SUBJECT = "Verify your NEXORA email address";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const accounts = [
  {
    key: "owner",
    label: "Demo owner",
    name: "NEXORA Demo Owner",
    email: "demo.owner@nexora.test",
    role: "OWNER",
  },
  {
    key: "admin",
    label: "Demo admin",
    name: "NEXORA Demo Admin",
    email: "demo.admin@nexora.test",
    role: "ADMIN",
  },
  {
    key: "engineer",
    label: "Demo engineer",
    name: "NEXORA Demo Engineer",
    email: "demo.engineer@nexora.test",
    role: "MEMBER",
  },
  {
    key: "reviewer",
    label: "Demo reviewer",
    name: "NEXORA Demo Reviewer",
    email: "demo.reviewer@nexora.test",
    role: "MEMBER",
  },
];

const projectSpecs = [
  { key: "AGENT", name: "NEXORA AI Agent v1" },
  { key: "PLAT", name: "Platform Reliability" },
];

const issueSpecs = [
  {
    seedId: "AGENT-001",
    projectKey: "AGENT",
    title: "Define agent execution contract",
    summary:
      "Specify the run lifecycle, inputs, outputs, cancellation semantics, and failure states for Agent v1.",
    status: "DONE",
    priority: "HIGH",
    assignee: "owner",
    dueOffsetDays: 2,
  },
  {
    seedId: "AGENT-002",
    projectKey: "AGENT",
    title: "Implement tool registry and permission policy",
    summary:
      "Create a typed tool registry with explicit capabilities, approval requirements, and deny-by-default permissions.",
    status: "IN_REVIEW",
    priority: "CRITICAL",
    assignee: "admin",
    dueOffsetDays: 4,
  },
  {
    seedId: "AGENT-003",
    projectKey: "AGENT",
    title: "Build planner and executor loop",
    summary:
      "Implement the bounded planning loop, execution checkpoints, retry budget, and terminal-state handling.",
    status: "IN_PROGRESS",
    priority: "HIGH",
    assignee: "engineer",
    dueOffsetDays: 7,
  },
  {
    seedId: "AGENT-004",
    projectKey: "AGENT",
    title: "Persist run and trace metadata",
    summary:
      "Store synthetic run metadata and redacted traces needed for debugging and evaluation.",
    status: "TODO",
    priority: "HIGH",
    assignee: "engineer",
    dueOffsetDays: 10,
  },
  {
    seedId: "AGENT-005",
    projectKey: "AGENT",
    title: "Add human approval checkpoints",
    summary:
      "Require explicit approval before tools perform high-impact or externally visible actions.",
    status: "IN_REVIEW",
    priority: "CRITICAL",
    assignee: "admin",
    dueOffsetDays: 14,
  },
  {
    seedId: "AGENT-006",
    projectKey: "AGENT",
    title: "Create prompt evaluation fixtures",
    summary:
      "Add deterministic fictional scenarios for planning quality, tool safety, and recovery behavior.",
    status: "TODO",
    priority: "MEDIUM",
    assignee: "reviewer",
    dueOffsetDays: 21,
  },
  {
    seedId: "AGENT-007",
    projectKey: "AGENT",
    title: "Add streaming activity timeline",
    summary:
      "Expose a concise activity timeline for plans, tool calls, approvals, and final outcomes.",
    status: "BACKLOG",
    priority: "MEDIUM",
    assignee: "engineer",
    dueOffsetDays: 2,
  },
  {
    seedId: "AGENT-008",
    projectKey: "AGENT",
    title: "Document Agent v1 architecture",
    summary:
      "Document component boundaries, trust assumptions, extension points, and operational constraints.",
    status: "DONE",
    priority: "LOW",
    assignee: "owner",
    dueOffsetDays: 4,
  },
  {
    seedId: "PLAT-001",
    projectKey: "PLAT",
    title: "Add local agent-worker health check",
    summary:
      "Report worker readiness and dependency health without exposing configuration or credentials.",
    status: "IN_PROGRESS",
    priority: "HIGH",
    assignee: "admin",
    dueOffsetDays: 7,
  },
  {
    seedId: "PLAT-002",
    projectKey: "PLAT",
    title: "Add redacted structured logging",
    summary:
      "Emit correlated structured events while redacting tokens, cookies, prompts, and private payloads.",
    status: "TODO",
    priority: "HIGH",
    assignee: "engineer",
    dueOffsetDays: 10,
  },
  {
    seedId: "PLAT-003",
    projectKey: "PLAT",
    title: "Add CI smoke test for agent workflow",
    summary:
      "Exercise one deterministic no-network agent workflow and verify its approval and trace events.",
    status: "BACKLOG",
    priority: "MEDIUM",
    assignee: "reviewer",
    dueOffsetDays: 14,
  },
  {
    seedId: "PLAT-004",
    projectKey: "PLAT",
    title: "Write rollback and incident runbook",
    summary:
      "Describe safe shutdown, rollback, evidence collection, and recovery for agent-worker incidents.",
    status: "TODO",
    priority: "MEDIUM",
    assignee: "owner",
    dueOffsetDays: 21,
  },
];

const accountByKey = new Map(accounts.map((account) => [account.key, account]));
const accountByEmail = new Map(
  accounts.map((account) => [account.email.toLowerCase(), account]),
);
const projectSpecByKey = new Map(
  projectSpecs.map((project) => [project.key, project]),
);
const issueSpecById = new Map(issueSpecs.map((issue) => [issue.seedId, issue]));
const activeSessions = new Set();

class SeedError extends Error {}

class HttpStatusError extends SeedError {
  constructor(service, method, status) {
    super(`${service} ${method} request failed with HTTP ${status}`);
    this.status = status;
  }
}

function ensureNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (!Number.isInteger(major) || major < 24) {
    throw new SeedError("This seed script requires Node.js 24 or newer");
  }
}

function readPassword() {
  const value = process.env.NEXORA_DEMO_PASSWORD;
  delete process.env.NEXORA_DEMO_PASSWORD;
  if (typeof value !== "string" || value.length < 12 || value.length > 128) {
    throw new SeedError(
      "NEXORA_DEMO_PASSWORD must be set to a value between 12 and 128 characters",
    );
  }
  return value;
}

function parseLoopbackOrigin(environmentName, fallback) {
  const raw = process.env[environmentName] || fallback;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new SeedError(`${environmentName} must be a valid absolute URL`);
  }

  const hostname = url.hostname.toLowerCase();
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !loopbackHosts.has(hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new SeedError(
      `${environmentName} must be an HTTP(S) loopback origin without credentials, path, query, or fragment`,
    );
  }

  return new URL(url.origin);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response) {
  const header = response.headers.get("retry-after");
  if (header && /^\d+$/.test(header)) {
    return Math.min(60_000, Math.max(1_000, Number(header) * 1_000));
  }
  if (header) {
    const date = Date.parse(header);
    if (Number.isFinite(date)) {
      return Math.min(60_000, Math.max(1_000, date - Date.now()));
    }
  }
  return 60_000;
}

function asObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SeedError(`${label} returned an unexpected response`);
  }
  return value;
}

function asArray(value, label) {
  if (!Array.isArray(value)) {
    throw new SeedError(`${label} returned an unexpected response`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new SeedError(`${label} returned an unexpected response`);
  }
  return value;
}

function requireUuid(value, label) {
  const id = requireString(value, label);
  if (!UUID_PATTERN.test(id)) {
    throw new SeedError(`${label} returned an unexpected identifier`);
  }
  return id;
}

function parseResponseBody(response, text) {
  if (!text) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) return text;
  try {
    return JSON.parse(text);
  } catch {
    throw new SeedError("A local service returned malformed JSON");
  }
}

class LocalHttpClient {
  constructor(service, baseUrl, origin = null) {
    this.service = service;
    this.baseUrl = baseUrl;
    this.origin = origin;
    this.cookie = null;
  }

  absorbSessionCookie(headers) {
    const values =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : [headers.get("set-cookie")].filter(Boolean);

    for (const value of values) {
      const cookie = value.split(";", 1)[0] ?? "";
      const separator = cookie.indexOf("=");
      if (separator < 0 || cookie.slice(0, separator) !== "nexora_session") {
        continue;
      }
      const token = cookie.slice(separator + 1);
      if (!token) {
        this.cookie = null;
        continue;
      }
      if (!TOKEN_PATTERN.test(token)) {
        throw new SeedError("The API returned an invalid session cookie");
      }
      this.cookie = `nexora_session=${token}`;
    }
  }

  async request(method, path, options = {}) {
    const normalizedMethod = method.toUpperCase();
    const expected = new Set(options.expected ?? [200]);
    const maxAttempts = options.retryRateLimit === false ? 1 : 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const headers = { Accept: "application/json" };
      if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
      }
      if (this.origin && !SAFE_METHODS.has(normalizedMethod)) {
        headers.Origin = this.origin;
      }
      if (this.cookie) {
        headers.Cookie = this.cookie;
      }

      let response;
      try {
        response = await fetch(new URL(path, this.baseUrl), {
          method: normalizedMethod,
          headers,
          body:
            options.body === undefined
              ? undefined
              : JSON.stringify(options.body),
          redirect: "error",
          signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
        });
      } catch {
        throw new SeedError(`${this.service} is unavailable on loopback`);
      }

      this.absorbSessionCookie(response.headers);

      if (response.status === 429 && attempt < maxAttempts) {
        await response.arrayBuffer();
        const delay = retryDelay(response);
        console.log(
          `Local API rate limit reached; retrying in ${Math.ceil(delay / 1_000)} seconds.`,
        );
        await sleep(delay);
        continue;
      }

      const text = await response.text();
      if (!expected.has(response.status)) {
        throw new HttpStatusError(
          this.service,
          normalizedMethod,
          response.status,
        );
      }
      return {
        status: response.status,
        data: parseResponseBody(response, text),
      };
    }

    throw new SeedError(`${this.service} request retry budget was exhausted`);
  }
}

function apiSession(apiBaseUrl) {
  const client = new LocalHttpClient(
    "NEXORA API",
    apiBaseUrl,
    apiBaseUrl.origin,
  );
  activeSessions.add(client);
  return client;
}

async function validateLocalServices(api, mailpit) {
  const health = await api.request("GET", "/api/health/db");
  const healthData = asObject(health.data, "Database health endpoint");
  if (healthData.status !== "ok" || healthData.database !== "connected") {
    throw new SeedError("The loopback NEXORA database is not healthy");
  }

  const info = await mailpit.request("GET", "/api/v1/info");
  asObject(info.data, "Mailpit info endpoint");
}

async function getMe(client) {
  const response = await client.request("GET", "/api/auth/me");
  const user = asObject(response.data, "Current-user endpoint");
  return {
    id: requireUuid(user.id, "Current-user endpoint"),
    email: requireString(user.email, "Current-user endpoint").toLowerCase(),
    name: requireString(user.name, "Current-user endpoint"),
    emailVerified: user.emailVerified === true,
  };
}

async function loginOrRegister(
  apiBaseUrl,
  account,
  password,
  invitationToken = null,
) {
  const client = apiSession(apiBaseUrl);
  let login = await client.request("POST", "/api/auth/login", {
    body: { email: account.email, password },
    expected: [200, 401],
  });

  if (login.status === 401) {
    const registrationBody = {
      email: account.email,
      name: account.name,
      password,
      ...(invitationToken ? { invitationToken } : {}),
    };
    const registration = await client.request("POST", "/api/auth/register", {
      body: registrationBody,
      expected: [201, 403, 409],
    });
    if (registration.status === 403) {
      throw new SeedError(
        invitationToken
          ? `${account.label} registration was rejected; verify the pending local invitation`
          : "Owner registration was rejected; use public local registration or bootstrap an empty local database first",
      );
    }
    if (registration.status === 409) {
      throw new SeedError(
        `${account.label} already exists but the supplied demo password does not authenticate; refusing to reset it`,
      );
    }

    login = await client.request("POST", "/api/auth/login", {
      body: { email: account.email, password },
      expected: [200],
    });
  }

  if (!client.cookie) {
    throw new SeedError(`${account.label} login did not establish a session`);
  }

  const me = await getMe(client);
  if (me.email !== account.email || me.name !== account.name) {
    throw new SeedError(
      `${account.label} conflicts with an existing account; refusing to overwrite it`,
    );
  }
  return { client, me };
}

function addressMatches(recipient, email) {
  if (!recipient || typeof recipient !== "object") return false;
  const address = recipient.Address ?? recipient.Email;
  return typeof address === "string" && address.toLowerCase() === email;
}

function extractBearerToken(text, expectedOrigin, expectedPath) {
  if (typeof text !== "string") return null;
  const matches = text.match(/https?:\/\/[^\s<>"']+/giu) ?? [];
  for (const match of matches) {
    const candidate = match.replace(/[),.;]+$/u, "");
    let url;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (url.origin !== expectedOrigin || url.pathname !== expectedPath) {
      continue;
    }
    const token = new URLSearchParams(url.hash.slice(1)).get("token");
    if (token && TOKEN_PATTERN.test(token)) return token;
  }
  return null;
}

async function waitForMailToken({
  mailpit,
  recipient,
  subject,
  notBefore,
  expectedOrigin,
  expectedPath,
}) {
  const deadline = Date.now() + 35_000;
  const minimumCreatedAt = notBefore - 5_000;

  while (Date.now() < deadline) {
    const query = new URLSearchParams({
      query: `to:${recipient}`,
      start: "0",
      limit: "50",
    });
    const search = await mailpit.request(
      "GET",
      `/api/v1/search?${query.toString()}`,
      { timeoutMs: 10_000 },
    );
    const result = asObject(search.data, "Mailpit search endpoint");
    const messages = asArray(result.messages, "Mailpit search endpoint")
      .filter((message) => {
        if (!message || typeof message !== "object") return false;
        const createdAt = Date.parse(message.Created);
        return (
          message.Subject === subject &&
          Number.isFinite(createdAt) &&
          createdAt >= minimumCreatedAt &&
          Array.isArray(message.To) &&
          message.To.some((entry) => addressMatches(entry, recipient))
        );
      })
      .sort(
        (left, right) => Date.parse(right.Created) - Date.parse(left.Created),
      );

    for (const summary of messages) {
      const id = requireString(summary.ID, "Mailpit search endpoint");
      const messageResponse = await mailpit.request(
        "GET",
        `/api/v1/message/${encodeURIComponent(id)}`,
        { timeoutMs: 10_000 },
      );
      const message = asObject(
        messageResponse.data,
        "Mailpit message endpoint",
      );
      if (
        message.Subject !== subject ||
        !Array.isArray(message.To) ||
        !message.To.some((entry) => addressMatches(entry, recipient))
      ) {
        continue;
      }
      const token = extractBearerToken(
        message.Text,
        expectedOrigin,
        expectedPath,
      );
      if (token) return token;
    }

    await sleep(1_000);
  }

  throw new SeedError(
    `Mailpit did not receive the expected ${expectedPath === "/verify-email" ? "verification" : "invitation"} message`,
  );
}

async function ensureVerified(client, account, me, mailpit, apiBaseUrl) {
  if (me.emailVerified) return me;

  const requestedAt = Date.now();
  const request = await client.request(
    "POST",
    "/api/auth/email-verification/request",
    { expected: [201] },
  );
  const result = asObject(request.data, "Email-verification endpoint");
  if (result.status === "verified") return getMe(client);
  if (result.status !== "sent") {
    throw new SeedError(
      "Email-verification endpoint returned an unexpected state",
    );
  }

  const token = await waitForMailToken({
    mailpit,
    recipient: account.email,
    subject: VERIFICATION_SUBJECT,
    notBefore: requestedAt,
    expectedOrigin: apiBaseUrl.origin,
    expectedPath: "/verify-email",
  });
  await client.request("POST", "/api/auth/email-verification/confirm", {
    body: { token },
    expected: [200],
  });

  const verified = await getMe(client);
  if (!verified.emailVerified) {
    throw new SeedError(`${account.label} email verification did not persist`);
  }
  return verified;
}

function validateOrganization(value) {
  const organization = asObject(value, "Organizations endpoint");
  return {
    id: requireUuid(organization.id, "Organizations endpoint"),
    name: requireString(organization.name, "Organizations endpoint"),
    role: requireString(organization.role, "Organizations endpoint"),
  };
}

async function listOrganizations(client) {
  const response = await client.request("GET", "/api/organizations");
  return asArray(response.data, "Organizations endpoint").map(
    validateOrganization,
  );
}

async function ensureOrganization(ownerClient) {
  const organizations = await listOrganizations(ownerClient);
  const matching = organizations.filter(
    (organization) => organization.name === ORGANIZATION_NAME,
  );

  if (matching.length > 1 || organizations.length > 1) {
    throw new SeedError(
      "The demo owner belongs to unexpected organizations; refusing to select or overwrite one",
    );
  }
  if (matching.length === 1) {
    if (matching[0].role !== "OWNER") {
      throw new SeedError(
        "The existing demo organization has an unexpected owner role",
      );
    }
    return matching[0];
  }
  if (organizations.length !== 0) {
    throw new SeedError(
      "The demo owner already belongs to a differently named organization",
    );
  }

  const created = await ownerClient.request("POST", "/api/organizations", {
    body: { name: ORGANIZATION_NAME },
    expected: [201],
  });
  const organization = validateOrganization(created.data);
  if (
    organization.name !== ORGANIZATION_NAME ||
    organization.role !== "OWNER"
  ) {
    throw new SeedError(
      "The created organization does not match the demo manifest",
    );
  }
  return organization;
}

async function validateAccountOrganizations(
  client,
  organizationId,
  expectedRole,
  allowMissing,
) {
  const organizations = await listOrganizations(client);
  if (
    organizations.some((organization) => organization.id !== organizationId) ||
    organizations.length > 1
  ) {
    throw new SeedError(
      "A demo account belongs to an unexpected organization; refusing to modify it",
    );
  }
  if (organizations.length === 0) {
    if (allowMissing) return;
    throw new SeedError("A demo account is missing its expected organization");
  }
  if (organizations[0].role !== expectedRole) {
    throw new SeedError(
      "A demo account has an unexpected organization role; refusing to overwrite it",
    );
  }
}

function validateMember(value) {
  const membership = asObject(value, "Organization members endpoint");
  const user = asObject(membership.user, "Organization members endpoint");
  return {
    id: requireUuid(user.id, "Organization members endpoint"),
    email: requireString(
      user.email,
      "Organization members endpoint",
    ).toLowerCase(),
    name: requireString(user.name, "Organization members endpoint"),
    role: requireString(membership.role, "Organization members endpoint"),
  };
}

async function listMembers(client, organizationId) {
  const response = await client.request(
    "GET",
    `/api/organizations/${encodeURIComponent(organizationId)}/members`,
  );
  return asArray(response.data, "Organization members endpoint").map(
    validateMember,
  );
}

function validateMemberSet(members, allowMissing) {
  const seen = new Set();
  for (const member of members) {
    if (seen.has(member.email)) {
      throw new SeedError(
        "The demo organization contains duplicate memberships",
      );
    }
    seen.add(member.email);
    const expected = accountByEmail.get(member.email);
    if (!expected) {
      throw new SeedError(
        "The demo organization contains an unexpected member; refusing to remove it",
      );
    }
    if (member.name !== expected.name || member.role !== expected.role) {
      throw new SeedError(
        `${expected.label} membership differs from the demo manifest; refusing to overwrite it`,
      );
    }
  }

  const owner = members.find(
    (member) => member.email === accountByKey.get("owner").email,
  );
  if (!owner) {
    throw new SeedError("The demo organization is missing its expected owner");
  }
  if (!allowMissing && members.length !== accounts.length) {
    throw new SeedError("The demo organization membership set is incomplete");
  }
}

async function listInvitations(client, organizationId) {
  const response = await client.request(
    "GET",
    `/api/organizations/${encodeURIComponent(organizationId)}/invitations`,
  );
  return asArray(response.data, "Invitations endpoint").map((value) => {
    const invitation = asObject(value, "Invitations endpoint");
    return {
      id: requireUuid(invitation.id, "Invitations endpoint"),
      email: requireString(
        invitation.email,
        "Invitations endpoint",
      ).toLowerCase(),
      role: requireString(invitation.role, "Invitations endpoint"),
      createdAt: requireString(invitation.createdAt, "Invitations endpoint"),
    };
  });
}

function validateInvitationSet(invitations, members) {
  const memberEmails = new Set(members.map((member) => member.email));
  const seen = new Set();
  for (const invitation of invitations) {
    if (seen.has(invitation.email)) {
      throw new SeedError(
        "Duplicate active invitations exist in the demo organization",
      );
    }
    seen.add(invitation.email);
    const expected = accountByEmail.get(invitation.email);
    if (!expected || expected.role === "OWNER") {
      throw new SeedError(
        "The demo organization contains an unexpected active invitation; refusing to revoke it",
      );
    }
    if (
      memberEmails.has(invitation.email) ||
      invitation.role !== expected.role
    ) {
      throw new SeedError(
        `${expected.label} invitation differs from the demo manifest; refusing to overwrite it`,
      );
    }
  }
}

function validateProject(value) {
  const project = asObject(value, "Projects endpoint");
  return {
    id: requireUuid(project.id, "Projects endpoint"),
    organizationId: requireUuid(project.organizationId, "Projects endpoint"),
    name: requireString(project.name, "Projects endpoint"),
    key: requireString(project.key, "Projects endpoint"),
  };
}

async function listProjects(client, organizationId) {
  const projects = [];
  for (let page = 1; page <= 100; page += 1) {
    const response = await client.request(
      "GET",
      `/api/organizations/${encodeURIComponent(organizationId)}/projects?page=${page}&limit=100`,
    );
    const data = asObject(response.data, "Projects endpoint");
    const items = asArray(data.items, "Projects endpoint").map(validateProject);
    projects.push(...items);
    const totalPages = Number(data.totalPages);
    if (!Number.isInteger(totalPages) || totalPages < 0) {
      throw new SeedError("Projects endpoint returned invalid pagination");
    }
    if (page >= totalPages) return projects;
    if (items.length === 0) {
      throw new SeedError("Projects endpoint returned inconsistent pagination");
    }
  }
  throw new SeedError("Projects endpoint exceeded the pagination safety limit");
}

function validateProjectSet(projects, organizationId) {
  const seen = new Set();
  for (const project of projects) {
    if (project.organizationId !== organizationId || seen.has(project.key)) {
      throw new SeedError(
        "The demo organization contains inconsistent projects",
      );
    }
    seen.add(project.key);
    const expected = projectSpecByKey.get(project.key);
    if (!expected) {
      throw new SeedError(
        "The demo organization contains an unexpected project; refusing to remove it",
      );
    }
    if (project.name !== expected.name) {
      throw new SeedError(
        `Project ${project.key} differs from the demo manifest; refusing to overwrite it`,
      );
    }
  }
}

function validateIssue(value, label = "Issues endpoint") {
  const issue = asObject(value, label);
  return {
    id: requireUuid(issue.id, label),
    projectId: requireUuid(issue.projectId, label),
    title: requireString(issue.title, label),
    description:
      issue.description === null || typeof issue.description === "string"
        ? issue.description
        : null,
    status: requireString(issue.status, label),
    priority: requireString(issue.priority, label),
    assigneeId:
      issue.assigneeId === null ? null : requireUuid(issue.assigneeId, label),
    dueDate: issue.dueDate,
  };
}

async function listIssues(client, organizationId, projectId) {
  const issues = [];
  for (let page = 1; page <= 1_000; page += 1) {
    const response = await client.request(
      "GET",
      `/api/organizations/${encodeURIComponent(organizationId)}/projects/${encodeURIComponent(projectId)}/issues?page=${page}&limit=100`,
    );
    const data = asObject(response.data, "Issues endpoint");
    const items = asArray(data.items, "Issues endpoint").map((value) =>
      validateIssue(value),
    );
    issues.push(...items);
    const totalPages = Number(data.totalPages);
    if (!Number.isInteger(totalPages) || totalPages < 0) {
      throw new SeedError("Issues endpoint returned invalid pagination");
    }
    if (page >= totalPages) return issues;
    if (items.length === 0) {
      throw new SeedError("Issues endpoint returned inconsistent pagination");
    }
  }
  throw new SeedError("Issues endpoint exceeded the pagination safety limit");
}

function validDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function readCaptureDate() {
  const value = process.env.NEXORA_CAPTURE_DATE;
  if (value === undefined || value === "") {
    return new Date().toISOString().slice(0, 10);
  }
  if (!validDateOnly(value)) {
    throw new SeedError(
      "NEXORA_CAPTURE_DATE must be a valid UTC date in YYYY-MM-DD format",
    );
  }
  return value;
}

function dateOnlyFromApi(value) {
  if (typeof value !== "string") return null;
  const date = value.slice(0, 10);
  return validDateOnly(date) ? date : null;
}

function addUtcDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function issueDescription(spec, captureDate) {
  return `${spec.summary}\n\nSeed-ID: ${DEMO_NAMESPACE}/${spec.seedId}\nSeed-Capture-Date: ${captureDate}`;
}

function issueMetadata(description) {
  if (typeof description !== "string") return { kind: "unmanaged" };
  const seedMatches = [...description.matchAll(/^Seed-ID:\s*(.*?)\s*$/gmu)];
  const reservedMatches = seedMatches.filter((match) => {
    const value = match[1].trim();
    return value === "nexora-demo" || value.startsWith("nexora-demo/");
  });
  if (reservedMatches.length === 0) return { kind: "unmanaged" };
  if (seedMatches.length !== 1 || reservedMatches.length !== 1) {
    throw new SeedError(
      "An issue contains duplicate or ambiguous Seed-ID metadata in the reserved demo namespace",
    );
  }

  const prefix = `${DEMO_NAMESPACE}/`;
  const fullSeedId = reservedMatches[0][1].trim();
  if (!fullSeedId.startsWith(prefix)) {
    throw new SeedError(
      `An issue uses the unknown reserved seed namespace ${fullSeedId}`,
    );
  }
  const seedId = fullSeedId.slice(prefix.length);
  if (!issueSpecById.has(seedId)) {
    throw new SeedError(
      `An issue uses the unknown reserved Seed-ID ${fullSeedId}`,
    );
  }

  const captureMatches = [
    ...description.matchAll(/^Seed-Capture-Date:\s*(.*?)\s*$/gmu),
  ];
  const captureDate = captureMatches[0]?.[1].trim();
  if (captureMatches.length !== 1 || !validDateOnly(captureDate ?? "")) {
    throw new SeedError(
      `Managed issue ${fullSeedId} has missing, duplicate, or invalid capture-date metadata`,
    );
  }
  return {
    kind: "managed",
    seedId,
    captureDate,
  };
}

function buildIssueManifest(captureDate, memberIdByKey) {
  return issueSpecs.map((spec) => {
    const assigneeId = memberIdByKey.get(spec.assignee);
    if (!assigneeId) {
      throw new SeedError(
        `Cannot reconcile ${spec.seedId} before its expected assignee is a member`,
      );
    }
    return {
      ...spec,
      description: issueDescription(spec, captureDate),
      assigneeId,
      dueDate: addUtcDays(captureDate, spec.dueOffsetDays),
    };
  });
}

function memberIdsByKey(members) {
  const result = new Map();
  for (const member of members) {
    const account = accountByEmail.get(member.email);
    if (account) result.set(account.key, member.id);
  }
  return result;
}

async function inspectExistingIssues(client, organizationId, projects) {
  const existing = new Map();
  let unmanagedCount = 0;

  for (const project of projects) {
    const issues = await listIssues(client, organizationId, project.id);
    for (const issue of issues) {
      if (issue.projectId !== project.id) {
        throw new SeedError("Issues endpoint returned a cross-project record");
      }
      const metadata = issueMetadata(issue.description);
      if (metadata.kind === "unmanaged") {
        unmanagedCount += 1;
        continue;
      }
      const spec = issueSpecById.get(metadata.seedId);
      if (spec.projectKey !== project.key) {
        throw new SeedError(
          `Managed issue ${metadata.seedId} is in the wrong demo project`,
        );
      }
      if (existing.has(metadata.seedId)) {
        throw new SeedError(
          `Duplicate reserved Seed-ID ${DEMO_NAMESPACE}/${metadata.seedId} exists`,
        );
      }
      existing.set(metadata.seedId, { issue, project });
    }
  }

  return { existing, unmanagedCount };
}

async function obtainInvitationToken({
  ownerClient,
  mailpit,
  apiBaseUrl,
  organization,
  account,
  invitations,
}) {
  let invitation = invitations.find((item) => item.email === account.email);
  let notBefore;
  if (invitation) {
    notBefore = Date.parse(invitation.createdAt);
    if (!Number.isFinite(notBefore)) {
      throw new SeedError("Existing invitation has an invalid creation time");
    }
  } else {
    notBefore = Date.now();
    const response = await ownerClient.request(
      "POST",
      `/api/organizations/${encodeURIComponent(organization.id)}/invitations`,
      {
        body: { email: account.email, role: account.role },
        expected: [201],
      },
    );
    const created = asObject(response.data, "Invitation creation endpoint");
    if (
      Object.hasOwn(created, "token") ||
      Object.hasOwn(created, "tokenHash") ||
      Object.hasOwn(created, "invitationLink")
    ) {
      throw new SeedError(
        "Invitation creation unexpectedly exposed a bearer secret",
      );
    }
    invitation = {
      id: requireUuid(created.id, "Invitation creation endpoint"),
      email: requireString(
        created.email,
        "Invitation creation endpoint",
      ).toLowerCase(),
      role: requireString(created.role, "Invitation creation endpoint"),
      createdAt: requireString(
        created.createdAt,
        "Invitation creation endpoint",
      ),
    };
    if (
      invitation.email !== account.email ||
      invitation.role !== account.role
    ) {
      throw new SeedError(
        "Created invitation does not match the demo manifest",
      );
    }
  }

  return waitForMailToken({
    mailpit,
    recipient: account.email,
    subject: `You're invited to ${ORGANIZATION_NAME} on NEXORA`,
    notBefore,
    expectedOrigin: apiBaseUrl.origin,
    expectedPath: "/invitations/accept",
  });
}

async function ensureTeam({
  ownerClient,
  mailpit,
  apiBaseUrl,
  organization,
  password,
}) {
  for (const account of accounts.filter(
    (candidate) => candidate.role !== "OWNER",
  )) {
    let members = await listMembers(ownerClient, organization.id);
    validateMemberSet(members, true);
    const existingMember = members.find(
      (member) => member.email === account.email,
    );

    if (existingMember) {
      const login = await loginOrRegister(apiBaseUrl, account, password);
      await validateAccountOrganizations(
        login.client,
        organization.id,
        account.role,
        false,
      );
      await ensureVerified(
        login.client,
        account,
        login.me,
        mailpit,
        apiBaseUrl,
      );
      continue;
    }

    const invitations = await listInvitations(ownerClient, organization.id);
    validateInvitationSet(invitations, members);
    const invitationToken = await obtainInvitationToken({
      ownerClient,
      mailpit,
      apiBaseUrl,
      organization,
      account,
      invitations,
    });
    const login = await loginOrRegister(
      apiBaseUrl,
      account,
      password,
      invitationToken,
    );
    await validateAccountOrganizations(
      login.client,
      organization.id,
      account.role,
      true,
    );
    await ensureVerified(login.client, account, login.me, mailpit, apiBaseUrl);

    const accepted = await login.client.request(
      "POST",
      "/api/invitations/accept",
      {
        body: { token: invitationToken },
        expected: [201, 409],
      },
    );
    members = await listMembers(ownerClient, organization.id);
    validateMemberSet(members, true);
    const added = members.find((member) => member.email === account.email);
    if (!added || added.role !== account.role) {
      throw new SeedError(
        accepted.status === 409
          ? `${account.label} invitation was already claimed without the expected membership`
          : `${account.label} membership was not created`,
      );
    }
    await validateAccountOrganizations(
      login.client,
      organization.id,
      account.role,
      false,
    );
  }

  const members = await listMembers(ownerClient, organization.id);
  validateMemberSet(members, false);
  const invitations = await listInvitations(ownerClient, organization.id);
  validateInvitationSet(invitations, members);
  if (invitations.length !== 0) {
    throw new SeedError("Active invitations remain after team reconciliation");
  }
  return members;
}

async function ensureProjects(client, organizationId) {
  let projects = await listProjects(client, organizationId);
  validateProjectSet(projects, organizationId);
  const existingKeys = new Set(projects.map((project) => project.key));

  for (const spec of projectSpecs) {
    if (existingKeys.has(spec.key)) continue;
    const response = await client.request(
      "POST",
      `/api/organizations/${encodeURIComponent(organizationId)}/projects`,
      {
        body: { name: spec.name, key: spec.key },
        expected: [201],
      },
    );
    const created = validateProject(response.data);
    if (
      created.organizationId !== organizationId ||
      created.name !== spec.name ||
      created.key !== spec.key
    ) {
      throw new SeedError(
        `Created project ${spec.key} does not match the manifest`,
      );
    }
  }

  projects = await listProjects(client, organizationId);
  validateProjectSet(projects, organizationId);
  if (projects.length !== projectSpecs.length) {
    throw new SeedError("The demo project set is incomplete");
  }
  return projects;
}

function issueRequestBody(issue) {
  return {
    title: issue.title,
    description: issue.description,
    status: issue.status,
    priority: issue.priority,
    assigneeId: issue.assigneeId,
    dueDate: issue.dueDate,
  };
}

function issueMatchesManifest(issue, expected) {
  return (
    issue.title === expected.title &&
    issue.description === expected.description &&
    issue.status === expected.status &&
    issue.priority === expected.priority &&
    issue.assigneeId === expected.assigneeId &&
    dateOnlyFromApi(issue.dueDate) === expected.dueDate
  );
}

function issuePath(organizationId, projectId, issueId = null) {
  const collection = `/api/organizations/${encodeURIComponent(organizationId)}/projects/${encodeURIComponent(projectId)}/issues`;
  return issueId === null
    ? collection
    : `${collection}/${encodeURIComponent(issueId)}`;
}

async function updateManagedIssue({
  client,
  organizationId,
  record,
  expected,
}) {
  const response = await client.request(
    "PATCH",
    issuePath(organizationId, record.project.id, record.issue.id),
    {
      body: issueRequestBody(expected),
      expected: [200, 404, 405, 501],
    },
  );

  if (response.status === 200) {
    const updated = validateIssue(response.data, "Issue update endpoint");
    if (
      updated.id !== record.issue.id ||
      updated.projectId !== record.project.id ||
      !issueMatchesManifest(updated, expected)
    ) {
      throw new SeedError(
        `Updated issue ${expected.seedId} does not match the demo manifest`,
      );
    }
    return true;
  }

  if (response.status === 404) {
    const currentIssues = await listIssues(
      client,
      organizationId,
      record.project.id,
    );
    const current = currentIssues.find((issue) => issue.id === record.issue.id);
    if (!current) {
      throw new SeedError(
        `Managed issue ${expected.seedId} disappeared during reconciliation`,
      );
    }
    const metadata = issueMetadata(current.description);
    if (metadata.kind !== "managed" || metadata.seedId !== expected.seedId) {
      throw new SeedError(
        `Managed issue ${expected.seedId} changed identity during reconciliation`,
      );
    }
  }

  return false;
}

async function ensureIssues({
  client,
  organizationId,
  projects,
  members,
  captureDate,
}) {
  const manifest = buildIssueManifest(captureDate, memberIdsByKey(members));
  const projectByKey = new Map(
    projects.map((project) => [project.key, project]),
  );
  const inspection = await inspectExistingIssues(
    client,
    organizationId,
    projects,
  );
  let createdCount = 0;
  let updatedCount = 0;
  let updateSupported = true;
  const preservedSeedIds = new Set();

  for (const issue of manifest) {
    const existing = inspection.existing.get(issue.seedId);
    if (existing) {
      if (issueMatchesManifest(existing.issue, issue)) continue;
      if (!updateSupported) {
        preservedSeedIds.add(issue.seedId);
        continue;
      }
      updateSupported = await updateManagedIssue({
        client,
        organizationId,
        record: existing,
        expected: issue,
      });
      if (updateSupported) {
        updatedCount += 1;
      } else {
        preservedSeedIds.add(issue.seedId);
      }
      continue;
    }

    const project = projectByKey.get(issue.projectKey);
    if (!project) {
      throw new SeedError(`Project ${issue.projectKey} is missing`);
    }
    const response = await client.request(
      "POST",
      issuePath(organizationId, project.id),
      {
        body: issueRequestBody(issue),
        expected: [201],
      },
    );
    const created = validateIssue(response.data, "Issue creation endpoint");
    if (
      created.projectId !== project.id ||
      !issueMatchesManifest(created, issue)
    ) {
      throw new SeedError(
        `Created issue ${issue.seedId} does not match the demo manifest`,
      );
    }
    createdCount += 1;
  }

  const finalInspection = await inspectExistingIssues(
    client,
    organizationId,
    projects,
  );
  if (finalInspection.existing.size !== issueSpecs.length) {
    throw new SeedError(
      "The demo issue set is incomplete after reconciliation",
    );
  }

  const finalPreservedSeedIds = [];
  for (const expected of manifest) {
    const record = finalInspection.existing.get(expected.seedId);
    if (!record) {
      throw new SeedError(
        `Managed issue ${expected.seedId} is missing after reconciliation`,
      );
    }
    if (issueMatchesManifest(record.issue, expected)) continue;
    if (!updateSupported && preservedSeedIds.has(expected.seedId)) {
      finalPreservedSeedIds.push(expected.seedId);
      continue;
    }
    throw new SeedError(
      `Managed issue ${expected.seedId} differs from the demo manifest after reconciliation`,
    );
  }

  return {
    createdCount,
    updatedCount,
    unmanagedCount: finalInspection.unmanagedCount,
    preservedSeedIds: finalPreservedSeedIds,
    updateSupported,
  };
}

async function logoutSessions() {
  let failed = false;
  for (const client of activeSessions) {
    if (!client.cookie) continue;
    try {
      await client.request("POST", "/api/auth/logout", {
        expected: [204],
        retryRateLimit: false,
      });
    } catch {
      failed = true;
    }
  }
  if (failed) {
    console.warn("One or more local demo sessions could not be logged out.");
  }
}

async function main() {
  ensureNodeVersion();
  const password = readPassword();
  const captureDate = readCaptureDate();
  const apiBaseUrl = parseLoopbackOrigin(
    "NEXORA_DEMO_BASE_URL",
    "http://localhost:8080",
  );
  const mailpitBaseUrl = parseLoopbackOrigin(
    "NEXORA_DEMO_MAILPIT_URL",
    "http://localhost:8026",
  );
  const anonymousApi = new LocalHttpClient(
    "NEXORA API",
    apiBaseUrl,
    apiBaseUrl.origin,
  );
  const mailpit = new LocalHttpClient("Mailpit", mailpitBaseUrl);

  await validateLocalServices(anonymousApi, mailpit);
  console.log("Validated loopback-only NEXORA and Mailpit services.");

  const ownerAccount = accountByKey.get("owner");
  const ownerLogin = await loginOrRegister(apiBaseUrl, ownerAccount, password);
  const organization = await ensureOrganization(ownerLogin.client);

  let members = await listMembers(ownerLogin.client, organization.id);
  validateMemberSet(members, true);
  let invitations = await listInvitations(ownerLogin.client, organization.id);
  validateInvitationSet(invitations, members);
  let projects = await listProjects(ownerLogin.client, organization.id);
  validateProjectSet(projects, organization.id);
  await inspectExistingIssues(ownerLogin.client, organization.id, projects);

  await ensureVerified(
    ownerLogin.client,
    ownerAccount,
    ownerLogin.me,
    mailpit,
    apiBaseUrl,
  );
  console.log("Demo owner and organization are ready.");

  members = await ensureTeam({
    ownerClient: ownerLogin.client,
    mailpit,
    apiBaseUrl,
    organization,
    password,
  });
  console.log("Demo team is ready (1 owner, 1 admin, 2 members).");

  projects = await ensureProjects(ownerLogin.client, organization.id);
  console.log("Demo projects are ready.");

  const issueResult = await ensureIssues({
    client: ownerLogin.client,
    organizationId: organization.id,
    projects,
    members,
    captureDate,
  });
  console.log(
    `Demo issues are ready (${issueResult.createdCount} created, ${issueResult.updatedCount} updated).`,
  );
  if (issueResult.unmanagedCount > 0) {
    console.log(
      `Ignored ${issueResult.unmanagedCount} unmanaged issue(s); none were changed or deleted.`,
    );
  }
  if (!issueResult.updateSupported) {
    console.warn(
      `The issue update API is unavailable; preserved ${issueResult.preservedSeedIds.length} managed issue(s) with drift: ${issueResult.preservedSeedIds.join(", ")}.`,
    );
    console.warn(
      `Those preserved records may not reflect the requested UTC capture date ${captureDate}.`,
    );
  }

  invitations = await listInvitations(ownerLogin.client, organization.id);
  validateInvitationSet(invitations, members);
  if (invitations.length !== 0) {
    throw new SeedError("Final verification found active invitations");
  }

  console.log("NEXORA local demo seed completed successfully.");
  console.log(`Organization: ${ORGANIZATION_NAME}`);
  console.log(`Requested UTC capture date: ${captureDate}`);
  console.log(
    `Members: ${accounts.length}; projects: ${projectSpecs.length}; issues: ${issueSpecs.length}`,
  );
}

let failure = null;
try {
  await main();
} catch (error) {
  failure = error;
} finally {
  await logoutSessions();
}

if (failure) {
  const message =
    failure instanceof Error
      ? failure.message
      : "Unexpected local seed failure";
  console.error(`NEXORA demo seed failed: ${message}`);
  process.exitCode = 1;
}
