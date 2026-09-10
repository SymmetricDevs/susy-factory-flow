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
import { RecipeTooltip } from "./RecipeTooltip";
import { GT_TIER_COLORS } from "./tier-colors";

type Tier = NonNullable<FactoryNode["hatchVoltageTier"]>;
const chip =
  "nodrag nowheel flex h-6 min-w-0 items-center justify-center border-2 px-1 pb-[3px] pt-0 text-center text-[11px] font-bold leading-none shadow-[inset_2px_2px_0_rgba(255,255,255,0.55),inset_-2px_-2px_0_rgba(0,0,0,0.45)] hover:brightness-110";
const number = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });

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
  return (
    <RecipeTooltip
      view={{
        title: "Power input",
        subtitle: `${number(report.amps)}A × ${report.tier} = ${number(report.poolEuT)} EU/t`,
        rows: [
          ...(node.powerInputMode === "eut"
            ? [{ label: "Hatch voltage", value: `${report.tier} (remembered)` }]
            : []),
          ...(hatchEquivalent(report.amps, report.tier)
            ? [
                {
                  label: "Hatches",
                  value: hatchEquivalent(report.amps, report.tier)!.replace(/^= /, ""),
                },
              ]
            : []),
          { label: "Parallels", value: String(report.parallels) },
          {
            label: "Overclocks",
            value:
              working.rows.find((row) => row.id === "overclocks")?.supplied ??
              String(report.overclockSteps),
          },
          { label: "Duration", value: `${number(stats.durationTicks / 20)}s / run` },
          {
            label: "Energy",
            value: `${formatCompact(Math.abs(stats.eut) * stats.durationTicks)} EU / run`,
          },
          {
            label: "Output",
            value: `${report.state === "ok" ? number((report.parallels * 20) / stats.durationTicks) : "0"} runs/s`,
          },
          {
            label: "Next",
            value: working.nextWin
              ? `+${number((working.nextWin.euT - report.poolEuT) / voltage)}A · +${formatCompact(working.nextWin.euT - report.poolEuT)} EU/t: ${working.nextWin.gain}`
              : "No further gain at this voltage",
          },
          {
            label: "Save",
            value:
              spare > 1e-9
                ? `${number(spare / voltage)}A · ${formatCompact(spare)} EU/t with no output loss`
                : "No spare supply",
          },
        ],
        reason: working.stall ?? working.hint,
        actions: [
          { gesture: "left", label: "Unit up · edit amount" },
          { gesture: "right", label: "Decrease" },
          { gesture: "wheel", label: "Adjust" },
        ],
      }}
    />
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
    <MinecraftTooltip content={() => <PowerReadout recipe={recipe} node={node} />}>
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
