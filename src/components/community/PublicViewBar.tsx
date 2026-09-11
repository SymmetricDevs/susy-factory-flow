"use client";

import { Copy, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { copyViewedPost } from "@/lib/community/open-post";
import { useDesignStore } from "@/store/design-store";

export function PublicViewBar() {
  const view = useDesignStore((state) => state.publicView);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!view) return null;
  return (
    <section
      className="min-w-0 border-b border-line bg-surface px-2"
      aria-label="Public setup viewer"
    >
      <div className="flex h-[29px] min-w-0 items-center gap-2 text-xs">
        <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
        <span className="shrink-0 text-amber-400">View only</span>
        <span className="min-w-0 flex-1 truncate font-medium" title={view.name}>
          {view.name}
        </span>
        {view.authorName ? (
          <span className="truncate text-fg-muted">by {view.authorName}</span>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            try {
              await copyViewedPost();
            } catch (thrown) {
              setError(thrown instanceof Error ? thrown.message : "Could not create your copy.");
            } finally {
              setBusy(false);
            }
          }}
          className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded border border-line bg-transparent px-2 py-0 text-fg hover:bg-surface-raised hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 disabled:opacity-50"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {busy ? "Opening…" : "Open a copy"}
        </button>
      </div>
      {view.project.description ? (
        <p className="mb-1 max-h-24 overflow-auto whitespace-pre-wrap text-xs text-fg-muted">
          {view.project.description}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </section>
  );
}
