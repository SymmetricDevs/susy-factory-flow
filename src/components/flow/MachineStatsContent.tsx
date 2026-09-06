"use client";

import type { FactoryNode, MachineHandler, NodeThroughputResult, Recipe } from "@/lib/model/types";
import { useFactoryStore } from "@/store/factory-store";
import { RecipeTooltip } from "./RecipeTooltip";
import { tooltipMode } from "./recipe-tooltip-data";
import { buildMachineTooltip } from "./machine-tooltip-data";
import {
  cropsNhCropsPerMachine,
  cropsNhEnvironmentFromTiers,
  cropsNhEutPerCrop,
  cropsNhExpectedDrop,
  cropsNhGrowthRate,
  cropsNhGrowthSpeedMultiplier,
  cropsNhHarvestRoundMultiplier,
  cropsNhHarvestTicks,
  cropsNhHarvesterEnvironment,
  cropsNhHarvesterFromTiers,
  cropsNhHarvesterTierName,
  cropsNhIsHandPicked,
  cropsNhManagerEuPerHarvest,
  cropsNhManagerLayers,
  cropsNhSquarePerTier,
  cropsNhNutrientScore,
  cropsNhUpgradeSlots,
  getCropsNhStats,
} from "@/lib/model/passive-production";

const BONUS_COLOR = "#4ade80";
const PENALTY_COLOR = "#f87171";

function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/**
 * Hover panel for a crop source node: the crop's card data plus the full
 * rate derivation with the node's CURRENT stats and environment plugged into
 * the real in-game formulas.
 */
function CropSourceStatsContent({
  recipe,
  handler,
  node,
}: {
  recipe: Recipe;
  handler?: Pick<MachineHandler, "id" | "label">;
  node?: Pick<FactoryNode, "machineConfigTiers" | "machineCount">;
}) {
  const stats = getCropsNhStats(recipe);
  if (!stats) {
    return null;
  }
  const meta = (recipe.metadata as { cropsNh?: Record<string, unknown> } | undefined)?.cropsNh;
  const requirements = Array.isArray(meta?.requirements)
    ? (meta?.requirements as string[]).slice(0, 3)
    : [];
  const biomeTags = Array.isArray(meta?.biomeTags) ? (meta?.biomeTags as string[]) : [];
  const cropName = recipe.name.includes(": ")
    ? recipe.name.slice(recipe.name.indexOf(": ") + 2)
    : recipe.name;
  const displayNamesById = new Map(
    recipe.outputs.map((output) => [output.id, output.displayName ?? output.id] as const),
  );

  // Live math with the node's current knob settings (defaults when unset),
  // as reshaped by whichever harvester is picked: an Industrial Farm fixes
  // water, fertilizer and sky itself and speeds the crop up with its upgrades.
  const setup = cropsNhHarvesterFromTiers(
    node?.machineConfigTiers,
    handler?.id,
    stats.minSeedBedTier,
    stats.subSoil !== undefined,
  );
  const speedMultiplier = cropsNhGrowthSpeedMultiplier(setup);
  const roundMultiplier = cropsNhHarvestRoundMultiplier(setup);
  const cropsPerMachine = cropsNhCropsPerMachine(setup);
  const managerSide = Math.round(Math.sqrt(cropsNhSquarePerTier(setup.tierIndex)));
  const env = cropsNhHarvesterEnvironment(
    setup,
    cropsNhEnvironmentFromTiers(node?.machineConfigTiers),
  );
  const waterBonus = Math.floor((Math.min(100, Math.max(0, env.water)) + 9) / 10);
  const fertilizerBonus = Math.floor((Math.min(100, Math.max(0, env.fertilizer)) + 9) / 10);
  const skyBonus = env.sky ? 2 : 0;
  const score = cropsNhNutrientScore(env);
  const supply = score * 5;
  const demand = stats.tier * 10;
  const surplus = supply - demand;
  const speedPercent = surplus >= 0 ? 100 + surplus : Math.max(0, 100 - (demand - supply) * 4);
  const rate = cropsNhGrowthRate(stats, env);
  const growing = rate > 0;
  const cycles = growing ? Math.ceil(stats.growthPoints / rate) : Infinity;
  const harvestTicks = cropsNhHarvestTicks(stats, env) / speedMultiplier;
  const harvestSeconds = harvestTicks / 20;
  const rounds = stats.dropChance * 1.03 ** Math.max(1, Math.min(31, env.gain)) * roundMultiplier;
  const dropLines = stats.drops.map((drop) => ({
    name: displayNamesById.get(drop.id) ?? drop.id,
    weightPercent: drop.weight / 100,
    stackSize: drop.stackSize,
    expected: cropsNhExpectedDrop(stats, env.gain, drop) * roundMultiplier,
  }));
  const totalPerHarvest = dropLines.reduce((sum, drop) => sum + drop.expected, 0);
  const cropCount = Math.max(1, node?.machineCount ?? 1);

  return (
    <div className="w-[500px]">
      <div className="flex items-baseline gap-2 border-b border-white/15 pb-1.5">
        <span className="truncate text-[18px] font-semibold text-white">{cropName}</span>
        <span className="shrink-0 text-[13px] text-slate-400">Tier {stats.tier}</span>
        <span className="ml-auto shrink-0 text-[12px] uppercase tracking-wide text-slate-400">
          Crop source
        </span>
      </div>

      {/* Fixed crop card data straight from the game export. */}
      <div className="mt-2 space-y-1">
        <StatRow label="Ripens at">
          <span className="text-slate-100">{stats.growthPoints.toLocaleString()}</span>
          <span className="text-slate-400"> growth points, restarting after every harvest</span>
        </StatRow>
        {dropLines.map((drop) => (
          <StatRow key={drop.name} label="Drops">
            <span className="text-slate-100">
              {drop.stackSize > 1 ? `${formatNumber(drop.stackSize, 0)}× ` : ""}
              {drop.name}
            </span>
            {drop.weightPercent < 100 ? (
              <span className="text-slate-400">
                {" "}
                ({formatNumber(drop.weightPercent, 1)}% of loot rolls)
              </span>
            ) : null}
          </StatRow>
        ))}
        {stats.machineOnly ? (
          <StatRow label="Farm">
            <span style={{ color: PENALTY_COLOR }}>Grows only inside an Industrial Farm</span>
          </StatRow>
        ) : null}
        {biomeTags.length > 0 ? (
          <StatRow label="Liked biomes">
            <span className="text-slate-300">{biomeTags.join(", ").toLowerCase()}</span>
          </StatRow>
        ) : null}
        {requirements.map((requirement) => (
          <p key={requirement} className="text-[15px] leading-snug text-slate-300">
            {requirement}
          </p>
        ))}
      </div>

      {/* How well fed is it, with the node's current settings. */}
      <div className="mt-2.5 border-t border-white/10 pt-2">
        <p className="text-[17px] font-semibold leading-snug text-amber-300">
          How well fed is it right now?
        </p>
        <p className="mt-1 text-[16px] leading-relaxed text-slate-100">
          Your settings feed it <span className="text-white">{supply}</span> food (
          {waterBonus > 1 ? "watered" : "dry"}
          {fertilizerBonus > 1 ? ", fertilized" : ", no fertilizer"}
          {env.sky ? ", open sky" : ", covered"}
          {env.biomeBonus > 0 ? ", nice biome" : ", wrong biome"}). Being Tier {stats.tier}, it
          wants <span className="text-white">{demand}</span>.{" "}
          {surplus >= 0 ? (
            <span>
              That&apos;s <span style={{ color: BONUS_COLOR }}>{surplus} more than it needs</span>,
              so it grows at{" "}
              <span style={{ color: BONUS_COLOR }}>{speedPercent}% speed</span>. A well-fed crop
              grows faster.
            </span>
          ) : supply + 25 <= demand ? (
            <span style={{ color: PENALTY_COLOR }}>
              That&apos;s {-surplus} less than it needs: far too hungry. It will not grow at all
              until you feed it better (more water, fertilizer, sky or a better biome).
            </span>
          ) : (
            <span>
              That&apos;s <span style={{ color: PENALTY_COLOR }}>{-surplus} less than it needs</span>
              , and hunger costs four times more than surplus helps: it runs at{" "}
              <span style={{ color: PENALTY_COLOR }}>{speedPercent}% speed</span>.
            </span>
          )}
        </p>
      </div>

      {/* How long until harvest. */}
      <div className="mt-2 border-t border-white/10 pt-2">
        <p className="text-[17px] font-semibold leading-snug text-amber-300">
          How long until each harvest?
        </p>
        {growing ? (
          <p className="mt-1 text-[16px] leading-relaxed text-slate-100">
            With Growth {env.growth} and that feeding, the plant ripens in about{" "}
            <span style={{ color: BONUS_COLOR }}>{formatNumber(harvestSeconds, 1)} seconds</span>,
            over and over.{" "}
            <span className="text-slate-400">
              (It gains {rate} of its {stats.growthPoints.toLocaleString()} growth points every
              12.8 s, {cycles} rounds in total.)
            </span>
          </p>
        ) : (
          <p className="mt-1 text-[16px] leading-relaxed" style={{ color: PENALTY_COLOR }}>
            Never: it&apos;s too hungry to grow. Fix the feeding above and this section returns.
          </p>
        )}
      </div>

      {/* What you get. */}
      <div className="mt-2 border-t border-white/10 pt-2">
        <p className="text-[17px] font-semibold leading-snug text-amber-300">
          What do you get each harvest?
        </p>
        <p className="mt-1 text-[16px] leading-relaxed text-slate-100">
          Gain {env.gain} rolls the loot table about{" "}
          <span className="text-white">{formatNumber(rounds, 1)} times</span> per harvest, with a
          small chance of bonus items on top. On average:
        </p>
        <div className="mt-1 space-y-0.5">
          {dropLines.map((drop) => (
            <StatRow key={drop.name} label={drop.name}>
              <span style={{ color: BONUS_COLOR }}>{formatNumber(drop.expected, 2)}</span>
              <span className="text-slate-400"> each harvest</span>
            </StatRow>
          ))}
        </div>
        {growing ? (
          <p className="mt-1.5 text-[16px] leading-relaxed text-slate-100">
            With your {cropCount === 1 ? "single crop" : `${cropCount} crops`}, that works out to{" "}
            <span style={{ color: BONUS_COLOR }}>
              about {formatNumber((totalPerHarvest * cropCount * 60) / harvestSeconds, 1)} items per
              minute
            </span>
            . Plant more seeds to scale it up.
          </p>
        ) : null}
      </div>

      {/* What the chosen machine adds, and how many of them that many crops needs. */}
      {!cropsNhIsHandPicked(setup) ? (
        <div className="mt-2 border-t border-white/10 pt-2">
          <p className="text-[17px] font-semibold leading-snug text-amber-300">
            What is picking it?
          </p>
          <p className="mt-1 text-[16px] leading-relaxed text-slate-100">
            {setup.id === "crop-manager" ? (
              <>
                A <span className="text-white">{cropsNhHarvesterTierName(setup.tierIndex)} Crop
                Manager</span> reaches {managerSide}x{managerSide} sticks on each of the{" "}
                {cropsNhManagerLayers(setup.subSoil) === 2 ? "two" : "three"} layers that fit in
                its five-block reach
                {setup.subSoil
                  ? ", two instead of three because this crop needs a block under its soil"
                  : ""}
                , less the block it stands on:{" "}
                <span style={{ color: BONUS_COLOR }}>
                  {formatNumber(cropsPerMachine, 0)} crop sticks per machine
                </span>
                . It rolls the loot table{" "}
                <span style={{ color: BONUS_COLOR }}>
                  {formatNumber((roundMultiplier - 1) * 100, 0)}% more
                </span>{" "}
                than bare crop sticks would drop, and spends{" "}
                {formatNumber(cropsNhManagerEuPerHarvest(setup), 0)} EU on every crop it picks.
              </>
            ) : (
              <>
                A <span className="text-white">{cropsNhHarvesterTierName(setup.tierIndex)}
                {" "}Industrial Farm</span> grows{" "}
                <span style={{ color: BONUS_COLOR }}>
                  {formatNumber(cropsPerMachine, 0)} seeds
                </span>{" "}
                in its beds and waters and feeds them for you, so it always runs at full water,
                full fertilizer and open sky. Its {cropsNhUpgradeSlots(setup.tierIndex)} upgrade
                slot{cropsNhUpgradeSlots(setup.tierIndex) === 1 ? "" : "s"} are set to{" "}
                <span style={{ color: BONUS_COLOR }}>x{formatNumber(speedMultiplier, 2)} speed</span>{" "}
                and{" "}
                <span style={{ color: BONUS_COLOR }}>
                  x{formatNumber(roundMultiplier, 2)} harvests
                </span>
                , drawing about {formatNumber(cropsNhEutPerCrop(setup) * cropsPerMachine, 0)} EU/t.
              </>
            )}
          </p>
          <p className="mt-1 text-[16px] leading-relaxed text-slate-100">
            Your {cropCount === 1 ? "single crop" : `${formatNumber(cropCount, 0)} crops`} need{" "}
            <span style={{ color: BONUS_COLOR }}>
              {formatNumber(Math.ceil(cropCount / cropsPerMachine), 0)}x{" "}
              {setup.id === "crop-manager" ? "Crop Manager" : "Industrial Farm"}
            </span>
            .
          </p>
        </div>
      ) : null}

      <p className="mt-2 border-t border-white/10 pt-2 text-[13px] leading-relaxed text-slate-400">
        Formulas: food = (5 + water + fertilizer + sky + biome) × 5 vs Tier × 10 demand
        (+1% speed per spare point, −4% per missing); growth = (6 + Growth) points per 12.8 s;
        loot rolls = {formatNumber(stats.dropChance, 3)} × 1.03^Gain with a (Gain + 1)% bonus roll.
        Straight from the game&apos;s own code. Resistance never changes these rates. It only
        fights weeds and sickness.
      </p>
    </div>
  );
}

function StatRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[16px] leading-snug">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="text-right text-slate-100">{children}</span>
    </div>
  );
}

/**
 * Hover panel for a machine choice. Only says what the screen does not
 * already show: what this exact machine changes (speed, power discount,
 * parallels, structure tuning) and how the simulator overclocks it.
 */
export function MachineStatsContent({ recipe, handler, node, result }: {
  recipe: Recipe; handler: MachineHandler; node: FactoryNode; result?: NodeThroughputResult;
}) {
  const mode = useFactoryStore((state) => tooltipMode(state.project));
  if (getCropsNhStats(recipe)) {
    return <CropSourceStatsContent recipe={recipe} handler={handler} node={node} />;
  }
  return <RecipeTooltip view={buildMachineTooltip(recipe, handler, node, mode, result)} />;
}
