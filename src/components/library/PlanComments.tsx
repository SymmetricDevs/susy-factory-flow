"use client";

import { LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useCommunityUser } from "@/components/community/auth";
import { formatRelativeDate } from "@/components/shelf-cards";
import { deletePlanComment, listPlanComments, postPlanComment } from "@/lib/community/client";
import type { CommunityComment } from "@/lib/community/types";
import { COMMUNITY_COMMENT_MAX_LENGTH } from "@/lib/community/types";
import { openLibrary } from "@/lib/library/library-tab";

/**
 * The comments on a shared setup, on its focus page. Oldest first, the way
 * a thread reads. Signed in you can post; your own comments, and every
 * comment on your own post, can be deleted. Signed out you can read.
 */
export function PlanComments({ planId }: { planId: string }) {
  const { user } = useCommunityUser();
  const [loaded, setLoaded] = useState<{ planId: string; comments: CommunityComment[] }>();
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState<string>();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listPlanComments(planId).then(
      (comments) => {
        if (!cancelled) {
          setLoaded({ planId, comments });
          setError(undefined);
        }
      },
      (thrown: unknown) => {
        if (!cancelled) {
          setError(thrown instanceof Error ? thrown.message : "Comments could not be loaded.");
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // The viewer changing (sign in, sign out) changes who may delete what.
  }, [planId, user?.username, tick]);

  const comments = loaded?.planId === planId ? loaded.comments : undefined;

  const post = async () => {
    const text = draft.trim();
    if (!text || posting) {
      return;
    }
    setPosting(true);
    try {
      const comment = await postPlanComment(planId, text);
      setLoaded((current) =>
        current && current.planId === planId
          ? { planId, comments: [...current.comments, comment] }
          : { planId, comments: [comment] },
      );
      setDraft("");
      setError(undefined);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "The comment could not be posted.");
    } finally {
      setPosting(false);
    }
  };

  const remove = async (comment: CommunityComment) => {
    setDeletingId(comment.id);
    try {
      await deletePlanComment(planId, comment.id);
      setLoaded((current) =>
        current
          ? { ...current, comments: current.comments.filter((entry) => entry.id !== comment.id) }
          : current,
      );
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "The comment could not be deleted.");
      setTick((value) => value + 1);
    } finally {
      setDeletingId(undefined);
    }
  };

  return (
    // The same panel as NEEDS and MAKES beside it: one bordered box on the
    // raised ground, a small black head with the count, the thread inside,
    // and the box to write in as a strip along the bottom.
    <section className="flex min-w-0 flex-col border border-[var(--mc-33)] bg-[var(--mc-25)] p-2">
      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--mc-ink)]">
        Comments
        {comments ? (
          <span className="ml-1.5 font-medium text-[var(--mc-ink-muted)]">{comments.length}</span>
        ) : null}
      </div>

      {error ? <p className="text-[11px] text-red-400">{error}</p> : null}

      {!comments ? (
        <div className="flex h-8 items-center">
          <LoaderCircle className="h-4 w-4 animate-spin text-neutral-400" aria-label="Loading" />
        </div>
      ) : comments.length === 0 ? (
        <div className="py-1 text-[11px] text-[var(--mc-ink-muted)]">Nothing yet</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="group flex flex-col gap-1 border border-[var(--mc-33)] bg-[#101215] px-2.5 py-2"
            >
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => openLibrary({ kind: "public", search: `@${comment.authorName}` })}
                  className="font-bold text-neutral-100 hover:text-cyan-200"
                >
                  {comment.authorName}
                </button>
                <span className="text-[var(--mc-ink-muted)]">
                  {formatRelativeDate(comment.createdAt)}
                </span>
                {comment.canDelete ? (
                  <button
                    type="button"
                    disabled={deletingId === comment.id}
                    onClick={() => void remove(comment)}
                    aria-label="Delete this comment"
                    title="Delete"
                    className="ml-auto text-[var(--mc-ink-muted)] opacity-0 hover:text-red-300 focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                  >
                    {deletingId === comment.id ? (
                      <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden />
                    ) : (
                      <X className="h-3 w-3" aria-hidden />
                    )}
                  </button>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap break-words pl-3 text-[12px] leading-relaxed text-neutral-300">
                {comment.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* The box to write in: one flat strip on the page floor, no bevel,
          the field and the Post key sharing a single frame. Signed out it
          is the same strip, asleep, so the page keeps its shape. */}
      <div className="mt-2 flex items-stretch border border-[var(--mc-33)] bg-[#101215]">
        <input
          value={draft}
          disabled={!user}
          onChange={(event) =>
            setDraft(event.target.value.slice(0, COMMUNITY_COMMENT_MAX_LENGTH))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void post();
            }
          }}
          placeholder={user ? "Add a comment" : "Sign in to comment"}
          aria-label="Your comment"
          className="h-9 min-w-0 flex-1 bg-transparent px-2.5 text-[12px] text-neutral-100 outline-none placeholder:text-[var(--mc-ink-muted)] disabled:cursor-default"
        />
        <button
          type="button"
          disabled={!user || !draft.trim() || posting}
          onClick={() => void post()}
          className="flex shrink-0 items-center gap-1.5 border-l border-[var(--mc-33)] bg-[var(--mc-61)] px-3 text-[12px] font-bold text-[var(--mc-ink)] hover:bg-[var(--mc-85)] disabled:opacity-40 disabled:hover:bg-[var(--mc-61)]"
        >
          {posting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Post
        </button>
      </div>
    </section>
  );
}
