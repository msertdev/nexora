"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { useLocalStorage } from "../hooks/use-local-storage";
import {
  apiClient,
  ApiError,
  type Issue,
  type IssuePriority,
  type IssueStatus,
  type OrganizationMember,
  type Project,
} from "../lib/api-client";
import { useAuth } from "./auth-provider";
import {
  CreateWorkspaceDialog,
  CreateWorkspaceOnboarding,
  MembersDialog,
  WorkspaceSwitcher,
} from "./workspace-management";
import { useWorkspaces } from "./workspace-provider";
import {
  groupTasksByStatus,
  issueStatuses,
  priorityMeta,
  statusMeta,
  taskStatusOrder,
  toIssueStatus,
  toTaskStatus,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "../lib/workspace-data";
import Image from "next/image";

type ThemeMode = "light" | "dark";
type WorkspaceView = "inbox" | "my-issues" | "views" | "roadmap";
type IssueDraft = {
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeId: string;
  dueDate: string;
};
type ApiTask = Task & { identifier: string; projectId: string; assigneeId: string | null };
type IconName =
  | "inbox"
  | "issues"
  | "views"
  | "roadmap"
  | "search"
  | "plus"
  | "edit"
  | "trash"
  | "close"
  | "chevron"
  | "clock"
  | "back"
  | "forward"
  | "filter"
  | "lock";

const THEME_KEY = "nexora.workspace.theme";
const issuePriorities: IssuePriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const projectLimit = 100;
const issueLimit = 100;

function toTaskPriority(priority: IssuePriority): TaskPriority {
  switch (priority) {
    case "CRITICAL": return "Critical";
    case "HIGH": return "High";
    case "MEDIUM": return "Medium";
    case "LOW": return "Low";
  }
}

function toIssuePriority(priority: TaskPriority): IssuePriority {
  switch (priority) {
    case "Critical": return "CRITICAL";
    case "High": return "HIGH";
    case "Medium": return "MEDIUM";
    case "Low": return "LOW";
  }
}

function toApiTask(issue: Issue, projects: Project[]): ApiTask {
  const project = projects.find((item) => item.id === issue.projectId);
  return {
    id: issue.id,
    identifier: issue.identifier,
    projectId: issue.projectId,
    title: issue.title,
    description: issue.description ?? "",
    project: project?.name ?? issue.project.key,
    assignee: issue.assignee?.name ?? "Unassigned",
    assigneeId: issue.assigneeId,
    status: toTaskStatus(issue.status),
    priority: toTaskPriority(issue.priority),
    due: issue.dueDate?.slice(0, 10) ?? "",
  };
}

function projectSelectionKey(userId: string, organizationId: string) {
  return `nexora.project.selected.${userId}.${organizationId}`;
}

function getStoredProject(userId: string, organizationId: string) {
  try {
    return window.localStorage.getItem(projectSelectionKey(userId, organizationId));
  } catch {
    return null;
  }
}

function storeProject(userId: string, organizationId: string, projectId: string | null) {
  try {
    const key = projectSelectionKey(userId, organizationId);
    if (projectId) window.localStorage.setItem(key, projectId);
    else window.localStorage.removeItem(key);
  } catch {
    // Project selection remains available in memory when browser storage is unavailable.
  }
}

function clearStoredProjects(userId: string, organizationIds: string[]) {
  organizationIds.forEach((organizationId) => {
    storeProject(userId, organizationId, null);
  });
}

function formatDate(value: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function getEmptyDraft(): IssueDraft {
  return {
    title: "",
    description: "",
    status: "BACKLOG",
    priority: "MEDIUM",
    assigneeId: "",
    dueDate: "",
  };
}

function getTaskKey(task: ApiTask) {
  return task.identifier;
}

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const common = {
    className,
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  const paths: Record<IconName, ReactNode> = {
    inbox: <><path d="M4 5.5h16l1 11.2a2 2 0 0 1-2 2.3H5a2 2 0 0 1-2-2.3L4 5.5Z" /><path d="M3.5 14h5l1.5 2h4l1.5-2h5" /></>,
    issues: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.5" /><path d="M12 16h.01" /></>,
    views: <><path d="m3 7 9-4 9 4-9 4-9-4Z" /><path d="m3 12 9 4 9-4" /><path d="m3 17 9 4 9-4" /></>,
    roadmap: <><path d="M4 5.5 9 3l6 2.5L20 3v15.5L15 21l-6-2.5L4 21V5.5Z" /><path d="M9 3v15.5M15 5.5V21" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    edit: <><path d="m14 5 5 5" /><path d="M4 20h4l11-11a2.1 2.1 0 0 0-4-2L4 18v2Z" /></>,
    trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    back: <><path d="m14.5 18-6-6 6-6" /><path d="M9 12h11" /></>,
    forward: <><path d="m9.5 18 6-6-6-6" /><path d="M15 12H4" /></>,
    filter: <><path d="M4 6h16M7 12h10m-7 6h4" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function PrioritySignal({ priority }: { priority: TaskPriority }) {
  const strength = priority === "Critical" ? 3 : priority === "High" ? 3 : priority === "Medium" ? 2 : 1;
  return (
    <span
      className={`priority-signal priority-signal--${priority.toLowerCase()}`}
      aria-label={`${priority} priority`}
      title={`${priority} priority`}
    >
      {[1, 2, 3].map((bar) => (
        <span key={bar} className={bar <= strength ? "is-active" : ""} />
      ))}
    </span>
  );
}

function StatusMark({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`status-mark status-mark--${status}`}
      aria-label={statusMeta[status].label}
      title={statusMeta[status].label}
    >
      {status === "review" ? <span /> : null}
      {status === "done" ? <span>✓</span> : null}
    </span>
  );
}

function WorkspaceSignature() {
  return (
    <footer className="workspace-signature">
      <div className="workspace-signature__brand">
        <strong>NEXORA</strong>
        <span>Build better. Together.</span>
      </div>
      <div className="workspace-signature__credit">
        <span>CRAFTED &amp; ENGINEERED BY</span>
        <a
          href="https://github.com/msertdev"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Murat Sert on GitHub"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.56.1.76-.24.76-.54v-2.08c-3.1.68-3.76-1.32-3.76-1.32-.5-1.3-1.24-1.65-1.24-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1 1.72 2.61 1.22 3.25.93.1-.72.39-1.22.71-1.5-2.48-.28-5.09-1.24-5.09-5.52 0-1.22.44-2.22 1.16-3-.12-.29-.5-1.42.11-2.96 0 0 .95-.3 3.05 1.15a10.6 10.6 0 0 1 5.55 0c2.1-1.45 3.05-1.15 3.05-1.15.61 1.54.23 2.67.11 2.96.72.78 1.16 1.78 1.16 3 0 4.29-2.62 5.23-5.11 5.51.4.35.76 1.03.76 2.08v3.08c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z" />
          </svg>
          <strong>MURAT SERT</strong>
        </a>
      </div>
    </footer>
  );
}

function IssueRow({
  task,
  selected,
  onSelect,
  onEdit,
}: {
  task: ApiTask;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  return (
    <div className={`issue-row${selected ? " issue-row--selected" : ""}`}>
      <button type="button" className="issue-row__main" onClick={onSelect}>
        <PrioritySignal priority={task.priority} />
            <span className="issue-row__key" title={getTaskKey(task)}>{getTaskKey(task)}</span>
        <StatusMark status={task.status} />
            <span className="issue-row__title" title={task.title}>{task.title}</span>
            <span className="issue-row__project" title={task.project}>{task.project}</span>
      </button>
      <div className="issue-row__actions">
        <button type="button" onClick={onEdit} aria-label={`Edit ${task.title}`} title="Edit task">
          <Icon name="edit" />
        </button>
      </div>
    </div>
  );
}

function IssueGroup({
  status,
  tasks,
  selectedTaskId,
  onSelect,
  onEdit,
}: {
  status: TaskStatus;
  tasks: ApiTask[];
  selectedTaskId: string | null;
  onSelect: (task: ApiTask) => void;
  onEdit: (task: ApiTask) => void;
}) {
  const title = statusMeta[status].label;
  return (
    <section className="issue-group" aria-label={`${title}, ${tasks.length} issues`}>
      <div className="issue-group__heading">
        <StatusMark status={status} />
        <h2>{title}</h2>
        <span className="issue-group__count">⌃ {tasks.length}</span>
      </div>
      {tasks.length > 0 ? (
        tasks.map((task) => (
          <IssueRow
            key={task.id}
            task={task}
            selected={selectedTaskId === task.id}
            onSelect={() => onSelect(task)}
            onEdit={() => onEdit(task)}
          />
        ))
      ) : (
        <div className="issue-group__empty">No issues in this group</div>
      )}
    </section>
  );
}

function Sidebar({
  view,
  taskCount,
  userName,
  loggingOut,
  canCreateIssue,
  onOpenWorkspaceDialog,
  onNavigate,
  onCreate,
  onSearch,
  onLogout,
}: {
  view: WorkspaceView;
  taskCount: number;
  userName: string;
  loggingOut: boolean;
  canCreateIssue: boolean;
  onOpenWorkspaceDialog: (dialog: "create" | "members" | null) => void;
  onNavigate: (nextView: WorkspaceView) => void;
  onCreate: () => void;
  onSearch: () => void;
  onLogout: () => void;
}) {
  const navigation: { id: WorkspaceView; label: string; icon: IconName }[] = [
    { id: "inbox", label: "Inbox", icon: "inbox" },
    { id: "my-issues", label: "My issues", icon: "issues" },
    { id: "views", label: "Views", icon: "views" },
    { id: "roadmap", label: "Roadmap", icon: "roadmap" },
  ];

  return (
    <aside className="workspace-sidebar">
      <div className="workspace-sidebar__identity">
        <Image
          className="nexora-logo"
          src="/nexora-logo.svg"
          width={28}
          height={28}
          alt="NEXORA logo"
          priority
        />
        <span>NEXORA</span>
        <span className="presence-dot" title="Workspace available" />
      </div>

      <div className="sidebar-actions">
        <button type="button" className="new-issue-button" onClick={onCreate} disabled={!canCreateIssue}>
          <Icon name="edit" />
          <span>New issue</span>
          <span className="shortcut-hint">N</span>
        </button>
        <button type="button" className="sidebar-icon-button" onClick={onSearch} aria-label="Search issues" title="Search issues">
          <Icon name="search" />
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Workspace navigation">
        {navigation.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`sidebar-nav__item${view === item.id ? " is-active" : ""}`}
            aria-current={view === item.id ? "page" : undefined}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {item.id === "inbox" ? <span className="sidebar-nav__count" title="Active issues on the current page">{taskCount}</span> : null}
          </button>
        ))}
      </nav>

      <div className="workspace-sidebar__switcher">
        <span className="workspace-sidebar__switcher-label">WORKSPACES</span>
        <WorkspaceSwitcher onOpenDialog={onOpenWorkspaceDialog} />
      </div>

      <div className="sidebar-footer">
        <div className="avatar" aria-hidden="true">
          {userName
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join("")}
        </div>
        <div className="sidebar-footer__user">
          <strong>{userName}</strong>
          <span>Signed in</span>
        </div>
        <button
          type="button"
          className="sidebar-footer__logout"
          onClick={onLogout}
          disabled={loggingOut}
        >
          {loggingOut ? "Signing out…" : "Log out"}
        </button>
      </div>
    </aside>
  );
}

function IssueToolbar({
  title,
  count,
  theme,
  filtersOpen,
  canCreateIssue,
  projects,
  selectedProjectId,
  priorityFilter,
  statusFilter,
  canCreateProject,
  onToggleFilters,
  onProjectChange,
  onPriorityChange,
  onStatusChange,
  onCreateProject,
  onCreate,
  onSearch,
  onThemeToggle,
  onOpenWorkspaceDialog,
}: {
  title: string;
  count: number;
  theme: ThemeMode;
  filtersOpen: boolean;
  canCreateIssue: boolean;
  projects: Project[];
  selectedProjectId: string;
  priorityFilter: string;
  statusFilter: string;
  canCreateProject: boolean;
  onToggleFilters: () => void;
  onProjectChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onCreateProject: () => void;
  onCreate: () => void;
  onSearch: () => void;
  onThemeToggle: () => void;
  onOpenWorkspaceDialog: (dialog: "create" | "members" | null) => void;
}) {
  return (
    <header className="issue-toolbar">
      <div className="issue-toolbar__title">
        <h1>{title}</h1>
        <span className="issue-toolbar__count" title="Active issues on the current page" aria-label={`${count} active issues on the current page`}>{count}</span>
        <label className="project-selector" aria-label="Selected project">
          <span className="sr-only">Project</span>
          <select
            aria-label="Project"
            value={selectedProjectId}
            onChange={(event) => onProjectChange(event.target.value)}
            disabled={projects.length === 0}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} · {project.key}
              </option>
            ))}
          </select>
        </label>
        {canCreateProject ? (
          <button
            type="button"
            className="project-create-button"
            onClick={onCreateProject}
          >
            <Icon name="plus" /> Project
          </button>
        ) : null}
      </div>
      <div className="issue-toolbar__actions">
        <WorkspaceSwitcher
          compact
          mobileOnly
          onOpenDialog={onOpenWorkspaceDialog}
        />
        <button type="button" className="mobile-toolbar-button" onClick={onSearch} aria-label="Search issues"><Icon name="search" /></button>
        <button type="button" className="mobile-toolbar-button" onClick={onCreate} aria-label="Create issue" disabled={!canCreateIssue}><Icon name="plus" /></button>
        <button type="button" className="theme-switch" onClick={onThemeToggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
          <span className={theme === "light" ? "is-light" : ""} />
        </button>
        <button type="button" className={`filter-button${filtersOpen ? " is-open" : ""}`} onClick={onToggleFilters} aria-expanded={filtersOpen}>
          <Icon name="plus" /> Filter
        </button>
      </div>
      {filtersOpen ? (
        <div className="filter-popover">
          <label>Status<select value={statusFilter} onChange={(event) => onStatusChange(event.target.value)}>
            <option value="">All statuses</option>
            {issueStatuses.map((status) => <option key={status} value={status}>{statusMeta[toTaskStatus(status)].label}</option>)}
          </select></label>
          <label>
            Priority
            <select value={priorityFilter} onChange={(event) => onPriorityChange(event.target.value)}>
              <option value="">All priorities</option>
              {issuePriorities.map((priority) => <option key={priority} value={priority}>{toTaskPriority(priority)}</option>)}
            </select>
          </label>
        </div>
      ) : null}
    </header>
  );
}

function TaskDetailPanel({
  task,
  members,
  saving,
  error,
  memberError,
  onClose,
  onEdit,
  onSave,
  onRetryMembers,
}: {
  task: ApiTask;
  members: OrganizationMember[];
  saving: boolean;
  error: string;
  memberError: string | null;
  onClose: () => void;
  onEdit: () => void;
  onSave: (input: {
    status: IssueStatus;
    priority: IssuePriority;
    assigneeId: string | null;
    dueDate: string | null;
  }) => void;
  onRetryMembers: () => void;
}) {
  const [status, setStatus] = useState<IssueStatus>(toIssueStatus(task.status));
  const [priority, setPriority] = useState<IssuePriority>(toIssuePriority(task.priority));
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? "");
  const [dueDate, setDueDate] = useState(task.due);

  return (
    <>
      <button type="button" className="detail-backdrop" onClick={onClose} aria-label="Close issue details" />
      <aside className="detail-panel" aria-label="Issue details">
        <div className="detail-panel__topline">
          <span>{task.identifier}</span>
          <div>
            <button type="button" onClick={onEdit} aria-label="Edit issue"><Icon name="edit" /></button>
            <button type="button" onClick={onClose} aria-label="Close details"><Icon name="close" /></button>
          </div>
        </div>
        <h2>{task.title}</h2>
        <p className="detail-panel__description">{task.description || "No description provided."}</p>
        <form className="detail-fields" onSubmit={(event) => {
          event.preventDefault();
          onSave({ status, priority, assigneeId: assigneeId || null, dueDate: dueDate || null });
        }}>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as IssueStatus)}>{issueStatuses.map((option) => <option key={option} value={option}>{statusMeta[toTaskStatus(option)].label}</option>)}</select></label>
          <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as IssuePriority)}>{issuePriorities.map((option) => <option key={option} value={option}>{toTaskPriority(option)}</option>)}</select></label>
          <label>Assignee<select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Unassigned</option>{members.map(({ user: member }) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          <div><span>Project</span><strong>{task.project} · {task.identifier.split("-")[0]}</strong></div>
          {memberError ? <p className="issue-form-error" role="alert">{memberError} <button type="button" onClick={onRetryMembers}>Retry members</button></p> : null}
          {error ? <p className="issue-form-error" role="alert">{error}</p> : null}
          <button type="submit" className="button-primary" disabled={saving}>{saving ? "Saving…" : "Save issue changes"}</button>
        </form>
      </aside>
    </>
  );
}

export function IssueWorkspace() {
  const { user, setUser } = useAuth();
  const workspaces = useWorkspaces();
  const router = useRouter();
  const { value: theme, setValue: setTheme, ready: themeReady } = useLocalStorage<ThemeMode>(THEME_KEY, "dark");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [workspaceDialog, setWorkspaceDialog] = useState<
    "create" | "members" | null
  >(null);
  const [view, setView] = useState<WorkspaceView>("inbox");
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | "">("");
  const [statusFilter, setStatusFilter] = useState<IssueStatus | "">("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [draft, setDraft] = useState<IssueDraft>(getEmptyDraft());
  const [issueFormError, setIssueFormError] = useState("");
  const [issueSaving, setIssueSaving] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [projectFormError, setProjectFormError] = useState("");
  const [projectSaving, setProjectSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [projectRefresh, setProjectRefresh] = useState(0);
  const [issueRefresh, setIssueRefresh] = useState(0);
  const [memberRefresh, setMemberRefresh] = useState(0);
  const [projectState, setProjectState] = useState<{
    organizationId: string | null;
    status: "loading" | "ready" | "error";
    items: Project[];
    error: string | null;
  }>({ organizationId: null, status: "loading", items: [], error: null });
  const [issueState, setIssueState] = useState<{
    scope: string;
    status: "loading" | "ready" | "error";
    data: Awaited<ReturnType<typeof apiClient.issues>> | null;
    error: string | null;
  }>({ scope: "", status: "loading", data: null, error: null });
  const [memberState, setMemberState] = useState<{
    organizationId: string | null;
    status: "loading" | "ready" | "error";
    items: OrganizationMember[];
    error: string | null;
  }>({ organizationId: null, status: "loading", items: [], error: null });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const projectRequestId = useRef(0);
  const issueRequestId = useRef(0);
  const issueMutationRequestId = useRef(0);
  const memberRequestId = useRef(0);
  const organizationId = workspaces.selectedOrganization?.id ?? null;
  const userId = user?.id ?? null;
  const projects =
    projectState.organizationId === organizationId ? projectState.items : [];
  const projectStatus =
    projectState.organizationId === organizationId
      ? projectState.status
      : "loading";
  const projectError =
    projectState.organizationId === organizationId ? projectState.error : null;
  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedProjectAllowed =
    workspaces.selectedOrganization?.role === "OWNER" ||
    workspaces.selectedOrganization?.role === "ADMIN";
  const issueScope =
    userId && organizationId && selectedProject
      ? `${userId}:${organizationId}:${selectedProject.id}`
      : "";
  const issueMutationScope =
    `${issueScope}:${page}:${statusFilter}:${priorityFilter}:${view}`;
  const currentIssues =
    issueState.scope === issueScope ? issueState.data : null;
  const issueStatus =
    issueState.scope === issueScope ? issueState.status : "loading";
  const issueError =
    issueState.scope === issueScope ? issueState.error : null;
  const members =
    memberState.organizationId === organizationId ? memberState.items : [];
  const memberError =
    memberState.organizationId === organizationId ? memberState.error : null;

  useEffect(() => {
    if (themeReady) document.documentElement.dataset.theme = theme;
  }, [theme, themeReady]);

  useEffect(() => {
    if (!organizationId || !userId) {
      projectRequestId.current += 1;
      setProjectState({ organizationId: null, status: "ready", items: [], error: null });
      setSelectedProjectId("");
      return;
    }

    const requestId = ++projectRequestId.current;
    setProjectState({ organizationId, status: "loading", items: [], error: null });
    void (async () => {
      try {
        const items: Project[] = [];
        let pageNumber = 1;
        let totalPages = 1;
        do {
          const response = await apiClient.projects(
            organizationId,
            pageNumber,
            projectLimit,
          );
          items.push(...response.items);
          totalPages = response.totalPages;
          pageNumber += 1;
        } while (pageNumber <= totalPages);

        if (requestId !== projectRequestId.current) return;
        const storedId = getStoredProject(userId, organizationId);
        const selectedId = items.some((project) => project.id === storedId)
          ? storedId!
          : (items[0]?.id ?? "");
        setProjectState({ organizationId, status: "ready", items, error: null });
        setSelectedProjectId(selectedId);
        storeProject(userId, organizationId, selectedId || null);
      } catch (error) {
        if (requestId !== projectRequestId.current) return;
        if (error instanceof ApiError && error.status === 401) {
          setUser(null);
          return;
        }
        setProjectState({
          organizationId,
          status: "error",
          items: [],
          error: error instanceof ApiError
            ? error.message
            : "Unable to load projects. Please try again.",
        });
      }
    })();

    return () => {
      projectRequestId.current += 1;
    };
  }, [organizationId, projectRefresh, setUser, userId]);

  useEffect(() => {
    setPage(1);
    setSelectedIssueId(null);
    setIsDetailOpen(false);
    setIsEditorOpen(false);
    setPriorityFilter("");
    setStatusFilter("");
    setSearchTerm("");
  }, [organizationId, selectedProjectId]);

  useEffect(() => {
    issueMutationRequestId.current += 1;
    setIssueSaving(false);
    setDetailSaving(false);
    setDetailError("");
  }, [issueMutationScope]);

  useEffect(() => {
    setSelectedIssueId(null);
    setIsDetailOpen(false);
  }, [page, priorityFilter, statusFilter, view]);

  useEffect(() => {
    if (!organizationId || !selectedProject || !userId) {
      issueRequestId.current += 1;
      setIssueState({ scope: issueScope, status: "ready", data: null, error: null });
      return;
    }
    const requestId = ++issueRequestId.current;
    setIssueState({ scope: issueScope, status: "loading", data: null, error: null });
    void apiClient
      .issues(organizationId, selectedProject.id, {
        page,
        limit: issueLimit,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(priorityFilter ? { priority: priorityFilter } : {}),
        ...(view === "my-issues" ? { assigneeId: userId } : {}),
      })
      .then((data) => {
        if (requestId === issueRequestId.current) {
          setIssueState({ scope: issueScope, status: "ready", data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (requestId !== issueRequestId.current) return;
        if (error instanceof ApiError && error.status === 401) {
          setUser(null);
          return;
        }
        setIssueState({
          scope: issueScope,
          status: "error",
          data: null,
          error: error instanceof ApiError
            ? error.message
            : "Unable to load issues. Please try again.",
        });
      });
    return () => {
      issueRequestId.current += 1;
    };
  }, [
    issueRefresh,
    issueScope,
    organizationId,
    page,
    priorityFilter,
    selectedProject,
    setUser,
    statusFilter,
    userId,
    view,
  ]);

  useEffect(() => {
    if ((!isEditorOpen && !isDetailOpen) || !organizationId) return;
    const requestId = ++memberRequestId.current;
    setMemberState({ organizationId, status: "loading", items: [], error: null });
    void apiClient
      .organizationMembers(organizationId)
      .then((items) => {
        if (requestId === memberRequestId.current) {
          setMemberState({ organizationId, status: "ready", items, error: null });
        }
      })
      .catch((error: unknown) => {
        if (requestId !== memberRequestId.current) return;
        if (error instanceof ApiError && error.status === 401) {
          setUser(null);
          return;
        }
        setMemberState({
          organizationId,
          status: "error",
          items: [],
          error: error instanceof ApiError
            ? error.message
            : "Unable to load organization members.",
        });
      });
    return () => {
      memberRequestId.current += 1;
    };
  }, [isDetailOpen, isEditorOpen, memberRefresh, organizationId, setUser]);

  useEffect(() => {
    if (isSearchOpen) searchInputRef.current?.focus();
  }, [isSearchOpen]);

  const pageTasks = useMemo(
    () => (currentIssues?.items ?? []).map((issue) => toApiTask(issue, projects)),
    [currentIssues, projects],
  );
  const filteredTasks = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return pageTasks.filter((task) => {
      const matchesSearch = !normalizedSearch ||
        [task.identifier, task.title, task.description, task.assignee, task.project]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesSearch;
    });
  }, [pageTasks, searchTerm]);

  const groupedTasks = groupTasksByStatus(filteredTasks);
  const activeCount = filteredTasks.filter((task) => task.status !== "done").length;
  const selectedTask =
    pageTasks.find((task) => task.id === selectedIssueId) ?? null;

  function applySavedIssue(issue: Issue, scope: string) {
    setIssueState((current) => {
      if (current.scope !== scope || current.status !== "ready" || !current.data) {
        return current;
      }
      if (!current.data.items.some((item) => item.id === issue.id)) return current;
      return {
        ...current,
        data: {
          ...current.data,
          items: current.data.items.map((item) => item.id === issue.id ? issue : item),
        },
      };
    });
  }

  function issueStillMatchesCurrentQuery(issue: Issue) {
    return (
      (!statusFilter || issue.status === statusFilter) &&
      (!priorityFilter || issue.priority === priorityFilter) &&
      (view !== "my-issues" || issue.assigneeId === userId)
    );
  }

  function openCreateModal() {
    if (!selectedProject) return;
    setSuccessMessage("");
    setEditingIssueId(null);
    setIssueFormError("");
    setDraft(getEmptyDraft());
    setIsEditorOpen(true);
  }

  function openEditModal(issue: ApiTask) {
    setSuccessMessage("");
    setEditingIssueId(issue.id);
    setIssueFormError("");
    setDraft({
      title: issue.title,
      description: issue.description,
      status: toIssueStatus(issue.status),
      priority: toIssuePriority(issue.priority),
      assigneeId: issue.assigneeId ?? "",
      dueDate: issue.due,
    });
    setIsDetailOpen(false);
    setIsEditorOpen(true);
  }

  function handleDraftChange<K extends keyof IssueDraft>(field: K, value: IssueDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleSaveIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (issueSaving) return;
    if (!organizationId || !selectedProject || !draft.title.trim()) {
      setIssueFormError("Choose a project and enter an issue title.");
      return;
    }
    if (draft.title.trim().length > 300 || draft.description.length > 20_000) {
      setIssueFormError("Check the title and description lengths.");
      return;
    }
    const requestId = ++issueMutationRequestId.current;
    setIssueSaving(true);
    setIssueFormError("");
    setSuccessMessage("");
    try {
      const mutationScope = issueScope;
      const input = {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        status: draft.status,
        priority: draft.priority,
        assigneeId: draft.assigneeId || null,
        dueDate: draft.dueDate || null,
      };
      if (editingIssueId) {
        const savedIssue = await apiClient.updateIssue(
          organizationId,
          selectedProject.id,
          editingIssueId,
          input,
        );
        if (requestId !== issueMutationRequestId.current) {
          setIssueRefresh((value) => value + 1);
          return;
        }
        if (issueStillMatchesCurrentQuery(savedIssue)) {
          applySavedIssue(savedIssue, mutationScope);
        } else {
          setIssueRefresh((value) => value + 1);
        }
      } else {
        await apiClient.createIssue(organizationId, selectedProject.id, input);
        if (requestId !== issueMutationRequestId.current) {
          setIssueRefresh((value) => value + 1);
          return;
        }
        setPage(1);
        setIssueRefresh((value) => value + 1);
      }
      if (requestId !== issueMutationRequestId.current) return;
      setSuccessMessage(editingIssueId ? "Issue updated." : "Issue created.");
      setIsEditorOpen(false);
      setEditingIssueId(null);
    } catch (error) {
      if (requestId !== issueMutationRequestId.current) return;
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
      }
      setIssueFormError(
        error instanceof ApiError
          ? error.message
          : "Unable to save this issue. Your changes are still here.",
      );
    } finally {
      if (requestId === issueMutationRequestId.current) setIssueSaving(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await apiClient.logout();
      if (userId) {
        clearStoredProjects(
          userId,
          workspaces.organizations.map((organization) => organization.id),
        );
      }
      projectRequestId.current += 1;
      issueRequestId.current += 1;
      memberRequestId.current += 1;
      setProjectState({ organizationId: null, status: "ready", items: [], error: null });
      setIssueState({ scope: "", status: "ready", data: null, error: null });
      setMemberState({ organizationId: null, status: "ready", items: [], error: null });
      setSelectedProjectId("");
      setSelectedIssueId(null);
      workspaces.clearSelection();
      setUser(null);
      router.replace("/login");
    } catch (error) {
      setLogoutError(
        error instanceof ApiError
          ? error.message
          : "Unable to sign out. Please try again.",
      );
    } finally {
      setLoggingOut(false);
    }
  }

  async function saveIssueDetails(
    task: ApiTask,
    input: {
      status: IssueStatus;
      priority: IssuePriority;
      assigneeId: string | null;
      dueDate: string | null;
    },
  ) {
    if (detailSaving || !organizationId || !selectedProject) return;
    const requestId = ++issueMutationRequestId.current;
    const mutationScope = issueScope;
    setDetailSaving(true);
    setDetailError("");
    setSuccessMessage("");
    try {
      const savedIssue = await apiClient.updateIssue(
        organizationId,
        selectedProject.id,
        task.id,
        input,
      );
      if (requestId !== issueMutationRequestId.current) {
        setIssueRefresh((value) => value + 1);
        return;
      }
      if (issueStillMatchesCurrentQuery(savedIssue)) {
        applySavedIssue(savedIssue, mutationScope);
      } else {
        setIssueRefresh((value) => value + 1);
      }
      setSuccessMessage("Issue updated.");
      setIsDetailOpen(false);
    } catch (error) {
      if (requestId !== issueMutationRequestId.current) return;
      if (error instanceof ApiError && error.status === 401) setUser(null);
      setDetailError(
        error instanceof ApiError
          ? error.message
          : "Unable to save changes. Your edits are still here.",
      );
    } finally {
      if (requestId === issueMutationRequestId.current) setDetailSaving(false);
    }
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !selectedProjectAllowed) return;
    const name = projectName.trim();
    const key = projectKey.trim().toUpperCase();
    if (!name || name.length > 120) {
      setProjectFormError("Project name must be between 1 and 120 characters.");
      return;
    }
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) {
      setProjectFormError("Use 2–10 letters or numbers; the key must start with a letter.");
      return;
    }
    setProjectSaving(true);
    setProjectFormError("");
    setSuccessMessage("");
    try {
      const created = await apiClient.createProject(organizationId, { name, key });
      setSuccessMessage("Project created.");
      setSelectedProjectId(created.id);
      if (userId) storeProject(userId, organizationId, created.id);
      setProjectName("");
      setProjectKey("");
      setProjectDialogOpen(false);
      setProjectRefresh((value) => value + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setUser(null);
      setProjectFormError(
        error instanceof ApiError
          ? error.message
          : "Unable to create the project. Please try again.",
      );
    } finally {
      setProjectSaving(false);
    }
  }

  function toggleSearch() {
    setIsSearchOpen((current) => !current);
    if (isSearchOpen) setSearchTerm("");
  }

  if (!themeReady) {
    return <div className="workspace-loading">Opening NEXORA…</div>;
  }

  return (
    <main className="desktop-stage">
      <div className="nexora-window">
        <div className="window-chrome">
          <div className="window-chrome__sidebar">
            <div className="traffic-lights" aria-label="Application window controls"><span /><span /><span /></div>
            <div className="window-history">
              <button type="button" aria-label="Go back" disabled><Icon name="back" /></button>
              <button type="button" aria-label="Go forward" disabled><Icon name="forward" /></button>
              <span className="history-divider" />
              <span title="Activity"><Icon name="clock" /></span>
            </div>
          </div>
          <div className="window-chrome__content">
            <IssueToolbar
              title={view === "my-issues" ? "My issues" : "Issues"}
              count={activeCount}
              theme={theme}
              filtersOpen={filtersOpen}
              canCreateIssue={Boolean(selectedProject)}
              projects={projects}
              selectedProjectId={selectedProject?.id ?? ""}
              priorityFilter={priorityFilter}
              statusFilter={statusFilter}
              canCreateProject={selectedProjectAllowed}
              onToggleFilters={() => setFiltersOpen((current) => !current)}
              onProjectChange={(projectId) => {
                if (!projects.some((project) => project.id === projectId)) return;
                setSelectedProjectId(projectId);
                if (userId && organizationId) {
                  storeProject(userId, organizationId, projectId);
                }
              }}
              onPriorityChange={(value) => {
                setPriorityFilter(value as IssuePriority | "");
                setPage(1);
              }}
              onStatusChange={(value) => {
                setStatusFilter(value as IssueStatus | "");
                setPage(1);
              }}
              onCreateProject={() => {
                setProjectFormError("");
                setProjectDialogOpen(true);
              }}
              onCreate={openCreateModal}
              onSearch={toggleSearch}
              onThemeToggle={() => setTheme((current) => current === "dark" ? "light" : "dark")}
              onOpenWorkspaceDialog={setWorkspaceDialog}
            />
          </div>
        </div>

        <div className="workspace-layout">
          <Sidebar
            view={view}
            taskCount={activeCount}
            userName={user?.name ?? ""}
            loggingOut={loggingOut}
            canCreateIssue={Boolean(selectedProject)}
            onOpenWorkspaceDialog={setWorkspaceDialog}
            onNavigate={(nextView) => {
              setView(nextView);
              setFiltersOpen(nextView === "views");
              setIsDetailOpen(false);
            }}
            onCreate={openCreateModal}
            onSearch={toggleSearch}
            onLogout={() => void handleLogout()}
          />

          <section className="workspace-main">
            {logoutError ? (
              <div className="workspace-error" role="alert">
                {logoutError}
              </div>
            ) : null}
            {successMessage ? (
              <div className="workspace-success" role="status">{successMessage}</div>
            ) : null}
            {!workspaces.selectedOrganization ? (
              <CreateWorkspaceOnboarding
                onCreate={() => setWorkspaceDialog("create")}
                loading={workspaces.status === "loading"}
                error={workspaces.error}
                onRetry={() => void workspaces.refresh()}
              />
            ) : (
              <>
            <nav className="mobile-nav" aria-label="Workspace views">
              {([
                ["inbox", "Inbox"],
                ["my-issues", "My issues"],
                ["views", "Views"],
                ["roadmap", "Roadmap"],
              ] as const).map(([nextView, label]) => (
                <button
                  type="button"
                  key={nextView}
                  className={view === nextView ? "is-active" : ""}
                  aria-current={view === nextView ? "page" : undefined}
                  onClick={() => {
                    setView(nextView);
                    setFiltersOpen(nextView === "views");
                    setIsDetailOpen(false);
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className="mobile-nav__logout"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
              >
                {loggingOut ? "Signing out…" : "Log out"}
              </button>
            </nav>

            {selectedProject ? (
              <div className="workspace-data-scope" role="note">
                Showing issues in <strong>{selectedProject.name}</strong> ({selectedProject.key})
                {view === "my-issues" ? " assigned to you" : ""}.
              </div>
            ) : null}

            {isSearchOpen ? (
              <div className="search-strip">
                <Icon name="search" />
                <input ref={searchInputRef} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search this page of issues…" aria-label="Search loaded issues" />
                <span className="search-strip__scope">Current page</span>
                <button type="button" onClick={toggleSearch} aria-label="Close search"><Icon name="close" /></button>
              </div>
            ) : null}

            {projectStatus === "error" ? (
              <div className="workspace-data-state workspace-data-state--error" role="alert">
                <p>{projectError}</p>
                <button type="button" className="button-secondary" onClick={() => setProjectRefresh((value) => value + 1)}>Retry projects</button>
              </div>
            ) : projectStatus === "loading" ? (
              <div className="workspace-data-state" role="status">Loading projects…</div>
            ) : projectStatus === "ready" && projects.length === 0 ? (
              <div className="workspace-data-state workspace-data-state--empty">
                <span className="workspace-onboarding__mark" aria-hidden="true">N</span>
                <h2>No projects yet</h2>
                <p>Create a project in {workspaces.selectedOrganization.name} to start tracking issues.</p>
                {selectedProjectAllowed ? (
                  <button type="button" className="button-primary" onClick={() => setProjectDialogOpen(true)}>Create project</button>
                ) : <p>Ask an organization owner or admin to create a project.</p>}
              </div>
            ) : !selectedProject ? (
              <div className="workspace-data-state" role="status">Selecting project…</div>
            ) : issueStatus === "loading" ? (
              <div className="workspace-data-state" role="status">Loading issues…</div>
            ) : issueStatus === "error" ? (
              <div className="workspace-data-state workspace-data-state--error" role="alert">
                <p>{issueError}</p>
                <button type="button" className="button-secondary" onClick={() => setIssueRefresh((value) => value + 1)}>Retry</button>
              </div>
            ) : view === "roadmap" ? (
              <div className="board-scroll">
                <div className="issue-board">
                  {taskStatusOrder.map((status) => {
                    const columnTasks = filteredTasks.filter((task) => task.status === status);
                    return (
                      <section className="board-column" key={status}>
                        <header><StatusMark status={status} /><h2>{statusMeta[status].label}</h2><span>{columnTasks.length}</span></header>
                        {columnTasks.length ? columnTasks.map((task) => (
                          <article className="board-issue" key={task.id}>
                            <button type="button" className="board-issue__open" onClick={() => { setSelectedIssueId(task.id); setIsDetailOpen(true); }}>
                              <span className="board-issue__key">{getTaskKey(task)}</span>
                              <strong>{task.title}</strong>
                              <span>{task.project} · {task.assignee}</span>
                              <span className={`priority-label priority-label--${task.priority.toLowerCase()}`}>{task.priority}</span>
                            </button>
                            <button type="button" className="board-issue__edit" onClick={() => openEditModal(task)} aria-label={`Edit ${task.title}`}><Icon name="edit" /></button>
                          </article>
                        )) : <div className="board-empty">Nothing in this column</div>}
                      </section>
                    );
                  })}
                </div>
                {currentIssues && currentIssues.totalPages > 1 ? (
                  <nav className="issue-pagination" aria-label="Issue pages">
                    <span>Page {currentIssues.page} of {currentIssues.totalPages} · {currentIssues.total} issues</span>
                    <button type="button" className="button-secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
                    <button type="button" className="button-secondary" disabled={page >= currentIssues.totalPages} onClick={() => setPage((value) => Math.min(currentIssues.totalPages, value + 1))}>Next</button>
                  </nav>
                ) : currentIssues ? (
                  <div className="issue-pagination"><span>{currentIssues.total} issues · {currentIssues.items.length} loaded</span></div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="issue-list" aria-label="Issues in selected project">
                  {groupedTasks.map(({ status, tasks }) => (
                    <IssueGroup
                      key={status}
                      status={status}
                      tasks={tasks}
                      selectedTaskId={selectedIssueId}
                      onSelect={(task) => {
                        setSelectedIssueId(task.id);
                        setIsDetailOpen(true);
                      }}
                      onEdit={openEditModal}
                    />
                  ))}
                  {filteredTasks.length === 0 ? <div className="list-empty">{searchTerm ? "No issues on this page match your search." : currentIssues?.total ? "No issues on this page match the selected filters." : "No issues in this project yet."}{!searchTerm && !currentIssues?.total ? <button type="button" onClick={openCreateModal}>Create the first issue</button> : null}</div> : null}
                </div>
                {currentIssues && currentIssues.totalPages > 1 ? (
                  <nav className="issue-pagination" aria-label="Issue pages">
                    <span>Page {currentIssues.page} of {currentIssues.totalPages} · {currentIssues.total} issues</span>
                    <button type="button" className="button-secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
                    <button type="button" className="button-secondary" disabled={page >= currentIssues.totalPages} onClick={() => setPage((value) => Math.min(currentIssues.totalPages, value + 1))}>Next</button>
                  </nav>
                ) : currentIssues ? (
                  <div className="issue-pagination"><span>{currentIssues.total} issues · {currentIssues.items.length} loaded</span></div>
                ) : null}
              </>
            )}
              </>
            )}
          </section>
        </div>

        <WorkspaceSignature />

        {isDetailOpen && selectedTask ? (
          <TaskDetailPanel
            key={selectedTask.id}
            task={selectedTask}
            members={members}
            saving={detailSaving}
            error={detailError}
            memberError={memberError}
            onClose={() => setIsDetailOpen(false)}
            onEdit={() => openEditModal(selectedTask)}
            onSave={(input) => void saveIssueDetails(selectedTask, input)}
            onRetryMembers={() => setMemberRefresh((value) => value + 1)}
          />
        ) : null}
      </div>

      {isEditorOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !issueSaving) setIsEditorOpen(false); }}>
          <section className="issue-editor" role="dialog" aria-modal="true" aria-labelledby="issue-editor-title">
            <header className="issue-editor__header">
              <div><span>{editingIssueId ? "Edit issue" : "New issue"}</span><h2 id="issue-editor-title">{editingIssueId ? "Update issue" : "Create an issue"}</h2></div>
              <button type="button" onClick={() => setIsEditorOpen(false)} aria-label="Close editor" disabled={issueSaving}><Icon name="close" /></button>
            </header>
            <form onSubmit={(event) => void handleSaveIssue(event)}>
              <label>Title<input autoFocus required maxLength={300} value={draft.title} onChange={(event) => handleDraftChange("title", event.target.value)} placeholder="Describe the work" /></label>
              <label>Description<textarea rows={4} maxLength={20_000} value={draft.description} onChange={(event) => handleDraftChange("description", event.target.value)} placeholder="Add context or acceptance criteria" /></label>
              <div className="issue-editor__grid">
                <div className="issue-editor__project"><span>Project</span><strong>{selectedProject?.name} · {selectedProject?.key}</strong></div>
                <label>Assignee<select value={draft.assigneeId} onChange={(event) => handleDraftChange("assigneeId", event.target.value)} disabled={memberState.status === "loading"}><option value="">Unassigned</option>{members.map(({ user: member }) => <option key={member.id} value={member.id}>{member.name} ({member.email})</option>)}</select></label>
                <label>Status<select value={draft.status} onChange={(event) => handleDraftChange("status", event.target.value as IssueStatus)}>{issueStatuses.map((status) => <option key={status} value={status}>{statusMeta[toTaskStatus(status)].label}</option>)}</select></label>
                <label>Priority<select value={draft.priority} onChange={(event) => handleDraftChange("priority", event.target.value as IssuePriority)}>{issuePriorities.map((priority) => <option key={priority} value={priority}>{toTaskPriority(priority)}</option>)}</select></label>
                <label>Due date<input type="date" value={draft.dueDate} onChange={(event) => handleDraftChange("dueDate", event.target.value)} /></label>
              </div>
              {memberError ? <div className="issue-form-error" role="alert">{memberError} <button type="button" onClick={() => setMemberRefresh((value) => value + 1)}>Retry</button></div> : null}
              {issueFormError ? <div className="issue-form-error" role="alert">{issueFormError}</div> : null}
              <footer className="issue-editor__footer">
                <button type="button" className="button-secondary" onClick={() => setIsEditorOpen(false)} disabled={issueSaving}>Cancel</button>
                <button type="submit" className="button-primary" disabled={issueSaving || !selectedProject}>{issueSaving ? "Saving…" : editingIssueId ? "Save changes" : "Create issue"}</button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {workspaceDialog === "create" ? (
        <CreateWorkspaceDialog
          onClose={() => setWorkspaceDialog(null)}
        />
      ) : null}
      {workspaceDialog === "members" ? (
        <MembersDialog onClose={() => setWorkspaceDialog(null)} />
      ) : null}
      {projectDialogOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !projectSaving) setProjectDialogOpen(false); }}>
          <section className="issue-editor" role="dialog" aria-modal="true" aria-labelledby="project-editor-title">
            <header className="issue-editor__header">
              <div><span>NEW PROJECT</span><h2 id="project-editor-title">Create a project</h2></div>
              <button type="button" onClick={() => setProjectDialogOpen(false)} aria-label="Close project form" disabled={projectSaving}><Icon name="close" /></button>
            </header>
            <form onSubmit={(event) => void handleCreateProject(event)}>
              <label>Project name<input autoFocus required maxLength={120} value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="e.g. Platform" /></label>
              <label>Project key<input required maxLength={10} value={projectKey} onChange={(event) => setProjectKey(event.target.value.toUpperCase())} placeholder="e.g. PLAT" aria-describedby="project-key-hint" /></label>
              <span id="project-key-hint" className="issue-editor__hint">2–10 characters, starting with a letter. Keys are unique within this organization.</span>
              {projectFormError ? <div className="issue-form-error" role="alert">{projectFormError}</div> : null}
              <footer className="issue-editor__footer">
                <button type="button" className="button-secondary" onClick={() => setProjectDialogOpen(false)} disabled={projectSaving}>Cancel</button>
                <button type="submit" className="button-primary" disabled={projectSaving}>{projectSaving ? "Creating…" : "Create project"}</button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
