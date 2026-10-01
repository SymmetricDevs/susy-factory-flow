import type { ResourceIconAtlasRef } from "@/lib/model/types";

/** One concrete hatch item: a (tier, family) cell of the picker. */
export interface EnergyHatchCatalogEntry {
  id: string;
  displayName: string;
  iconPath?: string;
  iconAtlas?: ResourceIconAtlasRef;
  dominantColor?: string;
}
