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
export function getSetupRules(project: {
  setupRules?: SetupRules;
  assumeBoundaries?: boolean;
  poolMode?: boolean;
}): ResolvedSetupRules {
  // Pool mode imports and banks by itself, and bridges cells and fluids by
  // itself. The stored rules remain untouched and return when pool mode ends.
  if (project.poolMode) {
    return { freeInputs: false, freeOutputs: false, looseCellWires: true };
  }
  const rules = project.setupRules;
  if (!rules) {
    const legacy = project.assumeBoundaries === true;
    return { freeInputs: legacy, freeOutputs: legacy, looseCellWires: false };
  }
  return {
    freeInputs: rules.freeInputs === true,
    freeOutputs: rules.freeOutputs === true,
    looseCellWires: rules.looseCellWires === true,
  };
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
