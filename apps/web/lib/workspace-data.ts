export type TaskStatus = "backlog" | "in-progress" | "review" | "done";
export type TaskPriority = "Critical" | "High" | "Medium" | "Low";

export type Task = {
  id: string;
  title: string;
  description: string;
  project: string;
  assignee: string;
  status: TaskStatus;
  priority: TaskPriority;
  due: string;
};

export const statusMeta: Record<
  TaskStatus,
  { label: string; helper: string }
> = {
  backlog: { label: "Backlog", helper: "Planned" },
  "in-progress": { label: "In progress", helper: "Active" },
  review: { label: "Review", helper: "Waiting" },
  done: { label: "Done", helper: "Closed" },
};

export const priorityMeta: Record<TaskPriority, string> = {
  Critical: "Critical",
  High: "High",
  Medium: "Medium",
  Low: "Low",
};

export const defaultTasks: Task[] = [
  {
    id: "task-001",
    title: "Design onboarding journey",
    description:
      "Map the first-run experience and align sprint goals across product and engineering.",
    project: "NEXORA",
    assignee: "A. Berger",
    status: "in-progress",
    priority: "High",
    due: "2026-10-28",
  },
  {
    id: "task-002",
    title: "Refine workspace taxonomy",
    description:
      "Standardize naming and folder conventions for product, delivery, and operations workstreams.",
    project: "Platform",
    assignee: "M. Schneider",
    status: "review",
    priority: "Medium",
    due: "2026-10-24",
  },
  {
    id: "task-003",
    title: "API contract review",
    description:
      "Confirm payload boundaries for the upcoming NestJS integration and document the data contract.",
    project: "Integrations",
    assignee: "T. Koch",
    status: "backlog",
    priority: "Critical",
    due: "2026-10-30",
  },
  {
    id: "task-004",
    title: "Ship lightweight accessibility pass",
    description:
      "Validate focus states, keyboard navigation, and form semantics across the workspace shell.",
    project: "Quality",
    assignee: "R. Klein",
    status: "done",
    priority: "Low",
    due: "2026-10-18",
  },
  {
    id: "task-005",
    title: "Prepare customer launch brief",
    description:
      "Draft a concise product narrative and solution framing for external stakeholders.",
    project: "Growth",
    assignee: "L. Weber",
    status: "backlog",
    priority: "Medium",
    due: "2026-10-29",
  },
];

export const projectOptions = [
  "NEXORA",
  "Platform",
  "Integrations",
  "Quality",
  "Growth",
  "Operations",
];
