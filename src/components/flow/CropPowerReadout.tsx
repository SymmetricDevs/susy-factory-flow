"use client";

import type { FactoryNode, Recipe } from "@/lib/model/types";
import { formatCompact } from "@/lib/model";
import {
  CROP_HARVESTER_INDUSTRIAL_FARM_ID,
  cropsNhFarmEut,
  cropsNhHarvesterFromTiers,
  cropsNhHarvesterMachineCount,
  cropsNhManagerEuPerHarvest,
  getCropsNhStats,
} from "@/lib/model/passive-production";
import { GT_VOLTAGE_TIERS, getVoltageTierMaxEuT } from "@/lib/model/tiers";
import { MinecraftTooltip } from "@/components/nei/MinecraftTooltip";
import { TierBadge } from "./HatchPowerControls";

/** Crops have their own power model: supply does not buy recipe parallels. */
export function CropPowerReadout({
  recipe,
  node,
  seeds,
  cardEuT,
  utilization,
  mode,
}: {
  recipe: Recipe;
  node: FactoryNode;
  seeds: number;
  cardEuT: number;
  utilization?: number;
  mode: "build" | "solve" | "pool";
}) {
  const stats = getCropsNhStats(recipe);
  const setup = cropsNhHarvesterFromTiers(
    node.machineConfigTiers,
    node.machineHandlerId,
    stats?.minSeedBedTier,
    stats?.subSoil !== undefined,
  );
  const farm = setup.id === CROP_HARVESTER_INDUSTRIAL_FARM_ID;
  const tier = GT_VOLTAGE_TIERS[setup.tierIndex]?.tier ?? "MV";
  const perFarm = cropsNhFarmEut(setup);
  const machines = cropsNhHarvesterMachineCount(setup, Math.max(0, Math.round(seeds)));
  const draw = node.enabled
    ? cardEuT * (mode === "build" ? Math.max(0, Math.min(1, utilization ?? 0)) : 1)
    : 0;
  return (
    <MinecraftTooltip
      placement="above-card"
      content={() => (
        <div
          className="w-[440px] max-w-full text-[13px] leading-[18px] text-fg"
          data-crop-power-readout
        >
          <div className="mb-2 text-[15px] font-semibold">
            {farm ? "Industrial Farm" : "Crop Manager"} · Power requirement
          </div>
          {farm ? (
            <>
              <div className="flex items-center gap-1 font-medium">
                {(perFarm / getVoltageTierMaxEuT(tier)).toLocaleString("en-US", {
                  maximumFractionDigits: 2,
                })}
                A
                <TierBadge tier={tier} /> = {formatCompact(perFarm)} EU/t per farm
              </div>
              <p className="mt-2 text-fg-muted">
                Seed bed and upgrades set the draw. Extra supply does not increase growth.
              </p>
              <div className="my-2 grid grid-cols-2 gap-x-6 border-y border-line py-2">
                <span className="text-fg-muted">Farms required</span>
                <span className="text-right">{machines}</span>
                <span className="text-fg-muted">Full draw · all farms</span>
                <span className="text-right">{formatCompact(cardEuT)} EU/t</span>
                <span className="text-fg-muted">Overclock upgrades</span>
                <span className="text-right">{setup.overclocks}</span>
              </div>
              <p className="text-fg-muted">
                Each operating farm draws full power, even with unused seed spaces.
              </p>
            </>
          ) : (
            <>
              <div>{formatCompact(cropsNhManagerEuPerHarvest(setup))} EU per crop harvested</div>
              <p className="my-2 text-fg-muted">
                Consumption follows harvest frequency. Voltage does not accelerate crop growth.
              </p>
            </>
          )}
          <div className="mt-2 flex justify-between gap-2 border-t border-line pt-2">
            <span className="text-fg-muted">
              {mode === "build" ? "Average for this card" : "Demand for calculated production"}
            </span>
            <strong>{formatCompact(draw)} EU/t</strong>
          </div>
        </div>
      )}
    >
      <div
        className="flex h-6 items-center gap-1 border border-line bg-[var(--mc-71)] px-1 text-[11px] text-[var(--mc-ink)]"
        aria-label="Crop power requirement"
      >
        {formatCompact(farm ? perFarm : cardEuT)} EU/t
      </div>
    </MinecraftTooltip>
  );
}
