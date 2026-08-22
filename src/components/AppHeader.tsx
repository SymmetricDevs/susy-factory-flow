"use client";

import { Settings } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { OPEN_SHARE_DIALOG_EVENT } from "@/lib/setups-tab";
import { useIsCompactViewport } from "@/lib/compact-view";
import { markVersionSeenAndNotify, subscribeToVersionSeen, unseenEntries } from "@/lib/whats-new";
import { APP_VERSION } from "@/lib/version";
import { AccountMenu } from "./community/AccountMenu";
import { SharePlanDialog } from "./community/SharePlanDialog";
import { AppIdentity } from "./AppIdentity";
import { AppMenu } from "./AppMenu";
import { BoardActions } from "./BoardActions";
import { ExportImageDialog } from "./export/ExportImageDialog";
import { ChangelogDialog } from "./ChangelogDialog";
import { DevMenu } from "./DevMenu";
import { SettingsDialog } from "./SettingsDialog";
import { HeaderLinks, ReportBugButton, SupportButton } from "./HeaderLinks";
import { WhatsNewPreview } from "./WhatsNewPreview";

/**
 * The pack picker's switch. See the note where it renders; flip this back to
 * true when there is more than one pack to pick from.
 */
export const SHOW_PACK_PICKER = false;

interface AppHeaderProps {
  onLoadDatasetVersion: (versionId: string) => void;
}

/**
 * The one top bar for the whole app: title, version chip, game version, board
 * actions, account. The old Community page folded into the sidebar's Setups
 * tab, so there is no page switch up here anymore.
 */
export function AppHeader({ onLoadDatasetVersion }: AppHeaderProps) {
  const [isChangelogOpen, setChangelogOpen] = useState(false);
  // The unread dot, on the version chip now that the What's new button is
  // gone. It comes from localStorage, which a server render does not have,
  // so the server snapshot is "nothing unread".
  const hasUnread = useSyncExternalStore(
    subscribeToVersionSeen,
    () => unseenEntries().length > 0,
    () => false,
  );
  // Captured at the moment of the click, because opening the notes marks them
  // read: without this the divider would have nothing above it.
  const [unseenVersions, setUnseenVersions] = useState<Set<string>>();
  // The update-popup preview, reached from the dev menu. See WhatsNewPreview.
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  // Shift-click the version chip. See DevMenu.
  const [isDevMenuOpen, setDevMenuOpen] = useState(false);
  // The share dialog lives up here rather than in BoardActions so the compact
  // menu can close behind it without unmounting it. The export dialog for the
  // same reason.
  const [isShareOpen, setShareOpen] = useState(false);
  const [isExportOpen, setExportOpen] = useState(false);
  // The shelf asks for the share dialog by event after putting a design on
  // the canvas ("Update post"): same dialog, same board, no second copy.
  useEffect(() => {
    const open = () => setShareOpen(true);
    window.addEventListener(OPEN_SHARE_DIALOG_EVENT, open);
    return () => window.removeEventListener(OPEN_SHARE_DIALOG_EVENT, open);
  }, []);
  // Settings lives up here for the same reason as the share dialog: the
  // compact menu closes behind it without unmounting it.
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  // Narrow windows keep the name and the version chip and fold the rest into
  // one menu — see AppMenu for why a bar that overflows costs a phone more than
  // the buttons that fall off the end of it.
  const isCompact = useIsCompactViewport();

  return (
    <header className="relative flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3 py-1.5">
      <h1 className="flex min-w-0 items-center gap-2 text-sm font-bold tracking-tight">
        <span className="shrink-0">
          SuSy <span className="text-cyan-500">Planner</span>
        </span>
        <button
          type="button"
          onClick={(event) => {
            // Shift-click is the way in to the dev menu (the perf readout,
            // the update-popup preview). Undiscovered by accident, and the
            // ordinary click is unchanged.
            if (event.shiftKey) {
              setDevMenuOpen(true);
              return;
            }
            // Read what is unseen BEFORE stamping, or the dialog opens with
            // nothing above its divider. Opening it IS reading it, so the dot
            // goes now rather than on close.
            setUnseenVersions(new Set(unseenEntries().map((entry) => entry.version)));
            markVersionSeenAndNotify();
            setChangelogOpen(true);
          }}
          title="What's new"
          aria-label={`Version ${APP_VERSION}: see what's new`}
          className="relative shrink-0 rounded border border-line px-1 py-px text-[10px] font-semibold leading-none text-fg-muted tabular-nums hover:border-cyan-600 hover:text-cyan-500"
        >
          v{APP_VERSION}
          {hasUnread ? (
            <span
              aria-label="Unread release notes"
              className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-surface bg-cyan-400"
            />
          ) : null}
        </button>
        {/* The pack picker rides up here beside the app version rather than at
            the head of the browser column. Two versions that are easy to
            confuse now sit together and read as a pair, and the column below
            gets a whole row of its height back. On a phone it moves once more,
            into the menu: it is the widest control on the bar and the one people
            touch least. */}
        {/* PINNED (Jack, 2026-09-06): the pack picker is off the bar while
            2.9 is the only pack there is. A dropdown with one option is a
            question nobody can answer. AppIdentity and the header's
            `onLoadDatasetVersion` prop stay wired so it can come back the
            day a second pack ships; the compact menu's Pack section is
            pinned the same way in AppMenu. */}
        {isCompact || !SHOW_PACK_PICKER ? null : (
          <>
            <span className="ml-3 h-5 w-px bg-line" aria-hidden />
            <AppIdentity onLoadDatasetVersion={onLoadDatasetVersion} />
          </>
        )}
      </h1>
      {isChangelogOpen ? (
        <ChangelogDialog
          unseenVersions={unseenVersions}
          onClose={() => setChangelogOpen(false)}
        />
      ) : null}
      {isPreviewOpen ? <WhatsNewPreview onClose={() => setPreviewOpen(false)} /> : null}
      {isDevMenuOpen ? (
        <DevMenu
          onClose={() => setDevMenuOpen(false)}
          onPreviewUpdatePopup={() => setPreviewOpen(true)}
        />
      ) : null}
      {isShareOpen ? <SharePlanDialog onClose={() => setShareOpen(false)} /> : null}
      {isExportOpen ? <ExportImageDialog onClose={() => setExportOpen(false)} /> : null}
      {isSettingsOpen ? <SettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
      {isCompact ? (
        <AppMenu
          onLoadDatasetVersion={onLoadDatasetVersion}
          onShare={() => setShareOpen(true)}
          onExportImage={() => setExportOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        // The global `font: inherit` reset outranks any text-* on a button, so
        // the cluster sets the one size every control in it renders at.
        <div className="flex items-center gap-2 text-xs">
          <HeaderLinks />
          <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
          <BoardActions
            onShare={() => setShareOpen(true)}
            onExportImage={() => setExportOpen(true)}
          />
          <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
          {/* Dressed like the compass and the brand links: settings is a
              utility square, not one of the coloured calls to action. */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Open settings"
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-line-strong bg-surface text-fg-subtle hover:bg-surface-raised hover:text-fg"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          <SupportButton />
          {/* No What's new button up here since 2026-09-06: the version chip
              at the other end of the bar opens the same notes and wears the
              unread dot, and the bar was two labelled buttons too wide. */}
          <ReportBugButton />
          <AccountMenu />
        </div>
      )}
    </header>
  );
}
