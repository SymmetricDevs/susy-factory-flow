"use client";

import { useRef, useState } from "react";
import { useDropdownDismiss } from "@/lib/hooks/use-dropdown-dismiss";

import { Bug, ChevronDown, Compass, Heart, Library } from "lucide-react";
import { leaveLibrary, openLibrary } from "@/lib/library/library-tab";
import { openWelcomeTab } from "@/lib/welcome/welcome-tab";
import { APP_VERSION } from "@/lib/version";

const GITHUB_URL = "https://github.com/jackwrichards/gtnh-factory-flow";

/**
 * The planner's thread in the GTNH Discord. A thread, not a server invite,
 * so it only opens for people already in the server.
 */
const DISCORD_THREAD_URL = "https://discord.com/channels/181078474394566657/1531402304530682036";

/**
 * The tip jar. Clicks are counted through Umami's `data-umami-event`
 * auto-tracking (they land in the dashboard's Events panel, split by the
 * `source` field); the attribute is inert when the analytics script is off.
 */
const KOFI_URL = "https://ko-fi.com/gtnhplanner";

/**
 * The bug report form with the app version pre-filled, since reporters rarely
 * think to include the build.
 */
const BUG_REPORT_URL = `${GITHUB_URL}/issues/new?template=bug_report.yml&version=${encodeURIComponent(
  APP_VERSION,
)}`;

/** The header's "Help" dropdown: the auxiliary set of MenuLinks. */
export function HeaderLinks() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useDropdownDismiss(open, { refs: [root], onClose: () => setOpen(false) });
  return (
    <div ref={root} className="relative shrink-0">
      <button type="button" aria-expanded={open} aria-label="Help and links"
        onClick={() => setOpen(!open)}
        className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-fg-muted hover:bg-surface-raised hover:text-fg">
        Help <ChevronDown className="h-3 w-3" />
      </button>
      {open ? <div className="absolute right-0 top-full z-[100] mt-1 w-52 rounded border border-line-strong bg-surface p-1 text-sm shadow-xl">
        <MenuLinks auxiliary onAction={() => setOpen(false)} />
      </div> : null}
    </div>
  );
}

/** The donation link: a heart in its own colour, labelled for screen readers. */
export function SupportButton() {
  return (
    <a
      href={KOFI_URL}
      target="_blank"
      rel="noreferrer noopener"
      title="Support on Ko-fi"
      aria-label="Support GTNH Planner on Ko-fi"
      data-umami-event="support-kofi"
      data-umami-event-source="header"
      className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded border border-pink-800 bg-pink-950 px-2 text-xs font-semibold text-pink-300 hover:border-pink-600 hover:bg-pink-900 hover:text-pink-200 snug:w-5 snug:justify-center snug:px-0"
    >
      <Heart className="h-3.5 w-3.5 fill-current" aria-hidden />
      <span className="sr-only">Support</span>
    </a>
  );
}

/**
 * The app's links as labelled rows (touch has no hover tooltips), for the
 * compact menu. `auxiliary` (the header's Help dropdown) leaves out Library
 * and Support.
 */
export function MenuLinks({ onAction, auxiliary = false }: { onAction?: () => void; auxiliary?: boolean }) {
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => {
          leaveLibrary();
          openWelcomeTab();
          onAction?.();
        }}
        className="flex h-10 items-center gap-2.5 rounded px-2 text-left text-sm text-fg-subtle hover:bg-surface-sunken"
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <Compass className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="truncate">Welcome</span>
      </button>
      {!auxiliary ? <button
        type="button"
        onClick={() => {
          openLibrary();
          onAction?.();
        }}
        className="flex h-10 items-center gap-2.5 rounded px-2 text-left text-sm text-fg-subtle hover:bg-surface-sunken"
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <Library className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="truncate">Library</span>
      </button> : null}
      <MenuLink href={GITHUB_URL} label="Source on GitHub">
        <GithubMark />
      </MenuLink>
      <MenuLink href={DISCORD_THREAD_URL} label="Discord thread">
        <DiscordMark />
      </MenuLink>
      {!auxiliary ? <MenuLink
        href={KOFI_URL}
        label="Support GTNH Planner"
        tone="support"
        umamiEvent="support-kofi"
      >
        <Heart className="h-3.5 w-3.5 fill-current" aria-hidden />
      </MenuLink> : null}
      <MenuLink href={BUG_REPORT_URL} label="Report a bug">
        <Bug className="h-3.5 w-3.5" aria-hidden />
      </MenuLink>
    </div>
  );
}

function MenuLink({
  href,
  label,
  tone,
  umamiEvent,
  children,
}: {
  href: string;
  label: string;
  tone?: "danger" | "support";
  /** Umami auto-tracks clicks on elements carrying this event name. */
  umamiEvent?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      data-umami-event={umamiEvent}
      data-umami-event-source={umamiEvent ? "menu" : undefined}
      className={[
        "flex h-10 items-center gap-2.5 rounded px-2 text-sm hover:bg-surface-sunken",
        tone === "danger" ? "text-red-300" : tone === "support" ? "text-pink-300" : "text-fg-subtle",
      ].join(" ")}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{children}</span>
      <span className="truncate">{label}</span>
    </a>
  );
}

/* Brand marks are drawn inline: lucide dropped its brand icons, and these two
   are the logos people scan for rather than read, so a generic glyph would
   cost more than the markup does. */

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function DiscordMark() {
  return (
    <svg viewBox="0 0 127.14 96.36" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
    </svg>
  );
}
