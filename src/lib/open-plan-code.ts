"use client";

import { decodePlanCode, readPlanCodeFromHash } from "@/lib/import-export/plan-code";
import { applyPlanView } from "@/lib/plan-view";
import { useDesignStore } from "@/store/design-store";

/**
 * Open a plan code (or a link carrying one) as a NEW design tab, never over
 * the plan already on the board. Throws the decoder's plain-words error for
 * the caller to show.
 */
export async function openPlanCode(text: string): Promise<void> {
  const project = await decodePlanCode(text);
  await useDesignStore.getState().importProjectAsDesign(project, project.name);
  applyPlanView(project.view);
}

/**
 * The code this page load arrived with, captured at module load (like the
 * community link's id in shared-link.ts) because SharedAddressSync later
 * rewrites the address and drops the fragment.
 */
let arrivalPlanCode: string | undefined = (() => {
  try {
    return readPlanCodeFromHash(window.location.hash);
  } catch {
    return undefined;
  }
})();

/**
 * Open the code in the address (the one this load arrived with, or one a hash
 * change just brought), then remove it from the address so a reload does not
 * open a second copy.
 */
export async function openPlanCodeFromAddress(): Promise<void> {
  const code = arrivalPlanCode ?? readPlanCodeFromHash(window.location.hash);
  arrivalPlanCode = undefined;
  if (!code) {
    return;
  }
  if (readPlanCodeFromHash(window.location.hash)) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
  try {
    await openPlanCode(code);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "That plan link could not be opened.");
  }
}
