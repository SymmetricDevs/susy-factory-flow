"use client";

import { useDropdownDismiss } from "@/lib/hooks/use-dropdown-dismiss";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getUiScale } from "@/lib/ui-scale";
import { Minus, Plus, Zap } from "lucide-react";
import {
  ENERGY_HATCH_TYPES,
  getEnergyHatchType,
  STANDARD_ENERGY_HATCH_ID,
} from "@/lib/machines/energy-hatches";
import { GT_OVERCLOCK_TIERS, getVoltageTierIndex } from "@/lib/model/tiers";
import type { MachineTier, Recipe } from "@/lib/model/types";
import { describePowerWorking, hatchEuT, hatchRowLabel } from "@/lib/solver/power-working";
import {
  listPowerWinsCached,
  nextPowerWin,
  previousPowerWin,
  type PowerWinNode,
} from "@/lib/solver/power-wins";
import { formatCompact } from "@/lib/model";
import { MinecraftTooltip } from "@/components/nei/MinecraftTooltip";
import { ResourceIcon } from "@/components/nei/ResourceIcon";
import { GT_TIER_COLORS } from "./tier-colors";
import { SETTING_TILE_CAPTION_CLASS, SETTING_TILE_CLASS } from "./SettingTile";
import {
  energyHatchCatalogKey,
  type EnergyHatchCatalog,
  type EnergyHatchCatalogEntry,
} from "./use-energy-hatch-catalog";

type VoltageTier = Exclude<MachineTier, "DEMO">;

/**
 * The hatch's art at a hard size, zoomed INTO the sprite. The rendered
 * machine sprites are 256px canvases whose block fills only the middle ~45%,
 * so the image is drawn at 220% of the window and the margin cropped away -
 * the block itself fills the box. Sized with a class on the window and
 * percentages on the img, never ResourceIcon's size overrides: this project
 * is Tailwind v4, where the legacy `!h-*` prefix classes those overrides used
 * generate no CSS at all.
 */
export function EnergyHatchArt({
  entry,
  boxClass,
}: {
  entry?: EnergyHatchCatalogEntry;
  boxClass: string;
}) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden ${boxClass}`}
    >
      {entry?.iconPath ? (
        <img
          src={entry.iconPath}
          alt={entry.displayName}
          draggable={false}
          className="minecraft-pixel-art h-[220%] w-[220%] max-w-none object-contain"
        />
      ) : entry?.iconAtlas ? (
        <ResourceIcon
          resource={{ kind: "item", amount: 1, ...entry }}
          bare
          tooltip={false}
          showAmount={false}
          showConsumedState={false}
        />
      ) : (
        <Zap className="h-[55%] w-[55%] opacity-60" />
      )}
    </span>
  );
}

/**
 * The floating shell both dropdowns share: a fixed body portal at tooltip
 * depth (the only layer above the marching-dash canvas and neighbouring
 * cards), anchored under its chip, closed by Escape, any press outside, or
 * any scroll outside - a fixed panel over a moving board must never be left
 * stranded where the chip used to be.
 */
function MenuShell({
  anchor,
  width,
  maxHeight,
  onClose,
  children,
}: {
  /** The chip's right edge and its top and bottom, in screen coordinates. */
  anchor: { x: number; top: number; bottom: number };
  width: number;
  maxHeight: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // The one dropdown rule (use-dropdown-dismiss.ts). The anchor button is
  // "inside": it runs its own toggle, and closing here first would make that
  // toggle reopen the menu instead.
  useDropdownDismiss(true, {
    refs: [panelRef],
    onClose,
    insideSelector: "[data-hatch-menu-anchor]",
    fade: true,
  });

  // Prefer opening UPWARD (the card stays visible for the hover-preview),
  // but flip downward when the chip is too close to the top of the screen -
  // a menu must never run off the viewport. Height caps to the chosen side.
  // The anchor rect and the window are real px; width and maxHeight are
  // shell px, and so are the fixed offsets of this zoomed box. Everything is
  // brought to shell px here.
  const scale = getUiScale();
  const shell = (px: number) => px / scale;
  const spaceAbove = shell(anchor.top) - 16;
  const spaceBelow = shell(window.innerHeight - anchor.bottom) - 16;
  const opensUp = spaceAbove >= Math.min(maxHeight, 260) || spaceAbove >= spaceBelow;

  return createPortal(
    <div
      ref={panelRef}
      // "nowheel" stops React Flow from zooming the canvas when scrolling the
      // list: its native wheel handler runs before React's synthetic one.
      className="ui-zoom nodrag nowheel fixed z-[9999] flex flex-col overflow-hidden border-2 border-[var(--mc-15)] bg-[var(--mc-78)] p-1.5 shadow-[inset_2px_2px_0_var(--mc-100),inset_-2px_-2px_0_var(--mc-33),4px_4px_0_rgba(0,0,0,0.35)]"
      style={{
        width,
        left: Math.max(8, Math.min(shell(anchor.x) - width, shell(window.innerWidth) - width - 8)),
        ...(opensUp
          ? {
              bottom: shell(window.innerHeight - anchor.top) + 4,
              maxHeight: Math.min(maxHeight, spaceAbove),
            }
          : {
              top: shell(anchor.bottom) + 4,
              maxHeight: Math.min(maxHeight, spaceBelow),
            }),
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

/** One concrete way to power the machine: a family plus a hatch count. */
export interface EnergySupplyOption {
  familyId: string;
  hatches: number;
  label: string;
  amps: number;
  entry?: EnergyHatchCatalogEntry;
}

/** Every whole hatch count the wheel walks; the chip's editor types any. */
const REGULAR_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

export function energySupplyOptionsForTier(
  tier: string,
  catalog: EnergyHatchCatalog,
): EnergySupplyOption[] {
  const ordinal = getVoltageTierIndex(tier as VoltageTier);
  const options: EnergySupplyOption[] = REGULAR_COUNTS.map((count) => ({
    familyId: STANDARD_ENERGY_HATCH_ID,
    hatches: count,
    label: `${count}× Energy Hatch`,
    // setProcessingLogicPower: a lone regular hatch works at 1 amp; two or
    // more work at 2 amps each.
    amps: count <= 1 ? 1 : 2 * count,
    entry: catalog.get(energyHatchCatalogKey(tier, STANDARD_ENERGY_HATCH_ID)),
  }));
  for (const type of ENERGY_HATCH_TYPES) {
    if (!type.exotic) {
      continue;
    }
    const entry = catalog.get(energyHatchCatalogKey(tier, type.id));
    const exists =
      catalog.size > 0
        ? entry !== undefined
        : getVoltageTierIndex(type.minTier as VoltageTier) <= ordinal;
    if (exists) {
      options.push({ familyId: type.id, hatches: 1, label: type.label, amps: type.amps, entry });
    }
  }
  return options;
}

/**
 * The second dropdown: every concrete supply at the chip's tier, amps beside
 * each. "4 A" alone names two different builds (a pair of regular hatches, or
 * one 4A multi-amp hatch) and the two differ in the parallel maths - summed
 * regular hatches raise the voltage ordinal, one exotic hatch does not - so
 * the rows carry the build's NAME and the amps ride as the figure.
 */
export function EnergySupplyMenu({
  anchor,
  tier,
  currentFamilyId,
  currentHatches,
  catalog,
  onPick,
  onPreview,
  onClose,
}: {
  anchor: { x: number; top: number; bottom: number };
  tier: string;
  currentFamilyId: string;
  currentHatches: number;
  catalog: EnergyHatchCatalog;
  onPick: (familyId: string, hatches: number) => void;
  /** Hovering a row shows the card as if it were picked. */
  onPreview?: (option?: { familyId: string; hatches: number }) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const allOptions = useMemo(() => energySupplyOptionsForTier(tier, catalog), [tier, catalog]);
  // Type what you want: "64" or "64a" lands on the 64A hatch, "2" on the
  // pair, "laser" on the lasers - Dagger's direct-input ask.
  const options = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/\s+/g, "");
    if (!needle) {
      return allOptions;
    }
    return allOptions.filter((option) => {
      const label = option.label.toLowerCase().replace(/\s+/g, "");
      const amps = String(option.amps);
      return (
        label.includes(needle) ||
        amps.startsWith(needle.replace(/a$/, "")) ||
        `${amps}a` === needle
      );
    });
  }, [allOptions, query]);
  const voltage = GT_OVERCLOCK_TIERS.find((entry) => entry.tier === tier)?.maxEuT ?? 0;
  const selectedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <MenuShell anchor={anchor} width={360} maxHeight={500} onClose={onClose}>
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && options[0]) {
            onPick(options[0].familyId, options[0].hatches);
          }
        }}
        placeholder="Type amps or a hatch..."
        aria-label="Filter supplies"
        className="mb-1 h-7 w-full border border-[var(--mc-33)] bg-[var(--mc-85)] px-2 text-[12px] font-bold text-[var(--mc-ink)] shadow-[inset_1px_1px_0_var(--mc-100),inset_-1px_-1px_0_var(--mc-54)] outline-none focus:border-cyan-700 focus:bg-[var(--mc-100)]"
      />
      <div className="mb-0.5 grid grid-cols-[minmax(0,1fr)_44px_64px] gap-x-1.5 border-b-2 border-[var(--mc-47)] px-1 pb-1 pr-[18px] text-[10px] font-bold uppercase tracking-[0.1em] leading-none text-[var(--mc-ink-muted)]">
        <span>Supply</span>
        <span className="text-right">Amps</span>
        <span className="text-right">EU/t</span>
      </div>
      <div className="recipe-search-scroll min-h-0 max-h-[320px] flex-1 overflow-y-scroll pr-1">
        {options.map((option, index) => {
          const selected =
            option.familyId === currentFamilyId &&
            (option.familyId !== STANDARD_ENERGY_HATCH_ID || option.hatches === currentHatches);
          const firstExotic =
            index > 0 &&
            option.familyId !== STANDARD_ENERGY_HATCH_ID &&
            options[index - 1].familyId === STANDARD_ENERGY_HATCH_ID;
          return (
            <button
              key={`${option.familyId}|${option.hatches}`}
              ref={selected ? selectedRef : undefined}
              type="button"
              onClick={() => onPick(option.familyId, option.hatches)}
              onMouseEnter={() => onPreview?.({ familyId: option.familyId, hatches: option.hatches })}
              onMouseLeave={() => onPreview?.(undefined)}
              className={`grid w-full grid-cols-[minmax(0,1fr)_44px_64px] items-center gap-x-1.5 border py-0.5 pl-0.5 pr-1 text-left text-[13px] font-bold leading-5 ${
                firstExotic ? "mt-1 border-t-2 border-t-[var(--mc-47)]" : ""
              } ${
                selected
                  ? "border-[var(--selection)] bg-[var(--mc-85)] text-[var(--mc-ink)]"
                  : "border-transparent text-[var(--mc-ink)] hover:border-[var(--mc-33)] hover:bg-[var(--mc-85)]"
              }`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <EnergyHatchArt entry={option.entry} boxClass="-my-2.5 h-14 w-14" />
                <span className="truncate">{option.label}</span>
              </span>
              <span
                className="whitespace-nowrap text-right tabular-nums"
                title={`${option.amps.toLocaleString("en-US")} A`}
              >
                {formatCompact(option.amps)}
              </span>
              <span
                className="whitespace-nowrap text-right tabular-nums text-[var(--mc-ink-muted)]"
                title={`${(voltage * option.amps).toLocaleString("en-US")} EU/t`}
              >
                {formatCompact(voltage * option.amps)}
              </span>
            </button>
          );
        })}
      </div>
    </MenuShell>
  );
}

/**
 * The first dropdown: the tier, each row wearing its colour and the voltage
 * it means. Rows below the recipe's floor still show, dimmed - an
 * under-tiered hatch is a real build the power report judges.
 */
export function EnergyTierMenu({
  anchor,
  currentTier,
  minimumTier,
  onPick,
  onPreview,
  onClose,
}: {
  anchor: { x: number; top: number; bottom: number };
  currentTier: string;
  minimumTier?: string;
  onPick: (tier: VoltageTier) => void;
  /** Hovering a row shows the card as if it were picked. */
  onPreview?: (tier?: VoltageTier) => void;
  onClose: () => void;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "center" });
  }, []);
  const minimumOrdinal =
    minimumTier !== undefined ? getVoltageTierIndex(minimumTier as VoltageTier) : undefined;

  return (
    <MenuShell anchor={anchor} width={190} maxHeight={480} onClose={onClose}>
      <div className="recipe-search-scroll min-h-0 flex-1 overflow-y-auto">
        {GT_OVERCLOCK_TIERS.map(({ tier, maxEuT }) => {
          const color = GT_TIER_COLORS[tier];
          const selected = tier === currentTier;
          const belowMinimum =
            minimumOrdinal !== undefined && getVoltageTierIndex(tier) < minimumOrdinal;
          return (
            <button
              key={tier}
              ref={selected ? selectedRef : undefined}
              type="button"
              onClick={() => onPick(tier)}
              onMouseEnter={() => onPreview?.(tier)}
              onMouseLeave={() => onPreview?.(undefined)}
              className={`flex w-full items-center justify-between gap-1.5 border px-1 py-0.5 text-left text-[12px] font-bold leading-5 ${
                selected
                  ? "border-[var(--selection)] bg-[var(--mc-85)]"
                  : "border-transparent hover:border-[var(--mc-33)] hover:bg-[var(--mc-85)]"
              } ${belowMinimum ? "opacity-50" : ""}`}
            >
              <span
                className="w-11 shrink-0 border px-1 text-center text-[11px] leading-[16px]"
                style={{
                  backgroundColor: color.background,
                  borderColor: color.border,
                  color: color.text,
                  textShadow: `1px 1px 0 ${color.shadow}`,
                  textDecoration: color.underline ? "underline" : undefined,
                }}
              >
                {tier}
              </span>
              <span
                className="whitespace-nowrap text-right tabular-nums text-[var(--mc-ink-muted)]"
                title={`${maxEuT.toLocaleString("en-US")} EU/t`}
              >
                {formatCompact(maxEuT)} EU/t
              </span>
            </button>
          );
        })}
      </div>
    </MenuShell>
  );
}

/** The supply chip's short reading: "2×" for regular hatches, the amp badge otherwise. */
export function energySupplyChipText(familyId: string | undefined, hatches: number): string {
  const type = getEnergyHatchType(familyId);
  return type.exotic ? type.chip : `${hatches}×`;
}

/**
 * THE HATCH CALCULATOR (Jack, 2026-09-07). A multiblock's power is one
 * EU/t number, and every energy hatch in the game boils down to one EU/t
 * figure, so the calculator is arithmetic on the card's number: every hatch
 * once, a minus and a plus on each, and nothing remembered - plus adds the
 * hatch's EU/t, minus takes it away. Each row's well says how many of THAT
 * hatch the number equals (ten thousand LV, half a UV), and typing there
 * sets the number in those terms. The right side: what the number buys, in
 * the card's own setting tiles; how far it has climbed toward the next win;
 * and the number itself at the bottom.
 */
export function EnergyHatchCalculator({
  anchor,
  recipe,
  node,
  budgetEuT,
  catalog,
  onChange,
  onClose,
}: {
  anchor: { x: number; top: number; bottom: number };
  recipe: Recipe;
  node: PowerWinNode;
  /** The card's current supply. */
  budgetEuT: number;
  catalog: EnergyHatchCatalog;
  onChange: (euT: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => listHatchRows(catalog), [catalog]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/\s+/g, "");
    if (!needle) {
      return rows;
    }
    return rows.filter((row) =>
      `${row.label}${row.fullName}`.toLowerCase().replace(/\s+/g, "").includes(needle),
    );
  }, [rows, query]);
  const working = useMemo(
    () => describePowerWorking(recipe, node, budgetEuT),
    [recipe, node, budgetEuT],
  );

  return (
    <MenuShell anchor={anchor} width={620} maxHeight={440} onClose={onClose}>
      <div className="flex min-h-0 flex-1 gap-2">
        {/* Every hatch, once. */}
        <div className="flex min-h-0 w-[306px] shrink-0 flex-col">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a hatch"
            aria-label="Find a hatch"
            className="mb-1.5 h-7 w-full border border-[var(--mc-47)] bg-[var(--mc-85)] px-2 text-[13px] font-bold text-[var(--mc-ink)] shadow-[inset_1px_1px_0_var(--mc-100),inset_-1px_-1px_0_var(--mc-54)] outline-none placeholder:text-[var(--mc-ink-muted)] focus:border-cyan-700 focus:bg-[var(--mc-100)]"
          />
          <div className="mb-0.5 flex items-center gap-1 border-b border-[var(--mc-47)] pb-1 pr-3 text-[10px] font-bold uppercase tracking-[0.1em] leading-none text-[var(--mc-ink-muted)]">
            <span className="w-7 shrink-0" />
            <span className="min-w-0 flex-1">Hatch</span>
            <span className="w-[54px] shrink-0 text-right">EU/t</span>
            <span className="w-[72px] shrink-0 text-right">Equals</span>
            <span className="w-[52px] shrink-0" />
          </div>
          {/* A framed scroll box that takes whatever height the right column
              sets: the panel is as tall as the ladder, the bar and the
              supply row, and the list fills the rest with no gap under
              either column. The frame is what makes the scrollbar read as
              the box's edge rather than a stray line against the panel. */}
          <div className="recipe-search-scroll min-h-0 flex-1 basis-0 overflow-y-scroll border border-[var(--mc-47)] bg-[var(--mc-93)] px-1">
            {visible.map((row, index) => (
              <HatchRowView
                key={row.key}
                row={row}
                budgetEuT={budgetEuT}
                firstOfFamily={index > 0 && visible[index - 1]!.familyId !== row.familyId}
                onChange={onChange}
              />
            ))}
          </div>
          <div className="mt-1 text-center text-[11px] font-bold leading-4 text-[var(--mc-ink-muted)]">
            Only adds or subtracts EU/t.
          </div>
        </div>

        {/* What it buys, the climb, the number. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {/* The ladder: the bare recipe against this supply, in the order
              the game applies things. Each row explains itself on hover. */}
          <div className={SETTING_TILE_CLASS}>
            <div className="grid grid-cols-[minmax(0,1fr)_70px_104px] items-baseline gap-x-2 border-b border-[var(--mc-47)] pb-0.5 text-[10px] font-bold uppercase tracking-[0.1em] leading-4 text-[var(--mc-ink-muted)]">
              <span />
              <span className="text-right">Recipe</span>
              <span className="truncate text-right">With {formatCompact(budgetEuT)}</span>
            </div>
            {working.rows.map((row) => (
              <MinecraftTooltip
                key={row.id}
                content={<div className="max-w-[240px] text-[12px] leading-4 text-white">{row.help}</div>}
              >
                <div
                  className={`grid grid-cols-[minmax(0,1fr)_70px_104px] items-baseline gap-x-2 leading-5 hover:bg-[var(--mc-78)] ${
                    row.emphasis
                      ? "mt-0.5 border-t border-[var(--mc-47)] pt-0.5 text-[13px] font-bold"
                      : "text-[12px] font-bold"
                  }`}
                >
                  <span className="truncate text-[var(--mc-ink-muted)]">{row.label}</span>
                  <span className="truncate text-right tabular-nums text-[var(--mc-ink-muted)]">
                    {row.recipe}
                  </span>
                  <span className="truncate text-right tabular-nums text-[var(--mc-ink)]">
                    {row.supplied}
                  </span>
                </div>
              </MinecraftTooltip>
            ))}
            {working.hint ? (
              <div className="mt-1 border-t border-[var(--mc-47)] pt-1 text-[11px] leading-4 text-[var(--mc-ink-muted)]">
                {working.hint}
              </div>
            ) : null}
          </div>


          {/* Where the number sits between the last win and the next. */}
          <div className={SETTING_TILE_CLASS}>
            <div className={SETTING_TILE_CAPTION_CLASS}>
              <span className="min-w-0 truncate">
                {working.stall
                  ? "Not running"
                  : working.nextWin
                    ? `Next: ${working.nextWin.gain}`
                    : "Top of the ladder"}
              </span>
              {working.nextWin && !working.stall ? (
                <span className="ml-auto shrink-0 normal-case text-[var(--mc-ink)]">
                  +{formatCompact(working.nextWin.euT - budgetEuT)}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 h-3 w-full border border-[var(--mc-47)] bg-[var(--mc-85)] shadow-[inset_1px_1px_0_var(--mc-54)]">
              <div
                className="h-full bg-[var(--selection)]"
                style={{ width: `${Math.round(working.progress * 100)}%` }}
              />
            </div>
            <div className="mt-px flex items-baseline justify-between gap-2 text-[11px] font-bold leading-4 tabular-nums text-[var(--mc-ink-muted)]">
              <span>{working.previousWin ? formatCompact(working.previousWin.euT) : ""}</span>
              <span>
                {working.stall
                  ? working.stall
                  : working.nextWin
                    ? formatCompact(working.nextWin.euT)
                    : ""}
              </span>
            </div>
          </div>

          {/* The number itself, and what the machine actually takes of it:
              the draw only steps up at a win, so the rest of the supply sits
              unused until the next one. */}
          <div className={SETTING_TILE_CLASS}>
            <div className={SETTING_TILE_CAPTION_CLASS}>
              <span className="min-w-0 truncate">Supply · {working.readAs}</span>
              <span className="ml-auto shrink-0">Uses</span>
            </div>
            <div className="flex items-center gap-1.5">
              <NumberWell
                value={budgetEuT}
                ariaLabel="Supply EU/t"
                onCommit={onChange}
                onStep={(direction) => {
                  // The wheel walks the wins, exactly as the card's chip does.
                  const wins = listPowerWinsCached(recipe, node);
                  const win =
                    direction > 0 ? nextPowerWin(wins, budgetEuT) : previousPowerWin(wins, budgetEuT);
                  if (win) {
                    onChange(win.euT);
                  }
                }}
                className="h-8 flex-1 text-right text-[20px]"
                compact
              />
              <span className="shrink-0 text-[11px] font-bold text-[var(--mc-ink-muted)]">EU/t</span>
              <span
                className="flex h-8 w-[88px] shrink-0 items-center justify-end whitespace-nowrap border border-[var(--mc-47)] bg-[var(--mc-78)] px-1.5 text-right text-[15px] font-bold tabular-nums text-[var(--mc-ink-muted)] shadow-[inset_1px_1px_0_var(--mc-93),inset_-1px_-1px_0_var(--mc-47)]"
              >
                {formatCompact(working.drawEuT)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </MenuShell>
  );
}

const ROW_BUTTON_CLASS =
  "flex h-6 w-6 shrink-0 items-center justify-center border border-[var(--mc-33)] bg-[var(--mc-82)] text-[var(--mc-ink)] shadow-[inset_1px_1px_0_var(--mc-100),inset_-1px_-1px_0_var(--mc-47)] enabled:hover:bg-[var(--mc-100)] enabled:active:shadow-[inset_1px_1px_0_var(--mc-47),inset_-1px_-1px_0_var(--mc-100)] disabled:opacity-35";

/** How many of a hatch: whole numbers plain, fractions to two places, thousands compact. */
function formatCount(value: number): string {
  if (value >= 1000) {
    return formatCompact(value);
  }
  if (value > 0 && value < 0.005) {
    return "<0.01";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * A number that types: shows the value at rest (compact), the plain digits
 * while focused, commits on blur or Enter, forgets on Escape. Shared by the
 * EU/t well and every row's "how many of this hatch" well.
 */
function NumberWell({
  value,
  ariaLabel,
  onCommit,
  onStep,
  className,
  compact,
}: {
  value: number;
  ariaLabel: string;
  onCommit: (value: number) => void;
  /** The wheel, when the well has somewhere to step. */
  onStep?: (direction: 1 | -1) => void;
  /** Sizing only: height, width, text size. */
  className: string;
  /** At rest, the app's k/M/G form; counts show whole and two-place figures. */
  compact?: boolean;
}) {
  const [draft, setDraft] = useState<string>();
  const shown = draft ?? (compact ? formatCompact(value) : formatCount(value));
  return (
    <input
      value={shown}
      onFocus={(event) => {
        setDraft(String(Number(value.toFixed(2))));
        event.currentTarget.select();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const parsed = Number.parseFloat((draft ?? "").trim().replace(/,/g, ""));
        setDraft(undefined);
        if (Number.isFinite(parsed) && parsed >= 0) {
          onCommit(parsed);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(undefined);
          event.currentTarget.blur();
        }
        event.stopPropagation();
      }}
      onWheel={
        onStep
          ? (event) => {
              event.stopPropagation();
              onStep(event.deltaY < 0 ? 1 : -1);
            }
          : undefined
      }
      inputMode="decimal"
      aria-label={ariaLabel}
      className={`min-w-0 border border-[var(--mc-47)] bg-[var(--mc-85)] px-1.5 font-bold tabular-nums text-[var(--mc-ink)] shadow-[inset_1px_1px_0_var(--mc-100),inset_-1px_-1px_0_var(--mc-54)] outline-none focus:border-cyan-700 focus:bg-[var(--mc-93)] ${className}`}
    />
  );
}

function HatchRowView({
  row,
  budgetEuT,
  firstOfFamily,
  onChange,
}: {
  row: HatchRow;
  budgetEuT: number;
  firstOfFamily: boolean;
  onChange: (euT: number) => void;
}) {
  return (
    <div
      className={`flex h-7 items-center gap-1 ${
        firstOfFamily ? "mt-1.5 border-t border-t-[var(--mc-47)] pt-1.5" : ""
      }`}
    >
      <EnergyHatchArt entry={row.entry} boxClass="h-7 w-7" />
      <TruncatedLabel
        text={row.label}
        className="min-w-0 flex-1 truncate text-[13px] font-bold leading-6 text-[var(--mc-ink)]"
      />
      <span className="w-[54px] shrink-0 whitespace-nowrap text-right text-[12px] font-bold tabular-nums leading-6 text-[var(--mc-ink-muted)]">
        {formatCompact(row.euT)}
      </span>
      <NumberWell
        value={budgetEuT / row.euT}
        ariaLabel={`${row.fullName} count`}
        onCommit={(count) => onChange(count * row.euT)}
        className="h-6 w-[72px] shrink-0 text-right text-[12px]"
      />
      <button
        type="button"
        onClick={() => onChange(Math.max(0, budgetEuT - row.euT))}
        disabled={budgetEuT <= 0}
        aria-label={`Remove ${row.fullName}`}
        className={ROW_BUTTON_CLASS}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onChange(budgetEuT + row.euT)}
        aria-label={`Add ${row.fullName}`}
        className={ROW_BUTTON_CLASS}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * A label that only grows a hover when it has actually been cut off: the
 * calculator carries no tooltips otherwise, but a name the column could
 * not fit ("UXV 16,777,216A Laser") must still be readable somewhere.
 */
function TruncatedLabel({ text, className }: { text: string; className: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    setClipped(element.scrollWidth > element.clientWidth + 1);
  }, [text]);
  return (
    <span ref={ref} className={className} title={clipped ? text : undefined}>
      {text}
    </span>
  );
}

interface HatchRow {
  key: string;
  tier: string;
  familyId: string;
  /** The row's short name: the tier, or the rating for an exotic hatch. */
  label: string;
  /** The item's full name, for the search and the button labels. */
  fullName: string;
  euT: number;
  entry?: EnergyHatchCatalogEntry;
}

/**
 * Every energy hatch in the game, once: the catalog's items when it has
 * loaded (the dataset knows which ratings exist at which tier), else the
 * families' own floors. Regular hatches first, then each exotic family,
 * each family walking up the tiers.
 */
function listHatchRows(catalog: EnergyHatchCatalog): HatchRow[] {
  const rows: HatchRow[] = [];
  for (const type of ENERGY_HATCH_TYPES) {
    for (const { tier } of GT_OVERCLOCK_TIERS) {
      const entry = catalog.get(energyHatchCatalogKey(tier, type.id));
      const exists =
        catalog.size > 0
          ? entry !== undefined
          : getVoltageTierIndex(type.minTier as VoltageTier) <= getVoltageTierIndex(tier);
      if (!exists) {
        continue;
      }
      rows.push({
        key: energyHatchCatalogKey(tier, type.id),
        tier,
        familyId: type.id,
        label: hatchRowLabel(tier, type.id),
        fullName: entry?.displayName ?? `${tier} ${type.label}`,
        euT: hatchEuT(tier, type.id),
        entry,
      });
    }
  }
  return rows;
}
