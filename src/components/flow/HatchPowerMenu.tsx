"use client";
import { useMemo, useState } from "react";
import { applyMachineHandlerToRecipe } from "@/lib/model/recipe-rules";
import { GT_VOLTAGE_TIERS, getVoltageTierIndex, getVoltageTierMaxEuT } from "@/lib/model/tiers";
import type { FactoryNode, Recipe } from "@/lib/model/types";
import { describePowerWorking } from "@/lib/solver/power-working";
import { getNodePowerReport, describePowerStall } from "@/lib/solver/power-report";
import { hasAmperageOverclock, maxInputTierSkips } from "@/lib/solver/power-input-rules";
import { hatchEquivalent, roundHatchBudget } from "@/lib/solver/hatch-input";
import { getOverclockedRecipeStats } from "@/lib/solver/overclock";
import { powerNodeAtBudget } from "@/lib/solver/power-wins";
import { formatCompact } from "@/lib/model";
import { MenuShell, NumberWell, EnergyHatchArt, listHatchRows } from "./EnergyHatchMenu";
import type { EnergyHatchCatalog } from "./use-energy-hatch-catalog";
import { STANDARD_ENERGY_HATCH_ID } from "@/lib/machines/energy-hatches";

type Tier = NonNullable<FactoryNode["hatchVoltageTier"]>;
const button =
  "border border-[var(--mc-47)] bg-[var(--mc-85)] p-1.5 hover:bg-[var(--mc-100)] disabled:opacity-40";
const heading = "text-[10px] font-bold uppercase tracking-widest text-[var(--mc-ink-muted)]";
const number = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });

function hatchBuild(row: ReturnType<typeof listHatchRows>[number], budget: number) {
  const voltage = getVoltageTierMaxEuT(row.tier);
  const regular = row.familyId === STANDARD_ENERGY_HATCH_ID;
  const neededAmps = budget / voltage;
  const count = regular ? (neededAmps <= 1 ? 1 : Math.max(2, Math.ceil(neededAmps / 2))) : 1;
  const amps = regular ? (count === 1 ? 1 : count * 2) : row.euT / voltage;
  return { voltage, count, amps, euT: amps * voltage };
}

export function HatchPowerMenu({
  anchor,
  recipe,
  node,
  catalog,
  onChange,
  onClose,
}: {
  anchor: { x: number; top: number; bottom: number };
  recipe: Recipe;
  node: FactoryNode;
  catalog: EnergyHatchCatalog;
  onChange: (tier: Tier, amps: number) => void;
  onClose: () => void;
}) {
  const [options, setOptions] = useState(false);
  const [rounding, setRounding] = useState<string>();
  const [query, setQuery] = useState("");
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
  const rows = useMemo(
    () =>
      listHatchRows(catalog).sort((a, b) => {
        const here = getVoltageTierIndex(tier);
        const ai = getVoltageTierIndex(a.tier),
          bi = getVoltageTierIndex(b.tier);
        return (
          Number(hatchBuild(b, budget).euT === budget) -
            Number(hatchBuild(a, budget).euT === budget) ||
          Math.abs(ai - here) - Math.abs(bi - here) ||
          bi - ai
        );
      }),
    [catalog, tier, budget],
  );
  const equivalent = hatchEquivalent(amps, tier);
  return (
    <MenuShell anchor={anchor} width={360} maxHeight={520} onClose={onClose}>
      <div
        className="recipe-search-scroll min-h-0 overflow-y-auto p-1 text-[12px] text-[var(--mc-ink)]"
        role="dialog"
        aria-label={options ? "Hatch options" : "Power"}
      >
        {options ? (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className={heading}>Hatch options · {number(budget)} EU/t</span>
              <button className={button} onClick={() => setOptions(false)}>
                Back
              </button>
            </div>
            <p className="mb-2 text-[var(--mc-ink-muted)]">
              Mixing hatch tiers lowers your ceiling.
            </p>
            <input
              aria-label="Find a hatch"
              placeholder="Find a hatch"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mb-2 w-full border border-[var(--mc-47)] bg-[var(--mc-93)] p-1.5"
            />
            <div className="space-y-1">
              {rows
                .filter((row) => row.fullName.toLowerCase().includes(query.toLowerCase()))
                .map((row) => {
                  const { voltage, count, amps: rowAmps, euT: rowBudget } = hatchBuild(row, budget);
                  if (rowBudget < budget) return null;
                  const verdict = getNodePowerReport(recipe, {
                    ...node,
                    hatchVoltageTier: row.tier,
                    hatchAmps: rowAmps,
                    powerEuT: rowBudget,
                  });
                  return (
                    <button
                      key={row.key}
                      className={`${button} flex w-full items-center gap-2 text-left`}
                      onClick={() => set(row.tier, rowAmps)}
                      aria-label={`Use ${number(count)} ${row.fullName}`}
                    >
                      <EnergyHatchArt entry={row.entry} boxClass="h-7 w-7" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">
                          {number(count)} × {row.label} · {number(rowAmps)}A {row.tier}
                        </span>
                        {rowBudget !== budget ? (
                          <span className="block text-[var(--mc-ink-muted)]">
                            {number(rowBudget)} EU/t (+{number(rowBudget - budget)})
                          </span>
                        ) : null}
                        <span
                          className={
                            verdict.state === "ok" ? "text-[var(--mc-ink-muted)]" : "text-red-300"
                          }
                        >
                          {verdict.state === "ok"
                            ? "ok"
                            : `Refused: ${
                                verdict.state === "over-tier" &&
                                Number.isFinite(maxInputTierSkips(effective.machineType)) &&
                                Math.abs(effective.eut) >
                                  voltage * 4 ** maxInputTierSkips(effective.machineType)
                                  ? `${row.tier} hatches cap at ${number(voltage * 4 ** maxInputTierSkips(effective.machineType))} EU/t`
                                  : describePowerStall(verdict)
                              }`}
                        </span>
                      </span>
                    </button>
                  );
                })}
            </div>
          </>
        ) : (
          <>
            <div className={heading}>Power</div>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                aria-label="Decrease amps"
                className={button}
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
                className="h-8 w-20 text-right text-[15px]"
              />
              <span>A</span>
              <button
                aria-label="Increase amps"
                className={button}
                onClick={() => set(tier, amps + 1)}
              >
                +
              </button>
              <span className="mx-1">of</span>
              <select
                aria-label="Hatch voltage tier"
                value={tier}
                onChange={(e) => set(e.target.value as Tier, amps)}
                className="min-w-0 flex-1 border border-[var(--mc-47)] bg-[var(--mc-93)] p-1.5 font-bold"
              >
                {GT_VOLTAGE_TIERS.map((t) => (
                  <option key={t.tier}>{t.tier}</option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
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
                className="h-7 w-36 text-right"
              />
              <span>EU/t</span>
            </div>
            {equivalent ? <p className="mt-1 text-[var(--mc-ink-muted)]">{equivalent}</p> : null}
            {rounding ? (
              <p role="status" className="mt-1">
                {rounding}
              </p>
            ) : null}
            <section className="mt-3 border-t border-[var(--mc-47)] pt-2">
              <div className={heading}>What it does</div>
              <p className="mt-1">
                {report.parallels} {report.parallels === 1 ? "parallel" : "parallels"},{" "}
                {report.overclockSteps === 0
                  ? "no"
                  : working.rows.find((r) => r.id === "overclocks")?.supplied}{" "}
                overclocks
              </p>
              <p>
                {stats.durationTicks < 0.002
                  ? `${formatCompact(stats.durationTicks * 50)}ms`
                  : `${number(stats.durationTicks / 20)}s`}{" "}
                per run, {formatCompact(Math.abs(stats.eut) * stats.durationTicks)} EU per run
              </p>
              <p>
                {report.state === "ok"
                  ? number((report.parallels * 20) / stats.durationTicks)
                  : "0"}{" "}
                runs/s
              </p>
            </section>
            <section className="mt-3 border-t border-[var(--mc-47)] pt-2">
              <div className={heading}>Steps</div>
              {next ? (
                <button
                  className="mt-1 block w-full p-1 text-left hover:bg-[var(--mc-93)]"
                  onClick={() => set(tier, next.euT / voltage)}
                >
                  ↑ {number(next.euT / voltage)}A {gainText}{" "}
                  <span className="text-[var(--mc-ink-muted)]">({cost})</span>
                </button>
              ) : (
                <p className="mt-1 text-[var(--mc-ink-muted)]">
                  No further output gain at this hatch tier.
                </p>
              )}
              {spare > 1e-9 && previous ? (
                <button
                  className="block w-full p-1 text-left hover:bg-[var(--mc-93)]"
                  onClick={() => set(tier, previous.euT / voltage)}
                >
                  ↓ {number(previous.euT / voltage)}A loses nothing{" "}
                  <span className="text-[var(--mc-ink-muted)]">({number(spare)}A is spare)</span>
                </button>
              ) : null}
            </section>
            {!hasAmperageOverclock(effective.machineType) ? (
              <p className="mt-2">Extra amps buy parallels here, not overclocks.</p>
            ) : null}
            {working.stall ? (
              <p className="mt-2 text-red-300" role="status">
                {working.stall}
              </p>
            ) : null}
            <button className={`${button} mt-3 w-full font-bold`} onClick={() => setOptions(true)}>
              Hatch options
            </button>
          </>
        )}
      </div>
    </MenuShell>
  );
}
