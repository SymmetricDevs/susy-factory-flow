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
  const floorEuT = previous?.euT ?? 0;
  const progress =
    next && next.euT > floorEuT
      ? Math.max(0, Math.min(1, (report.poolEuT - floorEuT) / (next.euT - floorEuT)))
      : 1;
  const keepAmps = Math.ceil((floorEuT / voltage) * 100) / 100;
  return (
    <div className="w-[380px] max-w-full text-sm leading-5 text-fg-subtle" data-power-readout>
      <div className="text-base font-semibold leading-6 text-fg">Power input</div>
      <div className="mt-1 text-base font-medium leading-6 tabular-nums text-fg">
        {number(report.amps)}A × {report.tier} = {number(report.poolEuT)} EU/t
      </div>
      {equivalent || node.powerInputMode === "eut" ? (
        <p className="text-fg-muted">
          {equivalent}
          {equivalent && node.powerInputMode === "eut" ? " · " : ""}
          {node.powerInputMode === "eut" ? `${report.tier} hatch voltage retained` : ""}
        </p>
      ) : null}
      <div className="my-3 grid grid-cols-2 gap-x-6 gap-y-2 border-y border-line py-3">
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
          <div
            key={label}
            className="min-w-0 flex flex-wrap items-baseline justify-between gap-x-2"
          >
            <span className="text-fg-muted">{label}</span>
            <span className="font-medium tabular-nums text-fg">{value}</span>
          </div>
        ))}
      </div>
      {next ? (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="text-base font-semibold text-fg">Next improvement</h3>
            <span className="font-medium tabular-nums text-fg">
              +{number(extraAmps)}A {report.tier}
            </span>
          </div>
          <p className="mt-1">
            At{" "}
            <strong className="font-medium text-fg">
              {number(nextAmps)}A {report.tier}
            </strong>
            : {change || next.gain}.
          </p>
          {nextReport && nextStats ? (
            <p>
              Output rises to{" "}
              <strong className="font-medium text-fg">
                {number((nextReport.parallels * 20) / nextStats.durationTicks)} runs/s
              </strong>
              .
            </p>
          ) : null}
          <div className="mt-3 flex justify-between gap-3 text-fg-muted">
            <span>{number(keepAmps)}A</span>
            <span>{number(nextAmps)}A</span>
          </div>
          <div
            role="progressbar"
            aria-label="Supply between output thresholds"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-valuetext={`${number(report.amps)}A supplied; next improvement at ${number(nextAmps)}A`}
            className="relative mt-1 h-3 border border-[var(--mc-15)] bg-[var(--mc-33)] p-px shadow-[inset_1px_1px_0_var(--mc-15),inset_-1px_-1px_0_var(--mc-85)]"
          >
            <div
              className="h-full bg-[var(--mc-ink-muted)] shadow-[inset_0_1px_0_var(--mc-100)]"
              style={{ width: `${progress * 100}%` }}
            />
            <span
              className="absolute inset-y-0 w-0.5 bg-[var(--mc-ink)]"
              style={{ left: `clamp(1px, ${progress * 100}%, calc(100% - 3px))` }}
            />
          </div>
          <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-fg-muted">
            <span>Current output threshold</span>
            <span>Next improvement</span>
          </div>
          <p className="mt-1 text-fg">{number(report.amps)}A supplied now</p>
        </section>
      ) : (
        <p className="text-fg">No further output gain at this voltage.</p>
      )}
      {spare > 1e-9 && previous ? (
        <section className="mt-3 border-t border-line pt-3">
          <h3 className="text-base font-semibold text-fg">Same output with less</h3>
          <p className="mt-1">
            Keep{" "}
            <strong className="font-medium text-fg">
              {number(keepAmps)}A {report.tier}
            </strong>{" "}
            for the current output.
          </p>
          <p>
            You can remove{" "}
            <strong className="font-medium text-fg">
              {spare / voltage < 0.01 ? "<0.01" : number(Math.floor((spare / voltage) * 100) / 100)}
              A
            </strong>{" "}
            ({formatCompact(spare)} EU/t) without losing speed.
          </p>
        </section>
      ) : null}
      {working.stall ? <p className="mt-3 text-amber-300">{working.stall}</p> : null}
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
      placement="above"
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
