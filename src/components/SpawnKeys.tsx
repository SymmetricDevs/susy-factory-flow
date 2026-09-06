"use client";

import { Gauge, Sprout, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { useFactoryStore } from "@/store/factory-store";

/**
 * The three cards that are not recipes, at the top of the items column:
 * a generator (the power catalog), a custom rate node, a crop farm. They
 * lived on the board's build tray until 2026-09-06, when the tray ran out
 * of room for the mode keys; this column is where you go to add things,
 * so this is where they belong.
 *
 * Quiet on purpose (Jack, 2026-09-06): the column's own key face (the
 * search box's border and ground), no plate behind the row and no colour
 * on the icons, so they read as three things you can put down and not as
 * a section of the column. `leading` is the column's own fold-away key,
 * which sits at the row's start rather than in the search box.
 */
export function SpawnKeys({ leading }: { leading?: ReactNode }) {
  const openPowerMenu = useFactoryStore((state) => state.openPowerMenu);
  const addCustomRateNode = useFactoryStore((state) => state.addCustomRateNode);
  const addCropFarmNode = useFactoryStore((state) => state.addCropFarmNode);
  const key =
    "flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[4px] border border-neutral-700 bg-[#17191d] px-2 font-mono text-[11px] font-black tracking-wide text-neutral-200 shadow-[inset_1px_1px_0_rgba(255,255,255,0.08)] hover:border-cyan-600 hover:text-cyan-300";
  return (
    <div className="mx-2 mt-2 flex shrink-0 gap-1.5">
      {leading}
      <button
        type="button"
        onClick={openPowerMenu}
        className={key}
        title="Place a generator"
        aria-label="Place a generator"
      >
        <Zap className="h-4 w-4 shrink-0" />
        POWER
      </button>
      <button
        type="button"
        onClick={addCustomRateNode}
        className={key}
        title="Add custom rate node"
        aria-label="Add custom rate node"
      >
        <Gauge className="h-4 w-4 shrink-0" />
        CUSTOM
      </button>
      <button
        type="button"
        onClick={addCropFarmNode}
        className={key}
        title="Add crop farm"
        aria-label="Add crop farm"
      >
        <Sprout className="h-4 w-4 shrink-0" />
        FARM
      </button>
    </div>
  );
}
