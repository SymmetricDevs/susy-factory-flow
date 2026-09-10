"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { FactoryNode, Recipe } from "@/lib/model/types";
import { GT_VOLTAGE_TIERS, getVoltageTierMaxEuT } from "@/lib/model/tiers";
import { formatCompact } from "@/lib/model";
import { getNodePowerReport } from "@/lib/solver/power-report";
import { describePowerWorking } from "@/lib/solver/power-working";
import { getOverclockedRecipeStats } from "@/lib/solver/overclock";
import { stepWholeAmp } from "@/lib/solver/hatch-input";
import { powerNodeAtBudget } from "@/lib/solver/power-wins";
import { MinecraftTooltip } from "@/components/nei/MinecraftTooltip";
import { getMachineStructuralParallels } from "@/lib/solver/machine-effects";
import { applyMachineHandlerToRecipe } from "@/lib/model/recipe-rules";
import { GT_TIER_COLORS } from "./tier-colors";

type Tier = NonNullable<FactoryNode["hatchVoltageTier"]>;
const chip =
  "nodrag nowheel flex h-6 min-w-0 items-center justify-center border-2 px-1 pb-[3px] pt-0 text-center text-[11px] font-bold leading-none shadow-[inset_2px_2px_0_rgba(255,255,255,0.55),inset_-2px_-2px_0_rgba(0,0,0,0.45)] hover:brightness-110";
const number = (n: number) =>
  n.toLocaleString(
    "en-US",
    n > 0 && n < 0.01 ? { maximumSignificantDigits: 2 } : { maximumFractionDigits: 2 },
  );

function TierBadge({ tier }: { tier: Tier }) {
  const color = GT_TIER_COLORS[tier];
  return (
    <span
      className="inline-flex items-center justify-center border px-1 font-semibold leading-4"
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
  );
}
const track =
  "relative mt-1 h-3 border border-[var(--mc-15)] bg-[var(--mc-33)] p-px shadow-[inset_1px_1px_0_var(--mc-15),inset_-1px_-1px_0_var(--mc-85)]";
function Comparison({ label, current, next }: { label: string; current: number; next: number }) {
  return (
    <div className="flex h-8 items-center justify-between gap-x-2 border border-line bg-[var(--mc-33)] px-2 py-1.5">
      <span className="text-fg-muted">{label}</span>
      <span className="flex items-center gap-2 font-semibold tabular-nums text-fg">
        <span>{number(current)}</span>
        <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" strokeWidth={3} />
        <span>{number(next)}</span>
      </span>
    </div>
  );
}

function PowerReadout({ recipe, node }: { recipe: Recipe; node: FactoryNode }) {
  const report = getNodePowerReport(recipe, node);
  const working = useMemo(
    () => describePowerWorking(recipe, node, report.poolEuT),
    [recipe, node, report.poolEuT],
  );
  const stats = getOverclockedRecipeStats(recipe, node);
  const voltage = getVoltageTierMaxEuT(report.tier);
  const previous = working.previousWin;
  const next = working.nextWin;
  const nextNode = next ? powerNodeAtBudget(node, next.euT) : undefined;
  const nextReport = nextNode ? getNodePowerReport(recipe, nextNode) : undefined;
  const nextStats = nextNode ? getOverclockedRecipeStats(recipe, nextNode) : undefined;
  // Round thresholds upward so typing the displayed amount actually reaches them.
  const nextAmps = next ? Math.ceil((next.euT / voltage) * 100) / 100 : 0;
  const extraAmps = next ? Math.ceil(((next.euT - report.poolEuT) / voltage) * 100) / 100 : 0;
  const ampsPerHatch = report.amps === 1 ? 1 : 2;
  const equivalent = report.amps / ampsPerHatch;
  const duration = stats.durationTicks / 20;
  const floorEuT = previous?.euT ?? 0;
  const progress =
    next && next.euT > floorEuT
      ? Math.max(0, Math.min(1, (report.poolEuT - floorEuT) / (next.euT - floorEuT)))
      : 1;
  const keepAmps = Math.ceil((floorEuT / voltage) * 100) / 100;
  const raw = node.powerInputMode === "eut";
  const capacity = getMachineStructuralParallels(applyMachineHandlerToRecipe(recipe, node), node);
  const running = report.state === "ok" ? report.parallels : 0;
  const nextRunning = nextReport?.state === "ok" ? nextReport.parallels : running;
  const suppliedText = raw ? `${formatCompact(report.poolEuT)} EU/t` : `${number(report.amps)}A`;
  const floorText = raw ? `${formatCompact(floorEuT)} EU/t` : `${number(keepAmps)}A`;
  const nextText = raw ? `${formatCompact(next?.euT ?? 0)} EU/t` : `${number(nextAmps)}A`;
  return (
    <div
      className="flex h-[310px] w-[480px] max-w-full flex-col text-[13px] leading-[18px] text-fg-subtle"
      data-power-readout
    >
      <div className="flex h-5 shrink-0 items-center justify-between text-[15px] font-semibold leading-5 text-fg">
        <span>Power input</span>
        {raw ? (
          <span className="text-[13px] font-normal text-fg-muted">Suitable voltage assumed</span>
        ) : null}
      </div>
      <div className="mt-1 flex h-6 shrink-0 items-center justify-between gap-3 whitespace-nowrap">
        <div className="flex min-w-0 items-center gap-1 font-medium tabular-nums text-fg">
          <span>{number(report.amps)}A ×</span>
          <TierBadge tier={report.tier} />
          <span className="truncate">= {number(report.poolEuT)} EU/t</span>
        </div>
        <span
          className="flex shrink-0 items-center justify-end gap-1 font-normal text-fg-subtle"
          data-hatch-equivalent
        >
          {equivalent.toLocaleString("en-US", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}{" "}
          <TierBadge tier={report.tier} /> hatches
          <span className="ml-1 text-fg-muted">({ampsPerHatch}A per hatch)</span>
        </span>
      </div>
      <div className="my-2 grid h-[84px] shrink-0 grid-cols-2 gap-x-6 gap-y-1 border-y border-line py-2">
        {[
          ["Parallels", `${running} / ${capacity}`],
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
            className="flex min-w-0 items-baseline justify-between gap-x-2 whitespace-nowrap"
          >
            <span className="text-fg-muted">{label}</span>
            <span className="truncate font-medium tabular-nums text-fg">{value}</span>
          </div>
        ))}
      </div>
      <section className="min-h-0 flex-1">
        <div className="flex h-5 items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-fg">
            {next ? "Next improvement" : "No further improvement"}
          </h3>
          <span className="flex items-center gap-1 font-medium text-fg">
            {next ? (
              <>
                {raw
                  ? `+${formatCompact(next.euT - report.poolEuT)} EU/t`
                  : `+${number(extraAmps)}A`}
                {!raw ? <TierBadge tier={report.tier} /> : null}
              </>
            ) : null}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Comparison
            label="Overclocks"
            current={report.state === "ok" ? report.overclockSteps : 0}
            next={nextReport?.overclockSteps ?? report.overclockSteps}
          />
          <Comparison label="Parallels" current={running} next={nextRunning} />
        </div>
        <p className="mt-2 h-[18px]">
          {nextReport && nextStats ? (
            <>
              {report.state !== "ok" ? "Machine starts at" : "Output rises to"}{" "}
              <strong className="font-medium text-fg">
                {number((nextReport.parallels * 20) / nextStats.durationTicks)} runs/s
              </strong>
              .
            </>
          ) : (
            "More supply cannot increase this setup’s output."
          )}
        </p>
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-end gap-2 tabular-nums">
          <span className="text-fg-muted">{floorText}</span>
          <span className="text-center font-medium text-fg">{suppliedText} supplied</span>
          <span className="text-right text-fg-muted">{next ? nextText : "Maximum"}</span>
        </div>
        <div
          role="progressbar"
          aria-label="Supply between output thresholds"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-valuetext={`${suppliedText} supplied; ${next ? `next improvement at ${nextText}` : "no further improvement"}`}
          className={track}
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
        <div className="mt-1 flex justify-between gap-2 text-fg-muted">
          <span>
            {report.state === "ok"
              ? `${formatCompact(floorEuT)} EU/t for this speed`
              : "Not running yet"}
          </span>
          <span>{next ? `${formatCompact(next.euT)} EU/t for next step` : "Maximum output"}</span>
        </div>
      </section>
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
    const next = raw ? Math.max(0, amount + direction) : stepWholeAmp(amount, direction as -1 | 1);
    change(tier, raw ? next / getVoltageTierMaxEuT(tier) : next);
  };
  return (
    <MinecraftTooltip
      placement="above-card"
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
