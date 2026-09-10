"use client";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, X, Zap } from "lucide-react";
import {
  SETTING_TILE_CLASS,
  SETTING_TILE_CAPTION_CLASS,
  SETTING_TILE_BUTTON_CLASS,
} from "./SettingTile";
import { GT_TIER_COLORS } from "./tier-colors";
import { applyMachineHandlerToRecipe } from "@/lib/model/recipe-rules";
import { GT_VOLTAGE_TIERS, getVoltageTierMaxEuT } from "@/lib/model/tiers";
import type { FactoryNode, Recipe } from "@/lib/model/types";
import { describePowerWorking } from "@/lib/solver/power-working";
import { getNodePowerReport } from "@/lib/solver/power-report";
import { hasAmperageOverclock } from "@/lib/solver/power-input-rules";
import { hatchEquivalent, roundHatchBudget } from "@/lib/solver/hatch-input";
import { getOverclockedRecipeStats } from "@/lib/solver/overclock";
import { powerNodeAtBudget } from "@/lib/solver/power-wins";
import { formatCompact } from "@/lib/model";
import { MenuShell, NumberWell } from "./EnergyHatchMenu";

type Tier = NonNullable<FactoryNode["hatchVoltageTier"]>;
const button =
  "flex items-center justify-center gap-1 border border-[var(--mc-33)] bg-[var(--mc-82)] text-[var(--mc-ink)] shadow-[inset_1px_1px_0_var(--mc-100),inset_-1px_-1px_0_var(--mc-47)] hover:bg-[var(--mc-100)] active:shadow-[inset_1px_1px_0_var(--mc-47)]";
const heading = "text-[10px] uppercase leading-4 text-[var(--mc-ink-muted)]";
const menuRow =
  "flex w-full items-center gap-2 px-1.5 py-1.5 text-left hover:bg-[var(--mc-93)] focus-visible:outline focus-visible:outline-cyan-300";
function TierBadge({ tier }: { tier: Tier }) {
  const color = GT_TIER_COLORS[tier];
  return (
    <span
      className="inline-flex min-w-7 justify-center border px-1 text-[11px] font-bold leading-4"
      style={{
        background: color.background,
        borderColor: color.border,
        color: color.text,
        textDecoration: color.underline ? "underline" : undefined,
      }}
    >
      {tier}
    </span>
  );
}
const number = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });

export function HatchPowerMenu({
  anchor,
  recipe,
  node,
  onChange,
  onClose,
}: {
  anchor: { x: number; top: number; bottom: number };
  recipe: Recipe;
  node: FactoryNode;
  onChange: (tier: Tier, amps: number) => void;
  onClose: () => void;
}) {
  const [tiers, setTiers] = useState(false);
  const [rounding, setRounding] = useState<string>();
  const report = getNodePowerReport(recipe, node);
  const { tier, amps, poolEuT: budget } = report;
  const voltage = getVoltageTierMaxEuT(tier);
  const working = useMemo(() => describePowerWorking(recipe, node, budget), [recipe, node, budget]);
  const effective = applyMachineHandlerToRecipe(recipe, node);
  const stats = getOverclockedRecipeStats(recipe, node);
  const set = (nextTier: Tier, nextAmps: number) => {
    if (
      Number.isFinite(nextAmps) &&
      nextAmps >= 0 &&
      Number.isFinite(nextAmps * getVoltageTierMaxEuT(nextTier))
    ) {
      setRounding(undefined);
      onChange(nextTier, nextAmps);
    }
  };
  const next = working.nextWin;
  const previous = working.previousWin;
  const previousReport = previous
    ? getNodePowerReport(recipe, powerNodeAtBudget(node, previous.euT))
    : undefined;
  const spare =
    previous &&
    previousReport?.state === "ok" &&
    report.state === "ok" &&
    previousReport.parallels === report.parallels &&
    previousReport.overclockSteps === report.overclockSteps
      ? (budget - previous.euT) / voltage
      : 0;
  const nextStats = next
    ? getOverclockedRecipeStats(recipe, powerNodeAtBudget(node, next.euT))
    : undefined;
  const gain =
    next && nextStats && report.state === "ok"
      ? next.parallels / nextStats.durationTicks / (report.parallels / stats.durationTicks)
      : 0;
  const gainText =
    report.state !== "ok"
      ? "starts the machine"
      : Math.abs(gain - 2) < 0.001
        ? "doubles output"
        : `raises output by ${number((gain - 1) * 100)}%`;
  const extraAmps = next ? (next.euT - budget) / voltage : 0;
  const cost =
    extraAmps >= 2 && Number.isInteger(extraAmps / 2)
      ? `+${number(extraAmps / 2)} ${tier} hatches`
      : `+${number(extraAmps)}A`;
  const equivalent = hatchEquivalent(amps, tier);
  return (
    <MenuShell anchor={anchor} width={320} maxHeight={300} onClose={onClose}>
      <div
        className="flex h-[280px] min-h-0 flex-col text-[12px] leading-4 text-[var(--mc-ink)]"
        role="dialog"
        aria-label="Power"
      >
        <div className="mb-1.5 flex h-6 shrink-0 items-center gap-1.5 px-0.5">
          {tiers ? (
            <button
              aria-label="Back"
              className={`${button} h-5 w-5`}
              onClick={() => {
                setTiers(false);
              }}
            >
              <ArrowLeft className="h-3 w-3" />
            </button>
          ) : (
            <Zap className="h-3.5 w-3.5 text-[var(--mc-ink-muted)]" />
          )}
          <span className="flex-1 font-bold">{tiers ? "Hatch voltage" : "Power input"}</span>
          <button aria-label="Close power menu" className={`${button} h-5 w-5`} onClick={onClose}>
            <X className="h-3 w-3" />
          </button>
        </div>
        <div className="recipe-search-scroll min-h-0 flex-1 overflow-y-auto">
          {tiers ? (
            <div role="listbox" aria-label="Hatch voltage tier" className="grid grid-cols-3 gap-1">
              {GT_VOLTAGE_TIERS.map(({ tier: pick }) => (
                <button
                  key={pick}
                  role="option"
                  aria-selected={pick === tier}
                  aria-label={pick}
                  className={`${button} flex-col py-1.5 ${pick === tier ? "outline outline-cyan-300" : ""}`}
                  onClick={() => {
                    set(pick, amps);
                    setTiers(false);
                  }}
                >
                  <TierBadge tier={pick} />
                  <span className="text-[10px] text-[var(--mc-ink-muted)]">
                    {formatCompact(getVoltageTierMaxEuT(pick))} EU/t
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <>
              {rounding ? (
                <p role="status" className="px-1 pt-1 text-[11px] text-cyan-200">
                  {rounding}
                </p>
              ) : null}
              <div className="my-1.5 border border-[var(--mc-47)] bg-[var(--mc-71)] px-2 py-1.5 shadow-[inset_1px_1px_0_var(--mc-54),inset_-1px_-1px_0_var(--mc-93)]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={heading}>What it does</span>
                  <span className="font-bold tabular-nums">
                    {report.state === "ok"
                      ? number((report.parallels * 20) / stats.durationTicks)
                      : "0"}{" "}
                    <span className="text-[10px] font-normal text-[var(--mc-ink-muted)]">
                      runs/s
                    </span>
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>
                    {report.parallels} {report.parallels === 1 ? "parallel" : "parallels"}
                  </span>
                  <span>
                    {report.overclockSteps === 0
                      ? "No"
                      : working.rows.find((r) => r.id === "overclocks")?.supplied}{" "}
                    overclocks
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-[var(--mc-ink-muted)]">
                  <span>
                    {stats.durationTicks < 0.002
                      ? `${formatCompact(stats.durationTicks * 50)}ms`
                      : `${number(stats.durationTicks / 20)}s`}{" "}
                    / run
                  </span>
                  <span>{formatCompact(Math.abs(stats.eut) * stats.durationTicks)} EU / run</span>
                </div>
              </div>
              <div className="divide-y divide-[var(--mc-47)]">
                {next ? (
                  <button className={menuRow} onClick={() => set(tier, next.euT / voltage)}>
                    <ArrowUp className="h-3.5 w-3.5 shrink-0 text-cyan-200" />
                    <span className="flex-1">
                      <span className="block">
                        {number(next.euT / voltage)}A {gainText}
                      </span>
                      <span className="text-[11px] text-[var(--mc-ink-muted)]">{cost}</span>
                    </span>
                  </button>
                ) : (
                  <p className="px-1.5 py-1 text-[11px] text-[var(--mc-ink-muted)]">
                    No further output gain at this hatch tier.
                  </p>
                )}
                {spare > 1e-9 && previous ? (
                  <button className={menuRow} onClick={() => set(tier, previous.euT / voltage)}>
                    <ArrowDown className="h-3.5 w-3.5 shrink-0 text-[var(--mc-ink-muted)]" />
                    <span className="flex-1">
                      <span className="block">{number(previous.euT / voltage)}A loses nothing</span>
                      <span className="text-[11px] text-[var(--mc-ink-muted)]">
                        {number(spare)}A is spare
                      </span>
                    </span>
                  </button>
                ) : null}
              </div>
              {!hasAmperageOverclock(effective.machineType) ? (
                <p className="px-1 py-1 text-[11px] text-[var(--mc-ink-muted)]">
                  Extra amps buy parallels here, not overclocks.
                </p>
              ) : null}
              {working.stall ? (
                <p className="px-1 py-1 text-[11px] text-red-300" role="status">
                  {working.stall}
                </p>
              ) : null}
            </>
          )}
        </div>
        <div className="shrink-0 border-t border-[var(--mc-47)] pt-1">
          {
            <p className="px-1 pt-1 text-[11px] text-[var(--mc-ink-muted)]">
              {equivalent ?? "\u00a0"}
            </p>
          }
          <div className="grid grid-cols-[1fr_72px_1.15fr] gap-1">
            <div className={SETTING_TILE_CLASS}>
              <div className={SETTING_TILE_CAPTION_CLASS}>Amps</div>
              <div className="flex h-5 items-center gap-0.5">
                <button
                  aria-label="Decrease amps"
                  className={SETTING_TILE_BUTTON_CLASS}
                  disabled={amps <= 0}
                  onClick={() => set(tier, Math.max(0, amps - 1))}
                >
                  −
                </button>
                <NumberWell
                  value={amps}
                  ariaLabel="Hatch amps"
                  onCommit={(n) => set(tier, n)}
                  onStep={(d) => set(tier, Math.max(0, amps + d))}
                  className="h-5 w-0 min-w-0 flex-1 text-center text-[13px]"
                />
                <button
                  aria-label="Increase amps"
                  className={SETTING_TILE_BUTTON_CLASS}
                  onClick={() => set(tier, amps + 1)}
                >
                  +
                </button>
              </div>
            </div>
            <div className={SETTING_TILE_CLASS}>
              <div className={SETTING_TILE_CAPTION_CLASS}>Voltage</div>
              <button
                aria-label="Hatch voltage tier"
                aria-haspopup="listbox"
                className={`${button} h-5 w-full justify-between px-1 text-[13px] font-bold`}
                aria-expanded={tiers}
                onClick={() => setTiers(!tiers)}
              >
                <span>{tier}</span>
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
            <div className={SETTING_TILE_CLASS}>
              <div className={SETTING_TILE_CAPTION_CLASS}>Supply · EU/t</div>
              <NumberWell
                value={budget}
                ariaLabel="Supply EU/t"
                onCommit={(euT) => {
                  const rounded = roundHatchBudget(euT, voltage);
                  set(tier, rounded);
                  if (rounded * voltage !== euT)
                    setRounding(
                      `Rounded ${rounded * voltage > euT ? "up" : "down"} to ${number(rounded)}A (${number(rounded * voltage)} EU/t).`,
                    );
                }}
                className="h-5 w-full min-w-0 text-right text-[13px]"
              />
            </div>
          </div>
        </div>
      </div>
    </MenuShell>
  );
}
