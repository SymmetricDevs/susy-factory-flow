import type { SetupRules } from "./types";

/** Both rules, always answered - the closed setup is `false, false`. */
export type ResolvedSetupRules = Required<SetupRules>;

/**
 * What this plan's rules are, legacy included.
 *
 * Sketch mode (`assumeBoundaries`) was the pair of them at once, so a plan
 * saved under it reads as both on. `normalizeLoadedProject` rewrites the old
 * flag on the way in; this still honours it, because fixtures and tests build
 * projects by hand and never go through that funnel.
 */
/**
 * THE RULES ARE GONE (Jack, 2026-09-06). The board's three MODES do their
 * job: build and solve are closed setups, pool mode imports and banks by
 * itself, and loose cell wires is simply always on. This answers the same
 * three questions every caller still asks, and answers them the same way
 * for every plan - whatever a stored `setupRules` or the legacy sketch flag
 * says (the load funnel drops both).
 */
const RULES: ResolvedSetupRules = Object.freeze({
  freeInputs: false,
  freeOutputs: false,
  looseCellWires: true,
});

export function getSetupRules(_project: {
  setupRules?: SetupRules;
  assumeBoundaries?: boolean;
  poolMode?: boolean;
}): ResolvedSetupRules {
  return RULES;
}

/** Stored form: nothing set at all when every rule is off. */
export function packSetupRules(rules: ResolvedSetupRules): SetupRules | undefined {
  if (!rules.freeInputs && !rules.freeOutputs && !rules.looseCellWires) {
    return undefined;
  }
  return {
    freeInputs: rules.freeInputs || undefined,
    freeOutputs: rules.freeOutputs || undefined,
    looseCellWires: rules.looseCellWires || undefined,
  };
}
