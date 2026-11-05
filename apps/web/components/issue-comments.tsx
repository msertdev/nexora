"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiClient,
  ApiError,
  type IssueComment,
  type MembershipRole,
  type PaginatedResponse,
} from "../lib/api-client";
import { useAuth } from "./auth-provider";

type Props = {
  organizationId: string;
  projectId: string;
  issueId: string;
  userId: string;
  role: MembershipRole;
};

export function IssueComments({
  organizationId,
  projectId,
  issueId,
  userId,
  role,
}: Props) {
  const { setUser } = useAuth();
  const [page, setPage] = useState<PaginatedResponse<IssueComment> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(
    async (requestedPage: number | "latest" = 1) => {
      const requestId = ++generation.current;
      setLoading(true);
      setLoadError("");
      try {
        let result = await apiClient.comments(
          organizationId,
          projectId,
          issueId,
          typeof requestedPage === "number" ? requestedPage : 1,
        );
        const lastPage = Math.max(1, result.totalPages);
        if (
          (requestedPage === "latest" && lastPage > 1) ||
          result.page > lastPage
        ) {
          result = await apiClient.comments(
            organizationId,
            projectId,
            issueId,
            lastPage,
          );
        }
        if (requestId === generation.current) setPage(result);
      } catch (cause) {
        if (requestId !== generation.current) return;
        if (cause instanceof ApiError && cause.status === 401) setUser(null);
        setLoadError(
          cause instanceof Error
            ? cause.message
            : "Unable to load comments. Try again.",
        );
      } finally {
        if (requestId === generation.current) setLoading(false);
      }
    },
    [organizationId, projectId, issueId, setUser],
  );

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (editingId) editor.current?.focus();
  }, [editingId]);

  async function mutate(
    action: () => Promise<unknown>,
    kind: "create" | "edit" | "delete",
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (!mounted.current) return;
      if (kind === "create") setDraft("");
      setEditingId(null);
      setDeletingId(null);
      setNotice(
        kind === "create"
          ? "Comment added."
          : kind === "edit"
            ? "Comment saved."
            : "Comment deleted.",
      );
      await load(kind === "create" ? "latest" : (page?.page ?? 1));
      if (mounted.current) composer.current?.focus();
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof ApiError && cause.status === 401) setUser(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save this change. Try again.",
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const disabled = busy || loading;
  const canModerate = role === "ADMIN" || role === "OWNER";

  return (
    <section
      className="issue-comments"
      aria-labelledby="issue-comments-title"
      aria-busy={loading}
    >
      <header className="issue-comments__header">
        <h3 id="issue-comments-title">Comments</h3>
        {page ? <span>{page.total}</span> : null}
      </header>
      {loading ? <p role="status">Loading comments…</p> : null}
      {loadError ? (
        <div className="issue-form-error" role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            className="button-secondary"
            onClick={() => void load(page?.page ?? 1)}
            disabled={disabled}
          >
            Retry comments
          </button>
        </div>
      ) : null}
      {page?.items.length === 0 && !loading && !loadError ? (
        <p>No comments yet. Share an update or ask a question.</p>
      ) : null}
      {page?.items.map((comment) => {
        const isAuthor = comment.authorId === userId;
        return (
          <article key={comment.id} className="issue-comment">
            <header>
              <strong>{comment.author.name}</strong>
              <time
                dateTime={comment.createdAt}
                title={new Date(comment.createdAt).toLocaleString()}
              >
                {new Date(comment.createdAt).toLocaleDateString()}
              </time>
              {comment.updatedAt !== comment.createdAt ? (
                <span>Edited</span>
              ) : null}
            </header>
            {editingId === comment.id ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate(
                    () =>
                      apiClient.updateComment(
                        organizationId,
                        projectId,
                        issueId,
                        comment.id,
                        editBody,
                      ),
                    "edit",
                  );
                }}
              >
                <label htmlFor="edit-comment">Edit comment</label>
                <textarea
                  ref={editor}
                  id="edit-comment"
                  value={editBody}
                  maxLength={10_000}
                  required
                  disabled={busy}
                  onChange={(event) => setEditBody(event.target.value)}
                />
                <div className="issue-comments__actions">
                  <button
                    className="button-primary"
                    type="submit"
                    disabled={disabled || !editBody.trim()}
                  >
                    {busy ? "Saving…" : "Save comment"}
                  </button>
                  <button
                    className="button-secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditingId(null);
                      setError("");
                    }}
                  >
                    Cancel edit
                  </button>
                </div>
              </form>
            ) : (
              <p className="issue-comment__body">{comment.body}</p>
            )}
            {editingId !== comment.id && (isAuthor || canModerate) ? (
              <div className="issue-comments__actions">
                {isAuthor ? (
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={disabled}
                    onClick={() => {
                      setEditingId(comment.id);
                      setEditBody(comment.body);
                      setDeletingId(null);
                      setError("");
                    }}
                  >
                    Edit comment
                  </button>
                ) : null}
                <button
                  type="button"
                  className="button-secondary"
                  disabled={disabled}
                  onClick={() => {
                    setDeletingId(comment.id);
                    setEditingId(null);
                    setError("");
                  }}
                >
                  Delete comment
                </button>
              </div>
            ) : null}
            {deletingId === comment.id ? (
              <div className="issue-comment__confirmation">
                <p>Delete this comment? This cannot be undone.</p>
                <div className="issue-comments__actions">
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={disabled}
                    onClick={() =>
                      void mutate(
                        () =>
                          apiClient.deleteComment(
                            organizationId,
                            projectId,
                            issueId,
                            comment.id,
                          ),
                        "delete",
                      )
                    }
                  >
                    {busy ? "Deleting…" : "Confirm delete"}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={busy}
                    onClick={() => setDeletingId(null)}
                  >
                    Keep comment
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
      {page && page.totalPages > 1 ? (
        <nav className="issue-comments__pagination" aria-label="Comment pages">
          <button
            type="button"
            className="button-secondary"
            disabled={disabled || page.page <= 1}
            onClick={() => {
              setEditingId(null);
              setDeletingId(null);
              void load(page.page - 1);
            }}
          >
            Previous comments
          </button>
          <span>
            Page {page.page} of {page.totalPages}
          </span>
          <button
            type="button"
            className="button-secondary"
            disabled={disabled || page.page >= page.totalPages}
            onClick={() => {
              setEditingId(null);
              setDeletingId(null);
              void load(page.page + 1);
            }}
          >
            Next comments
          </button>
        </nav>
      ) : null}
      <form
        className="issue-comments__composer"
        onSubmit={(event) => {
          event.preventDefault();
          void mutate(
            () =>
              apiClient.createComment(
                organizationId,
                projectId,
                issueId,
                draft,
              ),
            "create",
          );
        }}
      >
        <label htmlFor="new-comment">Add a comment</label>
        <textarea
          ref={composer}
          id="new-comment"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={10_000}
          required
          disabled={busy}
          placeholder="Share an update or ask a question…"
        />
        <button
          type="submit"
          className="button-primary"
          disabled={disabled || !draft.trim()}
        >
          {busy ? "Saving…" : "Add comment"}
        </button>
      </form>
      {error ? (
        <p className="issue-form-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="issue-comments__notice" role="status">
        {notice}
      </p>
    </section>
  );
}
