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
  type OrganizationInvitation,
  type OrganizationMember,
} from "../lib/api-client";
import { useAuth } from "./auth-provider";
import { useWorkspaces } from "./workspace-provider";
import { useDialogFocus } from "../hooks/use-dialog-focus";
import {
  canChangeMemberRole,
  canInviteRole,
  canRemoveMember as canRemoveWorkspaceMember,
} from "../lib/team-collaboration";

type WorkspaceDialog = "create" | "members" | null;

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

  useDialogFocus({ onDismiss: onClose, rootRef: dialogRef });

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

export function MembersDialog({
  onClose,
  onMembershipChanged,
}: {
  onClose: () => void;
  onMembershipChanged?: () => void;
}) {
  const { selectedOrganization, refresh } = useWorkspaces();
  const auth = useAuth();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [membersScope, setMembersScope] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [invitationsScope, setInvitationsScope] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [error, setError] = useState("");
  const [invitationError, setInvitationError] = useState("");
  const [success, setSuccess] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [mutatingUserId, setMutatingUserId] = useState<string | null>(null);
  const [revokingInvitationId, setRevokingInvitationId] = useState<string | null>(null);
  const [memberRefresh, setMemberRefresh] = useState(0);
  const [invitationRefresh, setInvitationRefresh] = useState(0);
  const requestNumber = useRef(0);
  const organizationId = selectedOrganization?.id ?? null;
  const currentRole = selectedOrganization?.role;
  const canInvite =
    currentRole !== undefined &&
    (canInviteRole(currentRole, "ADMIN") ||
      canInviteRole(currentRole, "MEMBER"));
  const canManageRoles = currentRole === "OWNER";
  const visibleMembers =
    membersScope === organizationId ? members : [];
  const visibleInvitations =
    invitationsScope === organizationId ? invitations : [];

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      setError("Select a workspace to view its members.");
      return;
    }

    const currentRequest = ++requestNumber.current;
    setLoading(true);
    setError("");
    setMembersScope(organizationId);
    setMembers([]);
    void apiClient
      .organizationMembers(organizationId)
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
  }, [auth.setUser, memberRefresh, organizationId, refresh]);

  useEffect(() => {
    if (!organizationId || !canInvite) {
      setInvitations([]);
      setInvitationsScope(organizationId);
      setInvitationsLoading(false);
      setInvitationError("");
      return;
    }
    let active = true;
    setInvitationsLoading(true);
    setInvitationError("");
    setInvitationsScope(organizationId);
    setInvitations([]);
    void apiClient
      .organizationInvitations(organizationId)
      .then((result) => {
        if (active) setInvitations(result);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (requestError instanceof ApiError && requestError.status === 401) {
          auth.setUser(null);
          return;
        }
        setInvitationError(
          requestError instanceof ApiError
            ? requestError.message
            : "Unable to load pending invitations.",
        );
        if (
          requestError instanceof ApiError &&
          (requestError.status === 403 || requestError.status === 404)
        ) {
          void refresh();
        }
      })
      .finally(() => {
        if (active) setInvitationsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [auth.setUser, canInvite, invitationRefresh, organizationId, refresh]);

  async function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !organizationId ||
      !currentRole ||
      !canInvite ||
      !canInviteRole(currentRole, inviteRole) ||
      inviteSubmitting
    ) return;
    setInviteSubmitting(true);
    setInvitationError("");
    setSuccess("");
    try {
      await apiClient.createInvitation(organizationId, {
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
      });
      setInviteOpen(false);
      setInviteEmail("");
      setSuccess("Invitation email sent.");
      setInvitationRefresh((value) => value + 1);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        auth.setUser(null);
      }
      setInvitationError(
        requestError instanceof ApiError
          ? requestError.message
          : "Unable to send the invitation. Please try again.",
      );
    } finally {
      setInviteSubmitting(false);
    }
  }

  async function changeRole(
    member: OrganizationMember,
    role: "ADMIN" | "MEMBER",
  ) {
    if (
      !organizationId ||
      !currentRole ||
      !canManageRoles ||
      !canChangeMemberRole(currentRole, member.role) ||
      mutatingUserId
    ) return;
    setMutatingUserId(member.user.id);
    setError("");
    setSuccess("");
    try {
      await apiClient.updateMemberRole(organizationId, member.user.id, role);
      setSuccess(
        `${member.user.name} is now ${role === "ADMIN" ? "an admin" : "a member"}.`,
      );
      setMemberRefresh((value) => value + 1);
      onMembershipChanged?.();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        auth.setUser(null);
      }
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Unable to update this member’s role.",
      );
    } finally {
      setMutatingUserId(null);
    }
  }

  async function removeMember(member: OrganizationMember) {
    const permitted = currentRole
      ? canRemoveWorkspaceMember(currentRole, member.role)
      : false;
    if (!organizationId || !permitted || mutatingUserId) return;
    if (!window.confirm(`Remove ${member.user.name} from this workspace?`)) return;
    setMutatingUserId(member.user.id);
    setError("");
    setSuccess("");
    try {
      await apiClient.removeMember(organizationId, member.user.id);
      setSuccess(`${member.user.name} was removed from the workspace.`);
      setMemberRefresh((value) => value + 1);
      onMembershipChanged?.();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        auth.setUser(null);
      }
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Unable to remove this member.",
      );
    } finally {
      setMutatingUserId(null);
    }
  }

  async function revokeInvitation(invitation: OrganizationInvitation) {
    if (!organizationId || !canInvite || revokingInvitationId) return;
    if (!window.confirm(`Revoke the invitation for ${invitation.email}?`)) return;
    setRevokingInvitationId(invitation.id);
    setInvitationError("");
    setSuccess("");
    try {
      await apiClient.revokeInvitation(organizationId, invitation.id);
      setSuccess("Invitation revoked.");
      setInvitationRefresh((value) => value + 1);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        auth.setUser(null);
      }
      setInvitationError(
        requestError instanceof ApiError
          ? requestError.message
          : "Unable to revoke this invitation.",
      );
    } finally {
      setRevokingInvitationId(null);
    }
  }

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
      {canInvite ? (
        <button
          type="button"
          className="workspace-invite-button"
          onClick={() => {
            setInvitationError("");
            setInviteRole("MEMBER");
            setInviteOpen(true);
          }}
        >
          <span aria-hidden="true">＋</span> Invite member
        </button>
      ) : null}
      <p className="workspace-dialog__description">
        People with access to this workspace.
      </p>
      {success ? <p className="workspace-management-success" role="status">{success}</p> : null}
      {error ? <div className="workspace-management-error" role="alert">{error}</div> : null}
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
      ) : visibleMembers.length === 0 ? (
        <p className="workspace-members-state">
          No members are listed for this workspace.
        </p>
      ) : (
        <ul className="workspace-member-list">
          {visibleMembers.map(({ user, role }) => (
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
              {canManageRoles &&
              currentRole &&
              canChangeMemberRole(currentRole, role) ? (
                <label className="workspace-member__role-control">
                  <span className="sr-only">Change {user.name}’s role</span>
                  <select
                    aria-label={`Role for ${user.name}`}
                    value={role}
                    disabled={mutatingUserId !== null}
                    onChange={(event) =>
                      void changeRole(
                        { user, role },
                        event.target.value as "ADMIN" | "MEMBER",
                      )
                    }
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </label>
              ) : null}
              {currentRole && canRemoveWorkspaceMember(currentRole, role) ? (
                <button
                  type="button"
                  className="workspace-member__remove"
                  disabled={mutatingUserId !== null}
                  onClick={() => void removeMember({ user, role })}
                >
                  {mutatingUserId === user.id ? "Removing…" : "Remove"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canInvite ? (
        <section className="workspace-pending-invitations" aria-labelledby="pending-invitations-title">
          <h3 id="pending-invitations-title">Pending invitations</h3>
          {invitationsLoading ? (
            <p className="workspace-members-state" role="status">Loading invitations…</p>
          ) : invitationError ? (
            <div className="workspace-management-error" role="alert">
              <p>{invitationError}</p>
              <button type="button" className="workspace-inline-retry" onClick={() => setInvitationRefresh((value) => value + 1)}>Retry</button>
            </div>
          ) : visibleInvitations.length === 0 ? (
            <p className="workspace-members-state">No pending invitations.</p>
          ) : (
            <ul className="workspace-invitation-list">
              {visibleInvitations.map((invitation) => (
                <li key={invitation.id}>
                  <div>
                    <strong>{invitation.email}</strong>
                    <span>Pending · {invitation.role} · expires {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(invitation.expiresAt))}</span>
                  </div>
                  {(currentRole === "OWNER" || invitation.role === "MEMBER") ? (
                    <button type="button" disabled={revokingInvitationId !== null} onClick={() => void revokeInvitation(invitation)}>
                      {revokingInvitationId === invitation.id ? "Revoking…" : "Revoke"}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {inviteOpen ? (
        <div className="workspace-dialog-backdrop workspace-dialog-backdrop--nested" onMouseDown={(event) => { if (event.target === event.currentTarget && !inviteSubmitting) setInviteOpen(false); }}>
          <section
            className="workspace-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-member-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setInviteOpen(false);
                return;
              }
              if (event.key === "Tab") {
                event.stopPropagation();
                const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
                  'button:not(:disabled), input:not(:disabled), select:not(:disabled)',
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
            }}
          >
            <header className="workspace-dialog__header">
              <div><span>WORKSPACE INVITATION</span><h2 id="invite-member-title">Invite a member</h2></div>
              <button type="button" className="workspace-dialog__close" onClick={() => setInviteOpen(false)} disabled={inviteSubmitting} aria-label="Close invitation dialog">×</button>
            </header>
            <p className="workspace-dialog__description">An invitation email will be sent to the address you provide.</p>
            {invitationError ? <p className="workspace-management-error" role="alert">{invitationError}</p> : null}
            <form className="workspace-dialog__form" onSubmit={(event) => void submitInvitation(event)}>
              <label htmlFor="invite-email">Email address</label>
              <input autoFocus id="invite-email" name="email" type="email" autoComplete="email" maxLength={254} required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
              <label htmlFor="invite-role">Workspace role</label>
              <select id="invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "ADMIN" | "MEMBER")} disabled={currentRole !== "OWNER"}>
                <option value="MEMBER">Member</option>
                {currentRole === "OWNER" ? <option value="ADMIN">Admin</option> : null}
              </select>
              <footer className="workspace-dialog__footer">
                <button type="button" className="button-secondary" onClick={() => setInviteOpen(false)} disabled={inviteSubmitting}>Cancel</button>
                <button type="submit" className="button-primary" disabled={inviteSubmitting}>{inviteSubmitting ? "Sending…" : "Send invitation"}</button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
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
