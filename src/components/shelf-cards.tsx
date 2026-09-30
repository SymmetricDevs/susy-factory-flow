"use client";

import type { ReactNode } from "react";
import type { PlanResourceStat } from "@/lib/community/types";
import type { MachineTier } from "@/lib/model/types";
import { formatSlotRate } from "@/components/flow/flow-explainers";
import { GT_TIER_COLORS } from "@/components/flow/tier-colors";
import { fluidArtPixels, isSwatchFluid, ResourceIcon } from "@/components/nei/ResourceIcon";

/**
 * Shared pieces for plan listings (library, share and export surfaces): tag
 * chips, tier badges, the Needs/Makes stat sections, and a row's hover card.
 */

export function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return "";
  }
  const seconds = Math.max(0, (Date.now() - then) / 1000);
  if (seconds < 60) {
    return "just now";
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  if (seconds < 86400 * 30) {
    return `${Math.floor(seconds / 86400)}d ago`;
  }
  return new Date(iso).toLocaleDateString();
}

export type VoltageTier = Exclude<MachineTier, "DEMO">;

/**
 * The GT voltage badge, styled like a card's tier button, at a fixed width
 * (the widest tier label) so the text after it aligns.
 */
export const TIER_BADGE_WIDTH = "w-8";

export function TierBadge({ tier }: { tier?: VoltageTier }) {
  const color = tier ? GT_TIER_COLORS[tier] : undefined;
  if (!tier || !color) {
    return <span className={`${TIER_BADGE_WIDTH} shrink-0`} aria-hidden />;
  }
  return (
    <span
      className={`${TIER_BADGE_WIDTH} shrink-0 border text-center text-[9px] font-bold leading-[14px] shadow-[inset_1px_1px_0_rgba(255,255,255,0.55),inset_-1px_-1px_0_rgba(0,0,0,0.45)]`}
      style={{
        backgroundColor: color.background,
        borderColor: color.border,
        color: color.text,
        textShadow: `1px 1px 0 ${color.shadow}`,
      }}
    >
      {tier}
    </span>
  );
}

/** One Needs/Makes column: a heading and its resource lines. */
function IoSection({
  label,
  stats,
  limit,
  muted,
}: {
  label: string;
  stats: PlanResourceStat[];
  limit: number;
  /** Renders the heading even when empty; used by the side-by-side layout
      so the two columns keep their headings aligned. */
  muted?: boolean;
}) {
  if (stats.length === 0 && !muted) {
    return null;
  }
  return (
    <div className="min-w-0 flex-1">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      {stats.length === 0 ? (
        <div className="py-0.5 text-[11px] text-slate-500">Nothing</div>
      ) : null}
      {stats.slice(0, limit).map((stat) => (
        <div key={`${stat.kind}:${stat.resourceId}`} className="flex items-center gap-1.5 py-0.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden">
            <ResourceIcon
              itemZoom={1.5}
              resource={{ ...stat, id: stat.resourceId, amount: 1 }}
              bare
              tooltip={false}
              showAmount={false}
              iconPixelSize={
                stat.kind === "fluid" ? (isSwatchFluid(stat) ? 36 : fluidArtPixels(20)) : undefined
              }
              className="!h-5 !w-5"
            />
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-slate-200">
            {stat.displayName ?? stat.resourceId}
          </span>
          <span className="shrink-0 tabular-nums text-[12px] text-slate-400">
            {formatSlotRate(stat.ratePerSecond, stat.kind)}
          </span>
        </div>
      ))}
      {stats.length > limit ? (
        <div className="text-[10px] text-slate-500">+{stats.length - limit} more</div>
      ) : null}
    </div>
  );
}

/**
 * The Needs/Makes stat sections, shared by rows, dialogs and hover cards.
 * Stacked by default; `side-by-side` puts needs left and makes right, for
 * anywhere with the width to spare.
 */
export function renderIoStats(
  needs: PlanResourceStat[],
  outputs: PlanResourceStat[],
  options: { layout?: "stacked" | "side-by-side"; limit?: number } = {},
): ReactNode {
  if (needs.length === 0 && outputs.length === 0) {
    return undefined;
  }

  const limit = options.limit ?? 8;
  if (options.layout === "side-by-side") {
    return (
      <div className="flex gap-4">
        <IoSection label="Needs" stats={needs} limit={limit} muted />
        <IoSection label="Makes" stats={outputs} limit={limit} muted />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <IoSection label="Needs" stats={needs} limit={limit} />
      <IoSection label="Makes" stats={outputs} limit={limit} />
    </div>
  );
}
