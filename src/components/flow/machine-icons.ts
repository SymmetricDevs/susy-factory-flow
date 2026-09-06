"use client";

import { useMemo } from "react";
import type { MachineHandlerIconEntry, RecipeMapIconEntry } from "@/lib/datasets/types";
import { useFactoryStore } from "@/store/factory-store";

export type MachineHandlerIcon = MachineHandlerIconEntry["resource"];

const TIER_ORDER = ["ULV", "LV", "MV", "HV", "EV", "IV", "LuV", "ZPM", "UV", "UHV", "UEV", "UIV", "UXV", "OpV", "MAX"];
const tierRank = (tier: string | undefined) => {
  const index = TIER_ORDER.findIndex((name) => name.toLowerCase() === String(tier ?? "").toLowerCase());
  return index < 0 ? -1 : index;
};

/**
 * The family's art AT A TIER: the variant whose tier is the highest not
 * above the asked one (an HV card on a family with LV/MV/HV/EV variants
 * wears the HV block; an ULV card the lowest there is). The family face
 * when the family has no tier list.
 */
export function machineIconAtTier(
  entry: MachineHandlerIconEntry | undefined,
  tier: string | undefined,
): MachineHandlerIcon | undefined {
  if (!entry) return undefined;
  const tiers = entry.tiers;
  if (!tiers || tiers.length === 0) return entry.resource;
  const wanted = tierRank(tier);
  let pick = tiers[0]!;
  for (const variant of tiers) {
    if (tierRank(variant.tier) <= wanted) pick = variant;
  }
  return pick.resource;
}

/** Handler family id -> its whole icon entry (face and tier variants). */
export function useMachineHandlerIconEntries(): ReadonlyMap<string, MachineHandlerIconEntry> {
  const entries = useFactoryStore((state) => state.dataset?.machineHandlerIcons);
  return useMemo(() => new Map((entries ?? []).map((entry) => [entry.familyId, entry])), [entries]);
}

/**
 * Recipe map -> the map's own machine item. The face for a card whose map
 * has ONE machine family: such recipes carry no handlers (by design), the
 * app mints a placeholder handler, and no family icon is keyed by it.
 */
export function useRecipeMapIcons(): ReadonlyMap<string, RecipeMapIconEntry["resource"]> {
  const entries = useFactoryStore((state) => state.dataset?.recipeMapIcons);
  return useMemo(() => new Map((entries ?? []).map((entry) => [entry.recipeMap, entry.resource])), [entries]);
}

/**
 * Machine handler family icons, shipped in the dataset catalog
 * (machineHandlerIcons: familyId -> the family's lowest-tier item). Keyed by
 * handler id, which is the family slug on both sides of the pipeline.
 */
export function useMachineHandlerIcons(): ReadonlyMap<string, MachineHandlerIcon> {
  const entries = useFactoryStore((state) => state.dataset?.machineHandlerIcons);
  return useMemo(
    () => new Map((entries ?? []).map((entry) => [entry.familyId, entry.resource])),
    [entries],
  );
}
