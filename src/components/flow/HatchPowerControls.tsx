"use client";

import { useMemo, useState } from "react";
import type { FactoryNode, Recipe } from "@/lib/model/types";
import { GT_VOLTAGE_TIERS, getVoltageTierMaxEuT } from "@/lib/model/tiers";
import { formatCompact } from "@/lib/model";
import { getNodePowerReport } from "@/lib/solver/power-report";
import { describePowerWorking } from "@/lib/solver/power-working";
import { getOverclockedRecipeStats } from "@/lib/solver/overclock";
import { hatchEquivalent } from "@/lib/solver/hatch-input";
import { powerNodeAtBudget } from "@/lib/solver/power-wins";
import { MinecraftTooltip } from "@/components/nei/MinecraftTooltip";
import { GT_TIER_COLORS } from "./tier-colors";

type Tier = NonNullable<FactoryNode["hatchVoltageTier"]>;
const chip =
  "nodrag nowheel flex h-6 min-w-0 items-center justify-center border-2 px-1 pb-[3px] pt-0 text-center text-[11px] font-bold leading-none shadow-[inset_2px_2px_0_rgba(255,255,255,0.55),inset_-2px_-2px_0_rgba(0,0,0,0.45)] hover:brightness-110";
const number = (n: number) =>
  n.toLocaleString(
    "en-US",
    n > 0 && n < 0.01 ? { maximumSignificantDigits: 2 } : { maximumFractionDigits: 2 },
  );

function PowerReadout({ recipe, node }: { recipe: Recipe; node: FactoryNode }) {
  const report = getNodePowerReport(recipe, node);
  const working = useMemo(
    () => describePowerWorking(recipe, node, report.poolEuT),
    [recipe, node, report.poolEuT],
  );
  const stats = getOverclockedRecipeStats(recipe, node);
  const voltage = getVoltageTierMaxEuT(report.tier);
  const previous = working.previousWin;
  const before = previous
    ? getNodePowerReport(recipe, powerNodeAtBudget(node, previous.euT))
    : undefined;
  const spare =
    previous &&
    before?.state === "ok" &&
    report.state === "ok" &&
    before.parallels === report.parallels &&
    before.overclockSteps === report.overclockSteps
      ? report.poolEuT - previous.euT
      : 0;
  const next = working.nextWin;
  const nextNode = next ? powerNodeAtBudget(node, next.euT) : undefined;
  const nextReport = nextNode ? getNodePowerReport(recipe, nextNode) : undefined;
  const nextStats = nextNode ? getOverclockedRecipeStats(recipe, nextNode) : undefined;
  // Round thresholds upward so typing the displayed amount actually reaches them.
  const nextAmps = next ? Math.ceil((next.euT / voltage) * 100) / 100 : 0;
  const extraAmps = next ? Math.ceil(((next.euT - report.poolEuT) / voltage) * 100) / 100 : 0;
  const change = nextReport
    ? [
        ...(report.state !== "ok" ? ["Starts the machine"] : []),
        ...(nextReport.parallels !== report.parallels
          ? [`${report.parallels} → ${nextReport.parallels} parallels`]
          : []),
        ...(nextReport.overclockSteps !== report.overclockSteps
          ? [`${report.overclockSteps} → ${nextReport.overclockSteps} overclocks`]
          : []),
      ].join(" · ")
    : "";
  const equivalent = hatchEquivalent(report.amps, report.tier)?.replace(/^= /, "");
  const duration = stats.durationTicks / 20;
  return (
    <div className="w-[290px] max-w-full text-[12px] leading-4" data-power-readout>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <strong>
          {number(report.amps)}A · {report.tier}
        </strong>
        <strong>
          {formatCompact(report.poolEuT)}{" "}
          <span className="font-normal text-fg-subtle">EU/t supplied</span>
        </strong>
      </div>
      {equivalent || node.powerInputMode === "eut" ? (
        <p className="mt-0.5 text-[11px] text-fg-subtle">
          {equivalent}
          {equivalent && node.powerInputMode === "eut" ? " · " : ""}
          {node.powerInputMode === "eut" ? `${report.tier} hatch voltage retained` : ""}
        </p>
      ) : null}
      <div className="my-2 grid grid-cols-2 gap-x-4 gap-y-1.5 border-y border-[var(--mc-33)] py-2">
        {[
          ["Parallels", String(report.parallels)],
          [
            "Overclocks",
            working.rows.find((row) => row.id === "overclocks")?.supplied ??
              String(report.overclockSteps),
          ],
          [
            "Time / run",
            duration < 0.01 ? `${formatCompact(duration * 1000)} ms` : `${number(duration)} s`,
          ],
          ["Runs / second", report.state === "ok" ? number(report.parallels / duration) : "0"],
          ["EU / run", formatCompact(Math.abs(stats.eut) * stats.durationTicks)],
          ["Draw · EU/t", formatCompact(report.drawEuT)],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <div className="text-[10px] text-fg-subtle">{label}</div>
            <div className="font-bold">{value}</div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <div>
          <div className="text-[10px] uppercase text-fg-subtle">Next improvement</div>
          {next ? (
            <>
              <div>
                <strong className="text-cyan-200">
                  +{number(extraAmps)}A {report.tier}
                </strong>
                <span className="text-fg-subtle"> · {number(nextAmps)}A total</span>
              </div>
              <div>
                {change || next.gain}
                {nextReport && nextStats
                  ? ` · ${number((nextReport.parallels * 20) / nextStats.durationTicks)} runs/s`
                  : ""}
              </div>
            </>
          ) : (
            <div>No further gain at this voltage.</div>
          )}
        </div>
        {spare > 1e-9 && previous ? (
          <div>
            <div className="text-[10px] uppercase text-fg-subtle">Same output with less</div>
            <div>
              <strong>
                {spare / voltage < 0.01
                  ? "<0.01"
                  : number(Math.floor((spare / voltage) * 100) / 100)}
                A {report.tier} spare
              </strong>
              <span className="text-fg-subtle">
                {" "}
                · keep {number(Math.ceil((previous.euT / voltage) * 100) / 100)}A
              </span>
            </div>
          </div>
        ) : null}
        {working.stall ? <p className="text-red-300">{working.stall}</p> : null}
      </div>
    </div>
  );
}

export function HatchPowerControls({
  recipe,
  node,
  onChange,
  locked,
}: {
  recipe: Recipe;
  node: FactoryNode;
  onChange: (tier: Tier, amps: number, mode: "amps" | "eut") => void;
  locked: () => boolean;
}) {
  const { tier, amps, poolEuT } = getNodePowerReport(recipe, node);
  const raw = node.powerInputMode === "eut";
  const [draft, setDraft] = useState<string>();
  const color = GT_TIER_COLORS[tier];
  const style = raw
    ? { backgroundColor: "var(--mc-85)", borderColor: "var(--mc-33)", color: "var(--mc-ink)" }
    : {
        backgroundColor: color.background,
        borderColor: color.border,
        color: color.text,
        textShadow: `1px 1px 0 ${color.shadow}`,
      };
  const change = (
    nextTier: Tier,
    nextAmps: number,
    mode: "amps" | "eut" = raw ? "eut" : "amps",
  ) => {
    if (
      locked() ||
      !Number.isFinite(nextAmps) ||
      nextAmps < 0 ||
      !Number.isFinite(nextAmps * getVoltageTierMaxEuT(nextTier))
    )
      return;
    onChange(nextTier, nextAmps, mode);
  };
  const stepUnit = (direction: number) => {
    if (raw) {
      // Return to the remembered voltage without changing the supply.
      if (direction > 0) change(tier, amps, "amps");
      return;
    }
    const index = GT_VOLTAGE_TIERS.findIndex((t) => t.tier === tier);
    if (index === 0 && direction < 0) {
      change(tier, amps, "eut");
      return;
    }
    change(
      GT_VOLTAGE_TIERS[Math.max(0, Math.min(GT_VOLTAGE_TIERS.length - 1, index + direction))].tier,
      amps,
      "amps",
    );
  };
  const amount = raw ? poolEuT : amps;
  const label = raw ? "Supply EU/t" : "Hatch amps";
  const commit = () => {
    if (draft !== undefined && draft.trim()) {
      const value = Number(draft.trim().replace(/,/g, ""));
      change(tier, raw ? value / getVoltageTierMaxEuT(tier) : value);
    }
    setDraft(undefined);
  };
  const stepAmount = (direction: number) => {
    const next = Math.max(0, amount + direction);
    change(tier, raw ? next / getVoltageTierMaxEuT(tier) : next);
  };
  return (
    <MinecraftTooltip
      placement="below"
      content={() => <PowerReadout recipe={recipe} node={node} />}
    >
      <div
        className="flex"
        data-power-controls
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {draft !== undefined ? (
          <input
            autoFocus
            aria-label={label}
            inputMode="decimal"
            value={draft}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                e.preventDefault();
                setDraft(undefined);
              }
            }}
            className={`${chip} w-[64px] outline-none`}
            style={style}
          />
        ) : (
          <button
            aria-label={label}
            className={`${chip} w-[64px]`}
            style={style}
            onClick={() => {
              if (!locked()) setDraft(String(amount));
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              stepAmount(-1);
            }}
            onWheel={(e) => {
              e.stopPropagation();
              stepAmount(e.deltaY < 0 ? 1 : -1);
            }}
          >
            {formatCompact(amount)}
            {raw ? "" : "A"}
          </button>
        )}
        <button
          aria-label="Power input unit"
          className={`${chip} w-[50px]`}
          style={{ ...style, textDecoration: !raw && color.underline ? "underline" : undefined }}
          onClick={() => stepUnit(1)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            stepUnit(-1);
          }}
          onWheel={(e) => {
            e.stopPropagation();
            stepUnit(e.deltaY < 0 ? 1 : -1);
          }}
        >
          {raw ? "EU/t" : tier}
        </button>
      </div>
    </MinecraftTooltip>
  );
}
