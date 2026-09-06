"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FactoryNode, MachineHandler, Recipe } from "@/lib/model/types";
import { getNodeSteamReport } from "@/lib/solver/power-report";
import { applyMachineHandlerToRecipe, formatRate, isSteamMachineHandler } from "@/lib/model";
import { ResourceIcon } from "@/components/nei/ResourceIcon";
import type { MachineHandlerIcon } from "./machine-icons";

/**
 * The machine switcher: one list under the card's name bar, opened by the
 * chevron at the bar's left. Each row is the machine's icon, its name and
 * two figures at the recipe's own tier (time, EU/t). Click switches; hover
 * previews the machine on the card exactly as the old tab strip did.
 * Order is fixed - manual, steam, electric, multiblock, by tier inside each -
 * because that is the only order anyone reads a machine list in.
 */

// Rendered machine PNGs are 256px squares whose opaque block art spans
// exactly 114x126px (identical bounds on every machine render). Drawing the
// image at art * 256/126 crops the transparent padding exactly; the art is
// then sized a hair under its box for a small breathing margin.
const MACHINE_ART_SCALE = 256 / 126;

export function machineArtPixels(box: number): number {
  const margin = Math.max(2, Math.round(box * 0.055));
  return Math.round((box - margin * 2) * MACHINE_ART_SCALE);
}

export interface HandlerRecipeStats {
  seconds: number;
  eut: number;
  totalEu: number;
  minimumTier: string;
  /** Steam-line machine: burns steam, never EU. */
  steam: boolean;
  perfectOverclock: boolean;
  fixedParallels?: number;
  scalingParallels: { label: string; max: number }[];
  controlSummaries: { label: string; detail: string }[];
  exactOverclocks: boolean;
}

export function getHandlerRecipeStats(recipe: Recipe, handler: MachineHandler): HandlerRecipeStats {
  const applied = applyMachineHandlerToRecipe(recipe, { machineHandlerId: handler.id });
  const scalingParallels: { label: string; max: number }[] = [];
  let fixedParallels: number | undefined;
  const controlSummaries: { label: string; detail: string }[] = [];
  for (const control of applied.machineConfigControls ?? []) {
    const parallelMax = Math.max(
      0,
      ...control.tiers
        .map((tier) => tier.parallelMultiplier ?? 0)
        .filter((value) => Number.isFinite(value)),
    );
    if (parallelMax > 1) {
      if (control.id === "machineParallel") {
        fixedParallels = parallelMax;
      } else {
        scalingParallels.push({ label: control.label, max: parallelMax });
      }
    }
    const first = control.tiers[0]?.label;
    const last = control.tiers[control.tiers.length - 1]?.label;
    const effects: string[] = [];
    if (parallelMax > 1 && control.id !== "machineParallel") {
      effects.push(`up to ×${formatRate(parallelMax, 0)} parallels`);
    }
    if (
      control.tiers.some(
        (tier) => Number.isFinite(tier.durationMultiplier) && tier.durationMultiplier !== 1,
      )
    ) {
      effects.push("changes speed");
    }
    if (
      control.tiers.some((tier) => Number.isFinite(tier.eutMultiplier) && tier.eutMultiplier !== 1)
    ) {
      effects.push("changes power");
    }
    if (control.tiers.some((tier) => Number.isFinite(tier.heat))) {
      effects.push("sets heat");
    }
    controlSummaries.push({
      label: control.label,
      detail: [
        first && last && first !== last ? `${first} → ${last}` : (first ?? ""),
        effects.join(", "),
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }
  return {
    seconds: applied.durationTicks / 20,
    eut: applied.eut,
    totalEu: applied.eut * applied.durationTicks,
    minimumTier: applied.minimumTier,
    steam: isSteamMachineHandler(handler),
    perfectOverclock: applied.machineProfile?.perfectOverclock === true,
    fixedParallels,
    scalingParallels,
    controlSummaries,
    exactOverclocks:
      handler.id === recipe.machineHandlers?.[0]?.id &&
      recipe.runtimeCalculation?.status === "computed" &&
      (recipe.runtimeCalculation?.variants.length ?? 0) > 0,
  };
}

export type MachineGroup = "Manual" | "Steam" | "Electric" | "Multiblock";
const GROUP_ORDER: MachineGroup[] = ["Manual", "Steam", "Electric", "Multiblock"];

export function getMachineGroup(handler: MachineHandler): MachineGroup {
  if (handler.kind === "multiblock") {
    return "Multiblock";
  }
  if (isSteamMachineHandler(handler)) {
    return "Steam";
  }
  const tier = handler.minimumTier;
  if ((tier && tier !== "NONE") || (handler.eut ?? 0) > 0) {
    return "Electric";
  }
  return "Manual";
}

function formatSeconds(seconds: number): string {
  return seconds >= 100
    ? Math.round(seconds).toLocaleString("en-US")
    : seconds.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/** Big numbers shrink to k/M so they always fit their fixed cells. */
function formatCompact(value: number): string {
  if (value >= 1_000_000) {
    return `${formatRate(value / 1_000_000, value >= 10_000_000 ? 0 : 1)}M`;
  }
  if (value >= 10_000) {
    return `${formatRate(value / 1000, value >= 100_000 ? 0 : 1)}k`;
  }
  return formatRate(value, 0);
}


/* ------------------------------------------------------------------ */
/* Machine menu                                                        */
/* ------------------------------------------------------------------ */

const TIER_ORDER = ["NONE", "ULV", "LV", "MV", "HV", "EV", "IV", "LuV", "ZPM", "UV", "UHV", "UEV", "UIV", "UMV", "UXV", "MAX"];
const tierRank = (tier: string | undefined) => {
  const index = TIER_ORDER.indexOf(tier ?? "NONE");
  return index < 0 ? TIER_ORDER.length : index;
};

/** Handlers in reading order: group, then tier, then name. */
export function orderMachineHandlers(handlers: MachineHandler[]): MachineHandler[] {
  return [...handlers].sort((a, b) => {
    const group = GROUP_ORDER.indexOf(getMachineGroup(a)) - GROUP_ORDER.indexOf(getMachineGroup(b));
    if (group !== 0) return group;
    const tier = tierRank(a.minimumTier) - tierRank(b.minimumTier);
    if (tier !== 0) return tier;
    return a.label.localeCompare(b.label);
  });
}

export function MachineMenu({
  recipe,
  node,
  handlers,
  selectedId,
  iconsById,
  onHover,
  onUse,
  onClose,
}: {
  recipe: Recipe;
  /** The card's node: a steam machine's litres are read at its settings. */
  node: FactoryNode;
  handlers: MachineHandler[];
  selectedId: string;
  iconsById: ReadonlyMap<string, MachineHandlerIcon>;
  onHover: (handlerId: string | undefined) => void;
  onUse: (handlerId: string) => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  // The menu PORTALS to the body, like the crop and hatch menus: inside the
  // card it would sit in the node layer, under the marching-dash canvas and
  // every higher card. Fixed and in screen pixels, so it reads the same at
  // every zoom. Measured once from the name bar on open; a board pan closes
  // it through the click-away.
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [anchorAt, setAnchorAt] = useState<{ left: number; top: number }>();
  useEffect(() => {
    const parent = anchorRef.current?.parentElement;
    if (parent) {
      const rect = parent.getBoundingClientRect();
      setAnchorAt({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 412)),
        top: Math.min(rect.bottom + 2, window.innerHeight - 120),
      });
    }
  }, []);
  const rows = useMemo(
    () =>
      orderMachineHandlers(handlers).map((handler) => {
        const stats = getHandlerRecipeStats(recipe, handler);
        // A steam machine's cost is litres, read the way the card bills it.
        const steam = stats.steam
          ? getNodeSteamReport(recipe, { ...node, machineHandlerId: handler.id })
          : undefined;
        // Figure and unit apart, so the unit can be set the card's way:
        // small, muted, no space.
        const power: { value: string; unit: string } = steam
          ? { value: formatCompact(steam.drawSteamPerTick * 20).replace(/\.0$/, ""), unit: "L/s" }
          : stats.eut > 0
            ? { value: formatCompact(stats.eut), unit: "EU/t" }
            : { value: "none", unit: "" };
        return { handler, stats, power };
      }),
    [handlers, node, recipe],
  );

  // Anywhere outside, or Escape, closes it. Capture phase so canvas handlers
  // that stop propagation cannot swallow the click; the chevron manages its
  // own toggle, so a click on it is left alone.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.("[data-machine-menu-toggle]")) return;
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

  const menu = anchorAt ? (
    <div
      ref={rootRef}
      role="listbox"
      aria-label="Machine"
      className="nodrag nowheel z-[300] max-h-[400px] w-[400px] overflow-y-auto overflow-x-hidden border-2 border-[var(--mc-15)] bg-[var(--mc-49)] py-1.5 shadow-[inset_2px_2px_0_var(--mc-85),inset_-2px_-2px_0_var(--mc-25),2px_3px_6px_rgba(0,0,0,0.2)]"
      style={{ position: "fixed", left: anchorAt.left, top: anchorAt.top }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onMouseLeave={() => onHover(undefined)}
    >
      {rows.map(({ handler, stats, power }) => {
        const active = handler.id === selectedId;
        const icon = iconsById.get(handler.id);
        return (
          <button
            key={handler.id}
            type="button"
            role="option"
            aria-selected={active}
            onMouseEnter={() => onHover(handler.id)}
            onClick={(event) => {
              event.stopPropagation();
              onUse(handler.id);
            }}
            className={[
              "grid w-full items-center gap-x-4 px-3 py-1.5 text-left text-[13px] leading-[18px]",
              active ? "bg-[var(--mc-71)] text-white" : "text-[var(--mc-ink)] hover:bg-[var(--mc-61)] hover:text-white",
            ].join(" ")}
            style={{ gridTemplateColumns: "28px minmax(0,1fr) 52px 84px" }}
          >
            {/* Bare art, no slot chrome: the list is a menu, not a crafting grid. */}
            <span className="flex h-7 w-7 items-center justify-center">
              {icon ? (
                <ResourceIcon
                  resource={{ ...icon, amount: 1 }}
                  size="sm"
                  bare
                  showAmount={false}
                  tooltip={false}
                  className="!h-7 !w-7"
                  iconPixelSize={machineArtPixels(28)}
                />
              ) : null}
            </span>
            <span className="min-w-0 truncate">{handler.label}</span>
            <Figure value={formatSeconds(stats.seconds)} unit="s" />
            <Figure value={power.value} unit={power.unit} dim={power.unit === ""} />
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <>
      <span ref={anchorRef} hidden />
      {menu ? createPortal(menu, document.body) : null}
    </>
  );
}

/** A figure with its unit the way the card writes them: small, muted, no space. */
function Figure({ value, unit, dim }: { value: string; unit: string; dim?: boolean }) {
  return (
    <span className={["whitespace-nowrap text-right tabular-nums", dim ? "text-[var(--mc-ink-muted)]" : ""].join(" ")}>
      {value}
      {unit ? <span className="ml-0.5 text-[9px] text-[var(--mc-ink-muted)]">{unit}</span> : null}
    </span>
  );
}
