"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, FlaskConical, X } from "lucide-react";
import { ChangelogDialog } from "@/components/ChangelogDialog";
import { CHANGELOG } from "@/lib/changelog";
import { APP_VERSION } from "@/lib/version";
import { entriesSince, needsInterrupting } from "@/lib/whats-new";

/**
 * Seeing the update popup on purpose, without waiting to be away for a release.
 *
 * The whole feature only fires for someone whose browser holds an OLD version
 * stamp, which is exactly the state whoever built it does not have. Testing it
 * meant hand-editing localStorage and reloading, so in practice it got looked
 * at once and then shipped on faith.
 *
 * So: shift-click the version chip. Pick the version you are pretending to
 * arrive from, and the real dialog opens on the real entries, through the same
 * `entriesSince` the live path uses. Nothing is written to storage - closing
 * the preview drops you back on the picker with your actual state untouched.
 *
 * Hidden rather than gated behind a build flag because the useful place to
 * check this is production, on the real changelog, right before telling
 * everyone to reload.
 */
export function WhatsNewPreview({ onClose }: { onClose: () => void }) {
  const [pretend, setPretend] = useState<string>();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pretend) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, pretend]);

  if (pretend) {
    const missed = entriesSince(pretend);
    return (
      <ChangelogDialog
        unseenVersions={new Set(missed.map((entry) => entry.version))}
        tone={needsInterrupting(missed) ? "interrupt" : "normal"}
        // Back to the picker, not out: the point of this is trying several.
        // And no version stamp is written, so the tester's own state survives.
        onClose={() => setPretend(undefined)}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[125] grid place-items-center bg-neutral-950/80 p-4 backdrop-blur-sm compact:bg-neutral-950/92 compact:[backdrop-filter:none]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Preview the what's new popup"
        className="flex max-h-[calc(80*var(--ui-vh))] w-full max-w-md flex-col rounded-lg border border-line-strong bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-fg-muted">
              <FlaskConical className="h-3 w-3" aria-hidden />
              Dev preview
            </p>
            <h2 className="mt-1 text-base font-bold">Arrive from which version?</h2>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">
              {`Shows what somebody last here on that version sees on v${APP_VERSION}. Nothing is saved.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded p-1 text-fg-subtle hover:bg-surface-raised"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {CHANGELOG.map((entry) => {
            const missed = entriesSince(entry.version);
            // The three outcomes the live path can produce, named. A row that
            // produces nothing is the interesting answer as often as not, so it
            // says so rather than being left off the list.
            const outcome =
              missed.length === 0
                ? { label: "Nothing", tone: "text-fg-muted" }
                : needsInterrupting(missed)
                  ? { label: `Popup, ${missed.length}`, tone: "text-cyan-300" }
                  : { label: `Dot only, ${missed.length}`, tone: "text-fg-subtle" };
            return (
              <li key={entry.version}>
                <button
                  type="button"
                  disabled={missed.length === 0}
                  onClick={() => setPretend(entry.version)}
                  className="flex w-full items-baseline gap-3 rounded px-2 py-1.5 text-left hover:bg-surface-raised disabled:pointer-events-none disabled:opacity-40"
                >
                  <span className="w-16 shrink-0 text-sm font-bold tabular-nums">
                    v{entry.version}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">
                    {entry.headline}
                  </span>
                  <span className={`shrink-0 text-[11px] font-bold ${outcome.tone}`}>
                    {outcome.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="flex items-center gap-1.5 border-t border-line px-4 py-2 text-[11px] text-fg-muted">
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Closing the preview brings you back here.
        </p>
      </div>
    </div>
  );
}
