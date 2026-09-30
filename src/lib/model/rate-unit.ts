/**
 * The board-wide rate unit. A module singleton (not React state) so every
 * formatter reads the same setting without threading a prop. Flipping it is
 * a VIEW change and never touches the books (they are per-second): every
 * surface that prints a rate subscribes to the store's dial
 * (`useRateDisplayUnits`) so it re-renders with the new unit.
 */
export type RateUnit = "tick" | "second" | "minute" | "hour" | "eu";

/** The four clocks; `eu` is the odd one out (see UNITS). */
export type TimeRateUnit = Exclude<RateUnit, "eu">;

import { GT_VOLTAGE_TIERS, getVoltageTierMaxEuT } from "./tiers";
import type { MachineTier } from "./types";

const UNITS: Record<RateUnit, { multiplier: number; per: string }> = {
  // A Minecraft tick is a twentieth of a second, and it is the unit the game
  // itself quotes machines in (EU/t, and every recipe duration).
  tick: { multiplier: 1 / 20, per: "t" },
  second: { multiplier: 1, per: "s" },
  minute: { multiplier: 60, per: "min" },
  hour: { multiplier: 3600, per: "hr" },
  // ENERGY PER UNIT MADE, not a clock: an output reads the EU spent on each
  // piece (or litre). Scale-free (machine count, parallels and utilization
  // cancel) but NOT tier-free: a regular overclock doubles it per step, a
  // perfect one leaves it flat. Card ports (per unit made or eaten), the
  // panel's Inputs/Outputs and the search chips wear it; wires and drawers
  // stay per second. A card's figure is that step's cost; the panel divides
  // the whole board's power by each boundary resource (the chain's embodied
  // cost). Neither splits a run's energy between its outputs: GTNH has no
  // honest valuation to split by.
  eu: { multiplier: 1, per: "s" },
};

const state: { unit: RateUnit } = { unit: "second" };

export function setActiveRateUnit(unit: RateUnit): void {
  state.unit = unit;
}

export function getActiveRateUnit(): RateUnit {
  return state.unit;
}

/** The energy-per-unit reading is on: outputs read EU each, not a rate. */
export function isEnergyRateUnit(): boolean {
  return state.unit === "eu";
}

/**
 * EU spent per unit made: a node's EU/t over one output's per-second flow.
 * Both figures scale together (the books keep nameplate and actual in
 * step), so the quotient is the per-unit cost whatever the machine is
 * doing. Undefined when nothing is made, so a formatter shows nothing
 * rather than infinity.
 */
export function energyPerUnit(euPerTick: number, perSecond: number): number | undefined {
  if (!Number.isFinite(euPerTick) || !Number.isFinite(perSecond) || perSecond <= 1e-12) {
    return undefined;
  }
  return (Math.max(0, euPerTick) * 20) / perSecond;
}

/**
 * The label an energy reading wears in plain EU: "EU/Item" for items,
 * "EU/L" for fluids. The recipe browser's reading, which is a reference and
 * ignores every board dial.
 */
export function energyPerUnitSuffix(kind: string): string {
  return kind === "fluid" ? " EU/L" : " EU/Item";
}

/**
 * The CANVAS reading follows the power dial (below): in EU/t mode it is EU
 * per unit, in amps-of-a-tier mode it is that tier's amps per unit - the
 * EU divided by the tier's voltage, "6.25 A LV/Item" for a 200 EU item.
 * Cards and the panel take these two; the browser takes the plain pair above.
 */
export function energyPerUnitDisplayValue(euPerUnit: number): number {
  return powerState.unit === "eu" ? euPerUnit : euPerUnit / getVoltageTierMaxEuT(powerState.unit);
}

export function energyPerUnitDisplaySuffix(kind: string): string {
  const per = kind === "fluid" ? "L" : "Item";
  return powerState.unit === "eu" ? ` EU/${per}` : ` A ${powerState.unit}/${per}`;
}

/** Multiply a per-second figure by this before display. */
export function rateUnitMultiplier(): number {
  return UNITS[state.unit].multiplier;
}

export function rateUnitSuffix(fluid: boolean): string {
  const { per } = UNITS[state.unit];
  return fluid ? ` L/${per}` : `/${per}`;
}

/**
 * The POWER DISPLAY UNIT, a second board-wide dial beside the rate unit:
 * EU/t (the default), or AMPS OF A CHOSEN TIER - the way players actually
 * size dynamos and cabling ("I need 100 A LuV"). Amps of tier T = EU/t
 * divided by T's voltage; packets per tick, nothing more. Same module-
 * singleton pattern as the rate unit above, for the same reason.
 */
export type PowerDisplayUnit = "eu" | Exclude<MachineTier, "DEMO">;

export function isPowerDisplayUnit(value: unknown): value is PowerDisplayUnit {
  return value === "eu" || GT_VOLTAGE_TIERS.some(({ tier }) => tier === value);
}

const powerState: { unit: PowerDisplayUnit } = { unit: "eu" };

export function setActivePowerDisplayUnit(unit: PowerDisplayUnit): void {
  powerState.unit = unit;
}

export function getActivePowerDisplayUnit(): PowerDisplayUnit {
  return powerState.unit;
}

/**
 * The kind-aware pair. POWER ignores the board's rate unit on purpose: EU is
 * quoted per tick everywhere (the game, the wiki, every power surface here).
 * Its flows are still stored per second; only the display converts, to EU/t
 * or to amps of the chosen tier.
 */
export function rateSuffixForKind(kind: string): string {
  if (kind === "power") {
    return powerState.unit === "eu" ? " EU/t" : ` A ${powerState.unit}`;
  }
  return rateUnitSuffix(kind === "fluid");
}

/** Multiply a per-second figure by this before display, for this kind. */
export function rateMultiplierForKind(kind: string): number {
  if (kind === "power") {
    const perTick = 1 / 20;
    return powerState.unit === "eu"
      ? perTick
      : perTick / getVoltageTierMaxEuT(powerState.unit);
  }
  return rateUnitMultiplier();
}

/** EU/t converted for display: itself in EU/t mode, amps of the tier otherwise. */
export function powerDisplayFromEuT(euPerTick: number): number {
  return powerState.unit === "eu" ? euPerTick : euPerTick / getVoltageTierMaxEuT(powerState.unit);
}

/** The label the figure above wears. */
export function powerDisplaySuffix(): string {
  return powerState.unit === "eu" ? "EU/t" : `A ${powerState.unit}`;
}

/**
 * Scale a noise floor or a rounding step that was written in per-second terms.
 * Per tick every figure is twenty times smaller, so an unscaled floor would
 * blank a real 0.004/s output. Never above 1: units larger than a second
 * already keep more precision.
 */
export function rateUnitPrecisionScale(): number {
  return Math.min(rateUnitMultiplier(), 1);
}
