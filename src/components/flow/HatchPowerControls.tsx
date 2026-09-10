"use client";

import { useMemo, useState } from "react";
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
    <div className="border border-line bg-[var(--mc-33)] px-2 py-1.5">
      <div className="text-fg-muted">{label}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[15px] font-semibold text-fg">
        <span>{number(current)}</span>
        <span aria-hidden className="font-normal text-fg-muted">
          →
        </span>
        <span>{number(next)}</span>
      </div>
      <div className="mt-0.5 text-fg-muted">
        {next === current ? "Unchanged" : `+${number(next - current)} at next step`}
      </div>
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
  const equivalent =
    report.amps === 1
      ? 1
      : report.amps >= 4 && Number.isInteger(report.amps / 2)
        ? report.amps / 2
        : undefined;
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
  const nextRunning = nextReport?.state === "ok" ? nextReport.parallels : 0;
  const suppliedText = raw ? `${formatCompact(report.poolEuT)} EU/t` : `${number(report.amps)}A`;
  const floorText = raw ? `${formatCompact(floorEuT)} EU/t` : `${number(keepAmps)}A`;
  const nextText = raw ? `${formatCompact(next?.euT ?? 0)} EU/t` : `${number(nextAmps)}A`;
  return (
    <div
      className="w-[400px] max-w-full text-[13px] leading-[18px] text-fg-subtle"
      data-power-readout
    >
      <div className="text-[15px] font-semibold leading-5 text-fg">Power input</div>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[15px] font-medium leading-5 tabular-nums text-fg">
        <span>{number(report.amps)}A ×</span>
        <TierBadge tier={report.tier} />
        <span>= {number(report.poolEuT)} EU/t</span>
      </div>
      {raw ? (
        <p className="mt-1 flex flex-wrap items-center gap-1 text-fg-muted">
          Assumed suitable voltage: <TierBadge tier={report.tier} />
        </p>
      ) : equivalent ? (
        <p className="mt-1 flex items-center gap-1 text-fg-muted">
          {equivalent} <TierBadge tier={report.tier} />{" "}
          {equivalent === 1 ? "hatch (1A when alone)" : "hatches"}
        </p>
      ) : null}
      <div className="my-3 grid grid-cols-2 gap-x-6 gap-y-2 border-y border-line py-3">
        {[
          ["Parallels", String(running)],
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
      {next && nextReport ? (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-fg">Next improvement</h3>
            <span className="flex items-center gap-1 font-medium text-fg">
              +{raw ? `${formatCompact(next.euT - report.poolEuT)} EU/t` : `${number(extraAmps)}A`}
              {!raw ? <TierBadge tier={report.tier} /> : null}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Comparison
              label="Overclocks"
              current={report.state === "ok" ? report.overclockSteps : 0}
              next={nextReport.overclockSteps}
            />
            <Comparison label="Parallel recipes" current={running} next={nextRunning} />
          </div>
          {nextStats ? (
            <p className="mt-2">
              {report.state !== "ok" ? "Machine starts at" : "Output rises to"}{" "}
              <strong className="font-medium text-fg">
                {number((nextReport.parallels * 20) / nextStats.durationTicks)} runs/s
              </strong>
              .
            </p>
          ) : null}
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2 tabular-nums">
            <span className="text-fg-muted">{floorText}</span>
            <span className="text-center font-medium text-fg">{suppliedText} supplied</span>
            <span className="text-right text-fg-muted">{nextText}</span>
          </div>
          <div
            role="progressbar"
            aria-label="Supply between output thresholds"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-valuetext={`${suppliedText} supplied; next improvement at ${nextText}`}
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
            <span>Current speed starts here</span>
            <span>Next improvement</span>
          </div>
        </section>
      ) : (
        <p className="text-fg">No further output gain at this voltage.</p>
      )}
      <section className="mt-3 border-t border-line pt-3">
        <div className="flex justify-between gap-2">
          <h3 className="font-semibold text-fg">Parallel capacity</h3>
          <span className="text-fg">
            {capacity > 1 ? `${running} / ${capacity} active` : "No parallel processing"}
          </span>
        </div>
        {capacity > 1 ? (
          <>
            <div className="mt-2 flex justify-between text-fg-muted">
              <span>1 recipe</span>
              <span>{capacity} maximum</span>
            </div>
            <div
              role="progressbar"
              aria-label="Powered parallel capacity"
              aria-valuemin={0}
              aria-valuemax={capacity}
              aria-valuenow={running}
              className={track}
            >
              <div
                className="h-full bg-[var(--mc-ink-muted)]"
                style={{ width: `${Math.min(1, running / capacity) * 100}%` }}
              />
            </div>
          </>
        ) : (
          <p className="mt-1 text-fg-muted">This machine runs one recipe at a time.</p>
        )}
      </section>
      {spare > 1e-9 ? (
        <section className="mt-3 border-t border-line pt-3">
          <h3 className="font-semibold text-fg">Power needed for this speed</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <div className="text-fg-muted">Needed for this speed</div>
              <strong className="text-fg">{floorText}</strong>
            </div>
            <div>
              <div className="text-fg-muted">Extra supply available</div>
              <strong className="text-fg">
                {raw ? `${formatCompact(spare)} EU/t` : `${number(spare / voltage)}A`}
              </strong>
            </div>
          </div>
          <p className="mt-2 text-fg-muted">
            {next
              ? "The extra supply has not reached the next upgrade yet."
              : "This setup is already at its maximum speed."}{" "}
            Unused supply is not consumed.
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
