"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  apiClient,
  ApiError,
  type MembershipRole,
  type OrganizationMember,
} from "../lib/api-client";
import { useAuth } from "./auth-provider";
import { useWorkspaces } from "./workspace-provider";

type WorkspaceDialog = "create" | "members" | null;

function useDialogDismiss(
  onDismiss: () => void,
  rootRef: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
      }
      if (event.key === "Tab" && rootRef.current) {
        const focusable = rootRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onDismiss, rootRef]);
}

export function WorkspaceSwitcher({
  compact = false,
  mobileOnly = false,
  onOpenDialog,
}: {
  compact?: boolean;
  mobileOnly?: boolean;
  onOpenDialog: (dialog: WorkspaceDialog) => void;
}) {
  const workspaces = useWorkspaces();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const current = workspaces.selectedOrganization;
  const title =
    workspaces.status === "loading"
      ? "Loading workspaces…"
      : current?.name ?? "No workspaces";

  return (
    <div
      ref={rootRef}
      className={`workspace-switcher${compact ? " workspace-switcher--compact" : ""}${mobileOnly ? " workspace-switcher--mobile-only" : ""}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className="workspace-switcher__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        disabled={workspaces.status === "loading"}
      >
        <span className="workspace-switcher__mark" aria-hidden="true">
          {current?.name.slice(0, 1).toUpperCase() ?? "—"}
        </span>
        <span className="workspace-switcher__current">
          <strong>{title}</strong>
          <span>
            {workspaces.status === "loading"
              ? "Checking membership"
              : current?.role ?? "Workspace"}
          </span>
        </span>
        <span className="workspace-switcher__chevron" aria-hidden="true">
          ⌄
        </span>
      </button>

      {workspaces.status === "error" ? (
        <div className="workspace-switcher__inline-error" role="alert">
          <span>{workspaces.error}</span>
          <button type="button" onClick={() => void workspaces.refresh()}>
            Retry
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="workspace-switcher__menu" role="menu" aria-label="Workspaces">
          {workspaces.organizations.map((organization) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={organization.id === current?.id}
              className={`workspace-switcher__option${organization.id === current?.id ? " is-selected" : ""}`}
              key={organization.id}
              onClick={() => {
                workspaces.selectOrganization(organization.id);
                setOpen(false);
              }}
            >
              <span className="workspace-switcher__option-mark" aria-hidden="true">
                {organization.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="workspace-switcher__option-copy">
                <strong>{organization.name}</strong>
                <span>{organization.role}</span>
              </span>
              {organization.id === current?.id ? (
                <span className="workspace-switcher__check" aria-hidden="true">
                  ✓
                </span>
              ) : null}
            </button>
          ))}
          {workspaces.organizations.length === 0 &&
          workspaces.status === "ready" ? (
            <p className="workspace-switcher__empty">
              You don’t belong to any workspaces yet.
            </p>
          ) : null}
          <div className="workspace-switcher__menu-actions">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenDialog("create");
              }}
            >
              <span aria-hidden="true">＋</span> Create workspace
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!current}
              onClick={() => {
                setOpen(false);
                onOpenDialog("members");
              }}
            >
              View members
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DialogShell({
  titleId,
  onClose,
  children,
}: {
  titleId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useDialogDismiss(onClose, dialogRef);
  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogRef.current
      ?.querySelector<HTMLElement>(
        'input:not(:disabled), button:not(:disabled), [tabindex="0"]',
      )
      ?.focus();
    return () => previousFocus?.focus();
  }, []);

  return (
    <div
      className="workspace-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="workspace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {children}
      </section>
    </div>
  );
}

export function CreateWorkspaceDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const workspaces = useWorkspaces();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("Enter a workspace name.");
      return;
    }
    if (normalizedName.length > 100) {
      setError("Workspace names must be 100 characters or fewer.");
      return;
    }

    setSubmitting(true);
    try {
      await workspaces.createOrganization(normalizedName);
      onClose();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Unable to create the workspace. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell onClose={onClose} titleId="create-workspace-title">
      <header className="workspace-dialog__header">
        <div>
          <span>NEW WORKSPACE</span>
          <h2 id="create-workspace-title">Create a workspace</h2>
        </div>
        <button
          type="button"
          className="workspace-dialog__close"
          onClick={onClose}
          aria-label="Close dialog"
        >
          ×
        </button>
      </header>
      <p className="workspace-dialog__description">
        A shared home for your team’s projects and work.
      </p>
      {error ? (
        <p className="workspace-management-error" role="alert">
          {error}
        </p>
      ) : null}
      <form className="workspace-dialog__form" onSubmit={handleSubmit}>
        <label htmlFor="workspace-name">Workspace name</label>
        <input
          autoFocus
          id="workspace-name"
          name="name"
          type="text"
          autoComplete="organization"
          maxLength={100}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Product team"
          aria-invalid={Boolean(error)}
        />
        <span className="workspace-dialog__hint">
          1–100 characters. You’ll be added as the owner.
        </span>
        <footer className="workspace-dialog__footer">
          <button
            type="button"
            className="button-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button-primary"
            disabled={submitting}
          >
            {submitting ? "Creating…" : "Create workspace"}
          </button>
        </footer>
      </form>
    </DialogShell>
  );
}

function RoleBadge({ role }: { role: MembershipRole }) {
  return (
    <span className={`workspace-role-badge workspace-role-badge--${role.toLowerCase()}`}>
      {role}
    </span>
  );
}

export function MembersDialog({ onClose }: { onClose: () => void }) {
  const { selectedOrganization, refresh } = useWorkspaces();
  const auth = useAuth();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestNumber = useRef(0);

  useEffect(() => {
    if (!selectedOrganization) {
      setLoading(false);
      setError("Select a workspace to view its members.");
      return;
    }

    const currentRequest = ++requestNumber.current;
    setLoading(true);
    setError("");
    void apiClient
      .organizationMembers(selectedOrganization.id)
      .then((result) => {
        if (requestNumber.current === currentRequest) {
          setMembers(result);
        }
      })
      .catch((requestError: unknown) => {
        if (requestNumber.current !== currentRequest) return;
        if (requestError instanceof ApiError && requestError.status === 401) {
          auth.setUser(null);
          return;
        }
        if (
          requestError instanceof ApiError &&
          (requestError.status === 403 || requestError.status === 404)
        ) {
          setError("You no longer have access to this workspace’s members.");
          void refresh();
          return;
        }
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "Unable to load workspace members. Please try again.",
        );
      })
      .finally(() => {
        if (requestNumber.current === currentRequest) setLoading(false);
      });

    return () => {
      requestNumber.current += 1;
    };
  }, [auth.setUser, refresh, selectedOrganization]);

  return (
    <DialogShell onClose={onClose} titleId="workspace-members-title">
      <header className="workspace-dialog__header">
        <div>
          <span>WORKSPACE MEMBERS</span>
          <h2 id="workspace-members-title">
            {selectedOrganization?.name ?? "Members"}
          </h2>
        </div>
        <button
          type="button"
          className="workspace-dialog__close"
          onClick={onClose}
          aria-label="Close dialog"
        >
          ×
        </button>
      </header>
      <p className="workspace-dialog__description">
        People with access to this workspace.
      </p>
      {loading ? (
        <p className="workspace-members-state" role="status">
          Loading members…
        </p>
      ) : error ? (
        <div className="workspace-management-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="workspace-inline-retry"
          >
            Refresh workspaces
          </button>
        </div>
      ) : members.length === 0 ? (
        <p className="workspace-members-state">
          No members are listed for this workspace.
        </p>
      ) : (
        <ul className="workspace-member-list">
          {members.map(({ user, role }) => (
            <li className="workspace-member" key={user.id}>
              <span className="workspace-member__avatar" aria-hidden="true">
                {user.name
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase())
                  .join("")}
              </span>
              <span className="workspace-member__identity">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </span>
              <RoleBadge role={role} />
            </li>
          ))}
        </ul>
      )}
      <p className="workspace-future-note">
        Invitations and role editing will be available in a future update.
      </p>
    </DialogShell>
  );
}

export function CreateWorkspaceOnboarding({
  onCreate,
  loading,
  error,
  onRetry,
}: {
  onCreate: () => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <section className="workspace-onboarding">
      <span className="workspace-onboarding__mark" aria-hidden="true">
        N
      </span>
      <p className="workspace-onboarding__eyebrow">A PLACE FOR YOUR TEAM</p>
      <h1>Create your workspace</h1>
      <p>
        Set up a shared home for your team. Your workspace is managed by your
        account and its members.
      </p>
      {loading ? (
        <span className="workspace-onboarding__loading" role="status">
          Loading your workspaces…
        </span>
      ) : error ? (
        <div className="workspace-management-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="workspace-inline-retry"
            onClick={onRetry}
          >
            Try again
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="button-primary workspace-onboarding__create"
          onClick={onCreate}
        >
          <span aria-hidden="true">＋</span> Create your workspace
        </button>
      )}
    </section>
  );
}
