"use client";

import { useEffect } from "react";
import { syncSharedPlanAddress } from "@/lib/community/shared-link";
import { useWelcomeTab } from "@/lib/welcome/welcome-tab";
import { useFactoryStore } from "@/store/factory-store";

/**
 * Keeps the address bar honest about the open board.
 *
 * While the board is an untouched copy of a community post, the address
 * carries that post's share link - copying the URL bar IS copying the link.
 * The moment the board drifts from the post (one card moved, one wire drawn),
 * the id leaves the address, because a link that opens something other than
 * what the sender is looking at is worse than no link. Reset the board, or
 * share it so the post catches up, and the id returns on its own.
 *
 * Also empty while Welcome covers the board (the address should say where you
 * ARE), for a copy that predates fingerprints (unchanged cannot be proven),
 * and for a post found deleted (see noteSharedPlanGone).
 *
 * Arrival is not read from the live address - shared-link.ts captured it at
 * load - so this sync can never race the import out of its parameter.
 */
export function SharedAddressSync() {
  const project = useFactoryStore((state) => state.project);
  const isWelcomeCoveringBoard = useWelcomeTab().active;

  useEffect(() => {
    // A linked design IS its post, so the address may carry the post's id
    // whenever the board is showing.
    const linkedPlanId = project.metadata?.communityPlanId;
    syncSharedPlanAddress(!isWelcomeCoveringBoard && linkedPlanId ? linkedPlanId : undefined);
  }, [project, isWelcomeCoveringBoard]);

  return null;
}
