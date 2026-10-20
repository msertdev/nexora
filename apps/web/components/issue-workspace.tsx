"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { useLocalStorage } from "../hooks/use-local-storage";
import {
  defaultTasks,
  priorityMeta,
  projectOptions,
  statusMeta,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "../lib/workspace-data";
import Image from "next/image";

type ThemeMode = "light" | "dark";
type WorkspaceView = "inbox" | "my-issues" | "views" | "roadmap";
type TaskDraft = Omit<Task, "id">;
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

const STORAGE_KEY = "nexora.workspace.tasks";
const THEME_KEY = "nexora.workspace.theme";
const statusOrder: TaskStatus[] = ["backlog", "in-progress", "review", "done"];
const currentAssignee = "A. Berger";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function getEmptyDraft(): TaskDraft {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  return {
    title: "",
    description: "",
    project: projectOptions[0] ?? "NEXORA",
    assignee: currentAssignee,
    status: "backlog",
    priority: "Medium",
    due: dueDate.toISOString().slice(0, 10),
  };
}

function getTaskKey(task: Task) {
  const idNumber = task.id.match(/\d+/)?.[0] ?? "001";
  return `ENG-${idNumber.padStart(2, "0")}`;
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
  onDelete,
}: {
  task: Task;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
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
        <button type="button" onClick={onDelete} aria-label={`Delete ${task.title}`} title="Delete task">
          <Icon name="trash" />
        </button>
      </div>
    </div>
  );
}

function IssueGroup({
  title,
  tasks,
  selectedTaskId,
  onSelect,
  onEdit,
  onDelete,
}: {
  title: string;
  tasks: Task[];
  selectedTaskId: string | null;
  onSelect: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  return (
    <section className="issue-group" aria-label={`${title}, ${tasks.length} issues`}>
      <div className="issue-group__heading">
        <StatusMark status={title === "In Review" ? "review" : title === "Done" ? "done" : "backlog"} />
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
            onDelete={() => onDelete(task)}
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
  onNavigate,
  onCreate,
  onSearch,
}: {
  view: WorkspaceView;
  taskCount: number;
  onNavigate: (nextView: WorkspaceView) => void;
  onCreate: () => void;
  onSearch: () => void;
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
        <button type="button" className="new-issue-button" onClick={onCreate}>
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
            {item.id === "inbox" ? <span className="sidebar-nav__count">{taskCount}</span> : null}
          </button>
        ))}
      </nav>

      <div className="team-section">
        <div className="team-section__label">Your teams</div>
        <div className="team-row"><Icon name="chevron" /><span>Design</span></div>
        <div className="team-row team-row--active"><Icon name="chevron" /><span>Engineering</span><Icon name="lock" className="team-row__lock" /><span className="team-row__more">•••</span></div>
        <div className="team-row"><Icon name="chevron" /><span>X Dev</span></div>
      </div>

      <div className="sidebar-footer">
        <div className="avatar">AB</div>
        <div className="sidebar-footer__user"><strong>A. Berger</strong><span>Personal workspace</span></div>
        <button type="button" className="sidebar-footer__more" aria-label="Workspace options">•••</button>
      </div>
    </aside>
  );
}

function IssueToolbar({
  count,
  theme,
  filtersOpen,
  projects,
  priorities,
  projectFilter,
  priorityFilter,
  onToggleFilters,
  onProjectChange,
  onPriorityChange,
  onCreate,
  onSearch,
  onThemeToggle,
}: {
  count: number;
  theme: ThemeMode;
  filtersOpen: boolean;
  projects: string[];
  priorities: string[];
  projectFilter: string;
  priorityFilter: string;
  onToggleFilters: () => void;
  onProjectChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onCreate: () => void;
  onSearch: () => void;
  onThemeToggle: () => void;
}) {
  return (
    <header className="issue-toolbar">
      <div className="issue-toolbar__title">
        <h1>Active issues</h1>
        <span className="issue-toolbar__count">{count}</span>
      </div>
      <div className="issue-toolbar__actions">
        <button type="button" className="mobile-toolbar-button" onClick={onSearch} aria-label="Search issues"><Icon name="search" /></button>
        <button type="button" className="mobile-toolbar-button" onClick={onCreate} aria-label="Create issue"><Icon name="plus" /></button>
        <button type="button" className="theme-switch" onClick={onThemeToggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
          <span className={theme === "light" ? "is-light" : ""} />
        </button>
        <button type="button" className={`filter-button${filtersOpen ? " is-open" : ""}`} onClick={onToggleFilters} aria-expanded={filtersOpen}>
          <Icon name="plus" /> Filter
        </button>
      </div>
      {filtersOpen ? (
        <div className="filter-popover">
          <label>
            Project
            <select value={projectFilter} onChange={(event) => onProjectChange(event.target.value)}>
              {projects.map((project) => <option key={project} value={project}>{project}</option>)}
            </select>
          </label>
          <label>
            Priority
            <select value={priorityFilter} onChange={(event) => onPriorityChange(event.target.value)}>
              {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </label>
        </div>
      ) : null}
    </header>
  );
}

function TaskDetailPanel({
  task,
  onClose,
  onEdit,
  onDelete,
  onStatusChange,
  onPriorityChange,
}: {
  task: Task;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: TaskStatus) => void;
  onPriorityChange: (priority: TaskPriority) => void;
}) {
  return (
    <>
      <button type="button" className="detail-backdrop" onClick={onClose} aria-label="Close issue details" />
      <aside className="detail-panel" aria-label="Issue details">
        <div className="detail-panel__topline">
          <span>{getTaskKey(task)}</span>
          <div>
            <button type="button" onClick={onEdit} aria-label="Edit issue"><Icon name="edit" /></button>
            <button type="button" onClick={onClose} aria-label="Close details"><Icon name="close" /></button>
          </div>
        </div>
        <h2>{task.title}</h2>
        <p className="detail-panel__description">{task.description || "No description provided."}</p>
        <div className="detail-fields">
          <label>Status<select value={task.status} onChange={(event) => onStatusChange(event.target.value as TaskStatus)}>{statusOrder.map((status) => <option key={status} value={status}>{statusMeta[status].label}</option>)}</select></label>
          <label>Priority<select value={task.priority} onChange={(event) => onPriorityChange(event.target.value as TaskPriority)}>{Object.keys(priorityMeta).map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
          <div><span>Project</span><strong>{task.project}</strong></div>
          <div><span>Assignee</span><strong>{task.assignee}</strong></div>
          <div><span>Due date</span><strong>{formatDate(task.due)}</strong></div>
        </div>
        <button type="button" className="detail-panel__delete" onClick={onDelete}><Icon name="trash" /> Delete issue</button>
      </aside>
    </>
  );
}

export function IssueWorkspace() {
  const { value: tasks, setValue: setTasks, ready: tasksReady, error: tasksError } = useLocalStorage<Task[]>(STORAGE_KEY, defaultTasks);
  const { value: theme, setValue: setTheme, ready: themeReady } = useLocalStorage<ThemeMode>(THEME_KEY, "dark");
  const [view, setView] = useState<WorkspaceView>("inbox");
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [projectFilter, setProjectFilter] = useState("All projects");
  const [priorityFilter, setPriorityFilter] = useState("All priorities");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(getEmptyDraft());
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (themeReady) document.documentElement.dataset.theme = theme;
  }, [theme, themeReady]);

  useEffect(() => {
    if (isSearchOpen) searchInputRef.current?.focus();
  }, [isSearchOpen]);

  const filteredTasks = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesSearch = !normalizedSearch || [task.title, task.description, task.assignee, task.project].join(" ").toLowerCase().includes(normalizedSearch);
      const matchesProject = projectFilter === "All projects" || task.project === projectFilter;
      const matchesPriority = priorityFilter === "All priorities" || task.priority === priorityFilter;
      const matchesAssignee = view !== "my-issues" || task.assignee === currentAssignee;
      return matchesSearch && matchesProject && matchesPriority && matchesAssignee;
    });
  }, [priorityFilter, projectFilter, searchTerm, tasks, view]);

  const reviewTasks = filteredTasks.filter((task) => task.status === "review");
  const todoTasks = filteredTasks.filter((task) => task.status === "backlog" || task.status === "in-progress");
  const doneTasks = filteredTasks.filter((task) => task.status === "done");
  const activeCount = tasks.filter((task) => task.status !== "done").length;
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const projects = ["All projects", ...projectOptions];
  const priorities = ["All priorities", "Critical", "High", "Medium", "Low"];

  function openCreateModal() {
    setEditingTaskId(null);
    setDraft(getEmptyDraft());
    setIsEditorOpen(true);
  }

  function openEditModal(task: Task) {
    setEditingTaskId(task.id);
    setDraft({ title: task.title, description: task.description, project: task.project, assignee: task.assignee, status: task.status, priority: task.priority, due: task.due });
    setIsDetailOpen(false);
    setIsEditorOpen(true);
  }

  function handleDraftChange<K extends keyof TaskDraft>(field: K, value: TaskDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handleSaveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    const nextTask: Task = {
      id: editingTaskId ?? `task-${Date.now()}`,
      ...draft,
      title: draft.title.trim(),
      description: draft.description.trim(),
      assignee: draft.assignee.trim() || "Unassigned",
    };
    setTasks((current) => editingTaskId
      ? current.map((task) => task.id === editingTaskId ? nextTask : task)
      : [nextTask, ...current]);
    setSelectedTaskId(nextTask.id);
    setIsDetailOpen(false);
    setIsEditorOpen(false);
    setEditingTaskId(null);
    setDraft(getEmptyDraft());
  }

  function handleDeleteTask(task: Task) {
    if (!window.confirm(`Delete “${task.title}”? This action cannot be undone.`)) return;
    setTasks((current) => current.filter((item) => item.id !== task.id));
    if (selectedTaskId === task.id) {
      setSelectedTaskId(null);
      setIsDetailOpen(false);
    }
  }

  function changeStatus(taskId: string, status: TaskStatus) {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status } : task));
  }

  function changePriority(taskId: string, priority: TaskPriority) {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, priority } : task));
  }

  function toggleSearch() {
    setIsSearchOpen((current) => !current);
    if (isSearchOpen) setSearchTerm("");
  }

  if (!tasksReady || !themeReady) {
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
              count={activeCount}
              theme={theme}
              filtersOpen={filtersOpen}
              projects={projects}
              priorities={priorities}
              projectFilter={projectFilter}
              priorityFilter={priorityFilter}
              onToggleFilters={() => setFiltersOpen((current) => !current)}
              onProjectChange={setProjectFilter}
              onPriorityChange={setPriorityFilter}
              onCreate={openCreateModal}
              onSearch={toggleSearch}
              onThemeToggle={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            />
          </div>
        </div>

        <div className="workspace-layout">
          <Sidebar
            view={view}
            taskCount={activeCount}
            onNavigate={(nextView) => {
              setView(nextView);
              setFiltersOpen(nextView === "views");
              setIsDetailOpen(false);
            }}
            onCreate={openCreateModal}
            onSearch={toggleSearch}
          />

          <section className="workspace-main">
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
            </nav>

            {isSearchOpen ? (
              <div className="search-strip">
                <Icon name="search" />
                <input ref={searchInputRef} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search issues, projects, or assignees…" aria-label="Search issues" />
                <button type="button" onClick={toggleSearch} aria-label="Close search"><Icon name="close" /></button>
              </div>
            ) : null}

            {tasksError ? <div className="workspace-error" role="alert">{tasksError}</div> : null}

            {view === "roadmap" ? (
              <div className="board-scroll">
                <div className="issue-board">
                  {statusOrder.map((status) => {
                    const columnTasks = filteredTasks.filter((task) => task.status === status);
                    return (
                      <section className="board-column" key={status}>
                        <header><StatusMark status={status} /><h2>{statusMeta[status].label}</h2><span>{columnTasks.length}</span></header>
                        {columnTasks.length ? columnTasks.map((task) => (
                          <article className="board-issue" key={task.id}>
                            <button type="button" className="board-issue__open" onClick={() => { setSelectedTaskId(task.id); setIsDetailOpen(true); }}>
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
              </div>
            ) : (
              <div className="issue-list" aria-label="Active issues">
                <IssueGroup title="In Review" tasks={reviewTasks} selectedTaskId={selectedTaskId} onSelect={(task) => { setSelectedTaskId(task.id); setIsDetailOpen(true); }} onEdit={openEditModal} onDelete={handleDeleteTask} />
                <IssueGroup title="Todo" tasks={todoTasks} selectedTaskId={selectedTaskId} onSelect={(task) => { setSelectedTaskId(task.id); setIsDetailOpen(true); }} onEdit={openEditModal} onDelete={handleDeleteTask} />
                {doneTasks.length ? <IssueGroup title="Done" tasks={doneTasks} selectedTaskId={selectedTaskId} onSelect={(task) => { setSelectedTaskId(task.id); setIsDetailOpen(true); }} onEdit={openEditModal} onDelete={handleDeleteTask} /> : null}
                {filteredTasks.length === 0 ? <div className="list-empty">No issues match this view.</div> : null}
              </div>
            )}
          </section>
        </div>

        <WorkspaceSignature />

        {isDetailOpen && selectedTask ? (
          <TaskDetailPanel
            task={selectedTask}
            onClose={() => setIsDetailOpen(false)}
            onEdit={() => openEditModal(selectedTask)}
            onDelete={() => handleDeleteTask(selectedTask)}
            onStatusChange={(status) => changeStatus(selectedTask.id, status)}
            onPriorityChange={(priority) => changePriority(selectedTask.id, priority)}
          />
        ) : null}
      </div>

      {isEditorOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsEditorOpen(false); }}>
          <section className="issue-editor" role="dialog" aria-modal="true" aria-labelledby="issue-editor-title">
            <header className="issue-editor__header">
              <div><span>{editingTaskId ? "Edit issue" : "New issue"}</span><h2 id="issue-editor-title">{editingTaskId ? "Update issue" : "Create an issue"}</h2></div>
              <button type="button" onClick={() => setIsEditorOpen(false)} aria-label="Close editor"><Icon name="close" /></button>
            </header>
            <form onSubmit={handleSaveTask}>
              <label>Title<input autoFocus required maxLength={120} value={draft.title} onChange={(event) => handleDraftChange("title", event.target.value)} placeholder="Describe the work" /></label>
              <label>Description<textarea rows={4} value={draft.description} onChange={(event) => handleDraftChange("description", event.target.value)} placeholder="Add context or acceptance criteria" /></label>
              <div className="issue-editor__grid">
                <label>Project<select value={draft.project} onChange={(event) => handleDraftChange("project", event.target.value)}>{projectOptions.map((project) => <option key={project} value={project}>{project}</option>)}</select></label>
                <label>Assignee<input value={draft.assignee} onChange={(event) => handleDraftChange("assignee", event.target.value)} /></label>
                <label>Status<select value={draft.status} onChange={(event) => handleDraftChange("status", event.target.value as TaskStatus)}>{statusOrder.map((status) => <option key={status} value={status}>{statusMeta[status].label}</option>)}</select></label>
                <label>Priority<select value={draft.priority} onChange={(event) => handleDraftChange("priority", event.target.value as TaskPriority)}>{Object.keys(priorityMeta).map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
                <label>Due date<input type="date" value={draft.due} onChange={(event) => handleDraftChange("due", event.target.value)} /></label>
              </div>
              <footer className="issue-editor__footer">
                <button type="button" className="button-secondary" onClick={() => setIsEditorOpen(false)}>Cancel</button>
                <button type="submit" className="button-primary">{editingTaskId ? "Save changes" : "Create issue"}</button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
