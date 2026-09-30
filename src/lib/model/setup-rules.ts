import type { SetupRules } from "./types";

/** Both rules, always answered - the closed setup is `false, false`. */
export type ResolvedSetupRules = Required<SetupRules>;

/**
 * Fixed for every plan: the board's three MODES do the rules' job (build and
 * solve are closed setups, pool imports and banks by itself), and loose cell
 * wires are always on. Callers still ask; a stored `setupRules` or legacy
 * sketch flag is ignored (the load funnel drops both).
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
