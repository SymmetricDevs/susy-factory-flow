import type { Recipe, ResourceAmount, ResourceKind } from "@/lib/model/types";
import {
  knownRecipeMapSlotCapacity,
  mergeRecipeMapSlotCapacity,
} from "@/lib/model/recipe-map-capacities";

export interface NeiPoint {
  x: number;
  y: number;
}

export interface NeiSize {
  width: number;
  height: number;
}

export type NeiSlotSide = "input" | "output";

export interface NeiPositionedSlot {
  side: NeiSlotSide;
  kind: ResourceKind;
  resource: ResourceAmount;
  resourceIndex: number;
  slotIndex: number;
  x: number;
  y: number;
}

export interface NeiSlotFrame {
  side: NeiSlotSide;
  kind: ResourceKind;
  resource?: ResourceAmount;
  resourceIndex?: number;
  slotIndex: number;
  x: number;
  y: number;
}

export interface NeiOverflowGroup {
  side: NeiSlotSide;
  kind: ResourceKind;
  capacity: number;
  resourceCount: number;
}

export type NeiProgressTexture = string;

export interface NeiProgressBar {
  x: number;
  y: number;
  width: number;
  height: number;
  direction: "right" | "up" | "circular";
  texture: NeiProgressTexture;
  frame?: number;
}

export interface NeiRectDecoration {
  kind?: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface NeiTextureDecoration {
  kind: "texture";
  x: number;
  y: number;
  width: number;
  height: number;
  imagePath: string;
  textureWidth: number;
  textureHeight: number;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  opacity?: number;
}

export type NeiDecoration = NeiRectDecoration | NeiTextureDecoration;

export interface NeiRecipeLayout {
  id: string;
  chrome: "gregtech" | "native";
  title?: string;
  pageLabel?: string;
  canvas: NeiSize;
  slotSize: number;
  frames: NeiSlotFrame[];
  slots: NeiPositionedSlot[];
  overflowGroups: NeiOverflowGroup[];
  progressBars: NeiProgressBar[];
  decorations: NeiDecoration[];
  unframedSlotKinds: ResourceKind[];
  logo: NeiPoint;
}

interface RecipeMapLayoutDefinition {
  id: string;
  title?: string;
  pageLabel?: string;
  canvas?: NeiSize;
  maxItemInputs?: number;
  maxItemOutputs?: number;
  maxFluidInputs?: number;
  maxFluidOutputs?: number;
  logo?: NeiPoint;
  itemInputPositions?: PositionGetter;
  itemOutputPositions?: PositionGetter;
  fluidInputPositions?: PositionGetter;
  fluidOutputPositions?: PositionGetter;
  progressBars?: NeiProgressBar[];
  decorations?: NeiDecoration[];
  chrome?: "gregtech" | "native";
  unframedSlotKinds?: ResourceKind[];
}

type PositionGetter = (count: number, definition: RequiredRecipeMapLayoutDefinition) => NeiPoint[];

type RequiredRecipeMapLayoutDefinition = Required<
  Pick<
    RecipeMapLayoutDefinition,
    "maxItemInputs" | "maxItemOutputs" | "maxFluidInputs" | "maxFluidOutputs"
  >
>;

const SLOT_SIZE = 18;
const DEFAULT_CANVAS: NeiSize = { width: 170, height: 82 };
const THAUMCRAFT_OVERLAY_PATH = "/nei/thaumcraft/gui/gui_researchbook_overlay.png";
const THAUMCRAFT_OVERLAY_SIZE = 256;
const DEFAULT_PROGRESS_BARS: NeiProgressBar[] = [
  { x: 78, y: 24, width: 20, height: 18, direction: "right", texture: "arrow" },
];
const CROP_PROGRESS_BARS: NeiProgressBar[] = [
  { x: 78, y: 35, width: 24, height: 17, direction: "right", texture: "arrow" },
];
const beeOutputPositions: PositionGetter = (count) =>
  Array.from({ length: count }, (_, index) => ({
    x: 106 + (index % 3) * SLOT_SIZE,
    y: 17 + Math.floor(index / 3) * SLOT_SIZE * 2,
  }));
const BEE_PRODUCE_LAYOUT: RecipeMapLayoutDefinition = {
  id: "bee-produce",
  maxItemInputs: 1,
  maxItemOutputs: 6,
  maxFluidInputs: 0,
  maxFluidOutputs: 0,
  itemInputPositions: (count) => gridPositions(count, 48, 35, 1, 1),
  itemOutputPositions: beeOutputPositions,
  progressBars: [{ x: 80, y: 35, width: 24, height: 17, direction: "right", texture: "arrow" }],
};
const COMPONENT_ASSEMBLY_LINE_LAYOUT: RecipeMapLayoutDefinition = {
  id: "component-assembly-line",
  canvas: { width: 170, height: 112 },
  maxItemInputs: 12,
  maxItemOutputs: 1,
  maxFluidInputs: 12,
  maxFluidOutputs: 0,
  itemInputPositions: (count) => gridPositions(count, 16, 17, 3, 4),
  itemOutputPositions: (count) => (count > 0 ? [{ x: 151, y: 17 }] : []),
  fluidInputPositions: (count) => gridPositions(count, 97, 35, 4, 3),
  progressBars: [],
  decorations: [
    { x: 70, y: 19, width: 82, height: 1, color: "#373737" },
    { x: 70, y: 20, width: 82, height: 1, color: "#8B8B8B" },
    { x: 70, y: 21, width: 82, height: 1, color: "#ffffff" },
    { x: 141, y: 25, width: 11, height: 1, color: "#030303" },
    { x: 142, y: 26, width: 10, height: 1, color: "#373737" },
    { x: 143, y: 27, width: 9, height: 1, color: "#8B8B8B" },
    { x: 141, y: 25, width: 1, height: 18, color: "#030303" },
    { x: 142, y: 26, width: 1, height: 18, color: "#373737" },
    { x: 143, y: 27, width: 1, height: 18, color: "#8B8B8B" },
  ],
};
const THAUMCRAFT_INFUSION_LAYOUT: RecipeMapLayoutDefinition = {
  id: "thaumcraft-infusion",
  chrome: "native",
  title: "Arcane Infusion",
  canvas: { width: 214, height: 140 },
  maxItemInputs: 1,
  maxItemOutputs: 1,
  maxFluidInputs: 0,
  maxFluidOutputs: 0,
  progressBars: [],
  unframedSlotKinds: ["item", "aspect"],
  decorations: [
    thaumcraftOverlayDecoration(34, -5, 0, 3, 56, 17, 1.75),
    thaumcraftOverlayDecoration(34, 28.25, 200, 77, 60, 44, 1.75),
  ],
};
const THAUMCRAFT_CRUCIBLE_LAYOUT: RecipeMapLayoutDefinition = {
  id: "thaumcraft-crucible",
  chrome: "native",
  title: "Thaumcraft Crucible",
  canvas: { width: 170, height: 132 },
  maxItemInputs: 1,
  maxItemOutputs: 1,
  maxFluidInputs: 0,
  maxFluidOutputs: 0,
  progressBars: [],
  unframedSlotKinds: ["item", "aspect"],
  decorations: [
    thaumcraftOverlayDecoration(36, 44, 0, 20, 56, 48, 1.75),
    thaumcraftOverlayDecoration(74, 32, 100, 84, 11, 13, 1.75),
  ],
};
const THAUMCRAFT_ARCANE_LAYOUT: RecipeMapLayoutDefinition = {
  id: "thaumcraft-arcane",
  chrome: "native",
  title: "Shaped Arcane Crafting",
  canvas: { width: 170, height: 174 },
  maxItemInputs: 9,
  maxItemOutputs: 1,
  maxFluidInputs: 0,
  maxFluidOutputs: 0,
  progressBars: [],
  unframedSlotKinds: ["aspect"],
  decorations: [
    thaumcraftOverlayDecoration(37.4, 24.1, 112, 15, 52, 52, 1.7),
    thaumcraftOverlayDecoration(68, -3.1, 20, 3, 16, 16, 1.7),
    thaumcraftOverlayDecoration(34, 149, 68, 76, 12, 12, 2, 0.4),
  ],
};
const THAUMCRAFT_ESSENTIA_SMELTING_LAYOUT: RecipeMapLayoutDefinition = {
  id: "thaumcraft-essentia-smelting",
  chrome: "native",
  title: "Essentia Smelting",
  canvas: { width: 170, height: 82 },
  maxItemInputs: 1,
  maxItemOutputs: 0,
  maxFluidInputs: 0,
  maxFluidOutputs: 0,
  progressBars: [],
  unframedSlotKinds: ["item", "aspect"],
  itemInputPositions: (count) => (count > 0 ? [{ x: 42, y: 34 }] : []),
  decorations: [thaumcraftOverlayDecoration(75, 29, 100, 84, 11, 13, 1.75)],
};

const LARGE_NEI_MAPS = new Set([
  "Entropic Processing",
  "Large Chemical Reactor",
  "Plasma Arc Furnace",
  "Vacuum Furnace",
  "Vacuum Freezer",
  "Multiblock Centrifuge",
  "Multiblock Electrolyzer",
  "Multiblock Mixer",
  "Multiblock Dehydrator",
  "Transcendent Plasma Mixer",
]);

const ASSEMBLY_LINE_MAPS = new Set([
  "Assemblyline Process",
  "Circuit Assembly Line",
  "Component Assembly Line",
  "Nanochip Assembly Matrix",
]);

const FLUID_ONLY_MAPS = new Set([
  "Fusion Reactor",
  "Liquid Fluoride Thorium Reactor",
  "Nuclear Fuel Processing",
  "Solar Tower",
]);

const CRAFTING_TABLE_MAPS = new Set([
  "Crafting Table",
  "Crafting Table (Ore Dictionary)",
  "Crafting Table (Shaped)",
  "Crafting Table (Shapeless)",
  "Shaped Crafting",
  "Shapeless Crafting",
]);

const RECIPE_MAP_LAYOUTS: Record<string, RecipeMapLayoutDefinition> = {
  "Blast Furnace": {
    id: "blast-furnace",
  },
  Centrifuge: {
    id: "centrifuge",
    maxItemInputs: 2,
    maxItemOutputs: 6,
    maxFluidInputs: 1,
    maxFluidOutputs: 1,
  },
  "Chemical Plant": {
    id: "gtpp-chemical-plant",
    maxItemInputs: 4,
    maxItemOutputs: 6,
    maxFluidInputs: 4,
    maxFluidOutputs: 3,
    itemInputPositions: (count) => gridPositions(count, 7, 6, Math.max(count, 1), 1),
    itemOutputPositions: (count) => gridPositions(count, 106, 6, 2),
    fluidInputPositions: (count) => gridPositions(count, 7, 41, Math.max(count, 1), 1),
    fluidOutputPositions: (count) => gridPositions(count, 142, 6, 1, Math.max(count, 1)),
    progressBars: DEFAULT_PROGRESS_BARS,
  },
  "Bee Produce": BEE_PRODUCE_LAYOUT,
  "Bee Production": BEE_PRODUCE_LAYOUT,
  Apiary: BEE_PRODUCE_LAYOUT,
  "Magic Apiary": BEE_PRODUCE_LAYOUT,
  Alveary: BEE_PRODUCE_LAYOUT,
  "Industrial Apiary": BEE_PRODUCE_LAYOUT,
  "Mega Apiary": BEE_PRODUCE_LAYOUT,
  "IC2 Crop": {
    id: "crop-production",
    maxItemInputs: 1,
    maxItemOutputs: 3,
    maxFluidInputs: 0,
    maxFluidOutputs: 0,
    progressBars: CROP_PROGRESS_BARS,
  },
  CropNH: {
    id: "crop-production",
    maxItemInputs: 1,
    maxItemOutputs: 3,
    maxFluidInputs: 0,
    maxFluidOutputs: 0,
    progressBars: CROP_PROGRESS_BARS,
  },
  "Crop Production": {
    id: "crop-production",
    maxItemInputs: 1,
    maxItemOutputs: 3,
    maxFluidInputs: 0,
    maxFluidOutputs: 0,
    progressBars: CROP_PROGRESS_BARS,
  },
  "Crop Manager": {
    id: "crop-production",
    maxItemInputs: 1,
    maxItemOutputs: 3,
    maxFluidInputs: 0,
    maxFluidOutputs: 0,
    progressBars: CROP_PROGRESS_BARS,
  },
  "Distillation Tower": {
    id: "distillation-tower",
    maxItemInputs: 2,
    maxItemOutputs: 1,
    maxFluidInputs: 1,
    maxFluidOutputs: 11,
    logo: { x: 80, y: 62 },
    itemOutputPositions: (count) => (count > 0 ? [{ x: 106, y: 62 }] : []),
    fluidOutputPositions: (count) => {
      const results: NeiPoint[] = [];
      for (let i = 1; i < count + 1; i += 1) {
        results.push({ x: 106 + (i % 3) * SLOT_SIZE, y: 62 - Math.floor(i / 3) * SLOT_SIZE });
      }
      return results;
    },
    progressBars: DEFAULT_PROGRESS_BARS,
  },
  "Zhuhai - Fishing Port": {
    id: "zhuhai-fishing-port",
    maxItemInputs: 1,
    maxItemOutputs: 25,
    maxFluidInputs: 0,
    maxFluidOutputs: 0,
    itemInputPositions: (count) => gridPositions(count, 24, 44, 1),
    itemOutputPositions: (count) => gridPositions(count, 78, 8, 5, 5),
  },
  "Thaumcraft Infusion": THAUMCRAFT_INFUSION_LAYOUT,
  "Arcane Infusion": THAUMCRAFT_INFUSION_LAYOUT,
  "Thaumcraft Crucible": THAUMCRAFT_CRUCIBLE_LAYOUT,
  "Thaumcraft Arcane Crafting": THAUMCRAFT_ARCANE_LAYOUT,
  "Thaumcraft Essentia Smelting": THAUMCRAFT_ESSENTIA_SMELTING_LAYOUT,
  "Shaped Arcane Crafting": THAUMCRAFT_ARCANE_LAYOUT,
  "Shapeless Arcane Crafting": {
    ...THAUMCRAFT_ARCANE_LAYOUT,
    id: "thaumcraft-shapeless-arcane",
    title: "Shapeless Arcane Crafting",
  },
};

export function getNeiRecipeLayout(recipe: Recipe): NeiRecipeLayout {
  const recipeMap = recipe.source?.recipeMap ?? recipe.machineType;
  const definition = resolveLayoutDefinition(recipeMap, recipe);
  const requiredDefinition = withRequiredMaxes(definition, recipe);
  const itemInputs = withResourceIndexes(recipe.inputs, "item");
  const fluidInputs = withResourceIndexes(recipe.inputs, "fluid");
  const aspectInputs = withResourceIndexes(recipe.inputs, "aspect");
  const itemOutputs = withResourceIndexes(recipe.outputs, "item");
  const fluidOutputs = withResourceIndexes(recipe.outputs, "fluid");
  const aspectOutputs = withResourceIndexes(recipe.outputs, "aspect");

  const shouldUseRecipeMapLayout =
    definition.id === "bee-produce" || definition.id === "component-assembly-line";
  const explicitFrames = shouldUseRecipeMapLayout
    ? undefined
    : getExplicitSlotFrames(recipe, {
        itemInputs,
        fluidInputs,
        aspectInputs,
        fluidOutputs,
        itemOutputs,
        aspectOutputs,
      });
  const explicitProgressBars = shouldUseRecipeMapLayout
    ? undefined
    : recipe.nei?.progressBars?.map((bar) => ({
        ...bar,
        texture: bar.texture ?? "arrow",
      }));
  const frames: NeiSlotFrame[] = explicitFrames ?? [
    ...positionFrames(
      itemInputs,
      "input",
      "item",
      (definition.itemInputPositions ?? defaultItemInputPositions)(
        Math.max(itemInputs.length, requiredDefinition.maxItemInputs),
        requiredDefinition,
      ),
    ),
    ...positionFrames(
      fluidInputs,
      "input",
      "fluid",
      (definition.fluidInputPositions ?? defaultFluidInputPositions)(
        Math.max(fluidInputs.length, requiredDefinition.maxFluidInputs),
        requiredDefinition,
      ),
    ),
    ...positionFrames(
      aspectInputs,
      "input",
      "aspect",
      aspectPositions(aspectInputs.length, "input", requiredDefinition),
    ),
    ...positionFrames(
      itemOutputs,
      "output",
      "item",
      (definition.itemOutputPositions ?? defaultItemOutputPositions)(
        Math.max(itemOutputs.length, requiredDefinition.maxItemOutputs),
        requiredDefinition,
      ),
    ),
    ...positionFrames(
      fluidOutputs,
      "output",
      "fluid",
      (definition.fluidOutputPositions ?? defaultFluidOutputPositions)(
        Math.max(fluidOutputs.length, requiredDefinition.maxFluidOutputs),
        requiredDefinition,
      ),
    ),
    ...positionFrames(
      aspectOutputs,
      "output",
      "aspect",
      aspectPositions(aspectOutputs.length, "output", requiredDefinition),
    ),
  ];
  const slots = frames.filter((frame): frame is NeiPositionedSlot => Boolean(frame.resource));

  const exportedCanvas = recipe.nei?.canvas;
  const baseCanvas = exportedCanvas ?? definition.canvas ?? DEFAULT_CANVAS;
  const exportedBackground = recipe.nei?.backgroundImage
    ? [
        {
          kind: "texture" as const,
          x: 0,
          y: 0,
          width: baseCanvas.width,
          height: baseCanvas.height,
          imagePath: recipe.nei.backgroundImage,
          textureWidth: baseCanvas.width,
          textureHeight: baseCanvas.height,
          sourceX: 0,
          sourceY: 0,
          sourceWidth: baseCanvas.width,
          sourceHeight: baseCanvas.height,
        },
      ]
    : undefined;
  const decorations = exportedBackground ?? definition.decorations;
  const canvas = growCanvas(baseCanvas, frames, decorations);

  return {
    id: definition.id,
    chrome: definition.chrome ?? "gregtech",
    title: definition.title,
    pageLabel: definition.pageLabel,
    canvas,
    slotSize: SLOT_SIZE,
    frames,
    slots,
    overflowGroups: explicitFrames
      ? []
      : buildOverflowGroups(definition, recipe, {
          itemInputs: itemInputs.length,
          itemOutputs: itemOutputs.length,
          fluidInputs: fluidInputs.length,
          fluidOutputs: fluidOutputs.length,
          aspectInputs: aspectInputs.length,
          aspectOutputs: aspectOutputs.length,
        }),
    progressBars: getProgressBarsForRecipeMap(
      recipeMap,
      explicitProgressBars ?? definition.progressBars,
    ),
    decorations: decorations ?? [],
    unframedSlotKinds: definition.unframedSlotKinds ?? [],
    logo: definition.logo ?? { x: 152, y: 63 },
  };
}

export function usesNativeNeiChrome(
  recipe: Pick<Recipe, "machineType" | "source"> & { recipeMap?: string },
): boolean {
  const recipeMap = recipe.source?.recipeMap ?? recipe.recipeMap ?? recipe.machineType;
  const inferredRecipe = { machineType: recipe.machineType, source: recipe.source } as Recipe;
  return (
    findRecipeMapLayout(recipeMap)?.chrome === "native" ||
    inferThaumcraftLayoutDefinition(recipeMap, inferredRecipe)?.chrome === "native"
  );
}

function getExplicitSlotFrames(
  recipe: Recipe,
  resources: {
    itemInputs: Array<{ resource: ResourceAmount; resourceIndex: number }>;
    fluidInputs: Array<{ resource: ResourceAmount; resourceIndex: number }>;
    aspectInputs: Array<{ resource: ResourceAmount; resourceIndex: number }>;
    itemOutputs: Array<{ resource: ResourceAmount; resourceIndex: number }>;
    fluidOutputs: Array<{ resource: ResourceAmount; resourceIndex: number }>;
    aspectOutputs: Array<{ resource: ResourceAmount; resourceIndex: number }>;
  },
): NeiSlotFrame[] | undefined {
  const slots = recipe.nei?.slots;
  if (!slots?.length) {
    return undefined;
  }

  const pools = {
    "input:item": [...resources.itemInputs],
    "input:fluid": [...resources.fluidInputs],
    "input:aspect": [...resources.aspectInputs],
    "output:item": [...resources.itemOutputs],
    "output:fluid": [...resources.fluidOutputs],
    "output:aspect": [...resources.aspectOutputs],
  };

  const frames: NeiSlotFrame[] = slots
    .filter((slot) => slot.kind === "item" || slot.kind === "fluid" || slot.kind === "aspect")
    .map((slot) => {
      const poolKey = `${slot.side}:${slot.kind}` as keyof typeof pools;
      const pool = pools[poolKey];
      const resourceIndex = pool.findIndex(
        (entry) => entry.resource.neiSlot?.x === slot.x && entry.resource.neiSlot?.y === slot.y,
      );
      const [entry] = resourceIndex >= 0 ? pool.splice(resourceIndex, 1) : [undefined];
      return {
        side: slot.side,
        kind: slot.kind,
        resource: entry?.resource,
        resourceIndex: entry?.resourceIndex,
        slotIndex: slot.slotIndex,
        x: slot.x,
        y: slot.y,
      };
    });

  // Exported slot positions win, but an ingredient that carries none (ore
  // dictionary inputs have no `neiSlot`) must still be drawn: whatever the
  // first pass could not place falls into its pool's leftover frames, in order.
  for (const frame of frames) {
    if (frame.resource) {
      continue;
    }
    const pool = pools[`${frame.side}:${frame.kind}` as keyof typeof pools];
    const entry = pool.shift();
    if (!entry) {
      continue;
    }
    frame.resource = entry.resource;
    frame.resourceIndex = entry.resourceIndex;
  }

  return frames;
}

function getProgressBarsForRecipeMap(
  recipeMap: string,
  progressBars = DEFAULT_PROGRESS_BARS,
): NeiProgressBar[] {
  const texture = getProgressTextureForRecipeMap(recipeMap);
  return progressBars.map((bar) => ({
    ...bar,
    texture: !bar.texture || bar.texture === "arrow" ? texture : bar.texture,
  }));
}

function getProgressTextureForRecipeMap(recipeMap: string): NeiProgressTexture {
  const normalized = recipeMap.trim().toLowerCase();
  const exact: Record<string, NeiProgressTexture> = {
    "bacterial vat": "arrow_multiple",
    "bee produce": "arrow",
    "bee production": "arrow",
    "bending machine": "bending",
    "bio lab": "arrow_multiple",
    brewery: "arrow_multiple",
    "chemical reactor": "arrow_multiple",
    "circuit assembly line": "circuit_assembler",
    "cold trap": "sift",
    "component assembly line": "arrow",
    "distillation tower": "arrow_multiple",
    distillery: "arrow_multiple",
    "electric implosion compressor": "compress",
    electrolyzer: "extract",
    "electromagnetic polarizer": "magnet",
    "electromagnetic separator": "magnet",
    fermenter: "arrow_multiple",
    flocculation: "flocculation",
    "fluid heater": "arrow_multiple",
    "fluid solidifier": "arrow",
    "forming press": "compress",
    "gt.recipe.multiblockrockbreaker": "macerate",
    "high energy laser treatment": "uvtreatment",
    "large chemical reactor": "arrow_multiple",
    "matter amplifier": "arrow",
    milling: "arrow",
    "multiblock centrifuge": "extract",
    "multiblock electrolyzer": "extract",
    "multiblock mixer": "mixer",
    "nano forge": "assemble",
    "neutronium compressor": "compress",
    "oil cracker": "arrow_multiple",
    "pcb factory": "assemble",
    "precise assembler": "arrow_multiple",
    "quantum force transformer": "arrow_multiple",
    "reactor processing unit": "sift",
    "rock breaker": "macerate",
    "simple dust washer": "arrow_multiple",
    slicer: "slice",
    "temperature fluctuation": "water_plasma_heater",
    "tree growth simulator": "arrow",
    "zhuhai - fishing port": "fishing",
    assembler: "assemble",
    canner: "canner",
    centrifuge: "extract",
    "chemical bath": "bath",
    "circuit assembler": "circuit_assembler",
    clarifier: "clarifier",
    "coke oven": "sift",
    compressor: "compress",
    "cutting machine": "cut",
    dehydrator: "sift",
    extractor: "extract",
    extruder: "extrude",
    "fluid canner": "canner",
    "forge hammer": "hammer",
    lathe: "lathe",
    macerator: "macerate",
    mixer: "mixer",
    "ore washer": "bath",
    ozonation: "ozonation",
    "ph neutralization": "phneutralization",
    sifter: "sift",
    wiremill: "wiremill",
  };

  const exactMatch = exact[normalized];
  if (exactMatch) {
    return exactMatch;
  }

  if (normalized.includes("assembler")) return "assemble";
  if (normalized.includes("bath") || normalized.includes("washer")) return "bath";
  if (normalized.includes("bend")) return "bending";
  if (normalized.includes("cann")) return "canner";
  if (normalized.includes("compress")) return "compress";
  if (normalized.includes("cut")) return "cut";
  if (normalized.includes("extract")) return "extract";
  if (normalized.includes("extrud")) return "extrude";
  if (normalized.includes("hammer")) return "hammer";
  if (normalized.includes("lathe")) return "lathe";
  if (normalized.includes("macerat")) return "macerate";
  if (normalized.includes("mix")) return "mixer";
  if (normalized.includes("sift")) return "sift";
  if (normalized.includes("wire")) return "wiremill";

  return "arrow";
}

function resolveLayoutDefinition(recipeMap: string, recipe: Recipe): RecipeMapLayoutDefinition {
  const machineExact = findRecipeMapLayout(recipe.machineType);
  if (machineExact?.chrome === "native") return machineExact;

  const exact = findRecipeMapLayout(recipeMap);
  if (exact?.chrome === "native") return exact;

  const thaumcraft = inferThaumcraftLayoutDefinition(recipeMap, recipe);
  if (thaumcraft) return thaumcraft;
  if (exact && recipeMapMatches(recipeMap, "Blast Furnace")) return exact;

  if (recipeMapMatches(recipeMap, "Component Assembly Line")) {
    return COMPONENT_ASSEMBLY_LINE_LAYOUT;
  }

  if (matchesKnownRecipeMap(recipeMap, CRAFTING_TABLE_MAPS)) {
    return craftingTableLayout(recipe);
  }

  if (isPlainFurnaceRecipeMap(recipeMap)) {
    return furnaceLayout();
  }

  const exportedGrid = exportedGridLayout(recipe);
  if (exportedGrid) {
    return exact ? withMinimumSlotCapacity(exportedGrid, exact) : exportedGrid;
  }

  if (exact) return exact;

  if (matchesKnownRecipeMap(recipeMap, ASSEMBLY_LINE_MAPS)) {
    return {
      id: "assembly-line",
      maxItemInputs: 16,
      maxItemOutputs: 1,
      maxFluidInputs: 4,
      maxFluidOutputs: 0,
      itemInputPositions: (count) => gridPositions(count, 16, 8, 4),
      itemOutputPositions: (count) => (count > 0 ? [{ x: 142, y: 8 }] : []),
      fluidInputPositions: (count) => gridPositions(count, 106, 8, 1),
      progressBars: DEFAULT_PROGRESS_BARS,
    };
  }

  if (matchesKnownRecipeMap(recipeMap, FLUID_ONLY_MAPS)) {
    return {
      id: "fluid-only",
      maxItemInputs: 0,
      maxItemOutputs: 0,
      maxFluidInputs: Math.max(countKind(recipe.inputs, "fluid"), 1),
      maxFluidOutputs: Math.max(countKind(recipe.outputs, "fluid"), 1),
      fluidInputPositions: (count) => defaultItemInputPositions(count),
      fluidOutputPositions: (count) => defaultItemOutputPositions(count),
    };
  }

  if (matchesKnownRecipeMap(recipeMap, LARGE_NEI_MAPS) || needsLargeLayout(recipe)) {
    const maxItemInputs = Math.max(6, countKind(recipe.inputs, "item"));
    const maxItemOutputs = Math.max(6, countKind(recipe.outputs, "item"));
    const maxFluidInputs = Math.max(6, countKind(recipe.inputs, "fluid"));
    const maxFluidOutputs = Math.max(6, countKind(recipe.outputs, "fluid"));

    return {
      id: "large-nei",
      maxItemInputs,
      maxItemOutputs,
      maxFluidInputs,
      maxFluidOutputs,
      logo: { x: 80, y: 62 },
      canvas: largeCanvas(maxItemInputs, maxItemOutputs, maxFluidInputs, maxFluidOutputs),
      itemInputPositions: largeItemInputPositions,
      itemOutputPositions: largeItemOutputPositions,
      fluidInputPositions: largeFluidInputPositions,
      fluidOutputPositions: largeFluidOutputPositions,
      progressBars: DEFAULT_PROGRESS_BARS,
    };
  }

  return {
    id: "default",
  };
}

function inferThaumcraftLayoutDefinition(
  recipeMap: string,
  recipe: Pick<Recipe, "machineType" | "name" | "inputs" | "outputs" | "eut">,
): RecipeMapLayoutDefinition | undefined {
  const labels = [recipe.machineType, recipeMap, recipe.name].filter(Boolean);
  if (!labels.some(isThaumcraftLabel)) {
    return undefined;
  }

  for (const label of labels) {
    const inferred = inferThaumcraftLayoutFromLabel(label);
    if (inferred) {
      return inferred;
    }
  }

  const aspectInputs = countKind(recipe.inputs ?? [], "aspect");
  if (aspectInputs > 0 && (recipe.eut ?? 0) === 0 && (recipe.outputs ?? []).length > 0) {
    return THAUMCRAFT_INFUSION_LAYOUT;
  }

  return undefined;
}

function inferThaumcraftLayoutFromLabel(label: string): RecipeMapLayoutDefinition | undefined {
  const normalized = normalizeRecipeMapName(label);

  if (normalized.includes("shaped") && normalized.includes("arcane")) {
    return THAUMCRAFT_ARCANE_LAYOUT;
  }

  if (normalized.includes("shapeless") && normalized.includes("arcane")) {
    return {
      ...THAUMCRAFT_ARCANE_LAYOUT,
      id: "thaumcraft-shapeless-arcane",
      title: "Shapeless Arcane Crafting",
    };
  }

  if (normalized.includes("crafting") && normalized.includes("arcane")) {
    return THAUMCRAFT_ARCANE_LAYOUT;
  }

  if (normalized === "arcane infusion" || normalized.endsWith(" arcane infusion")) {
    return THAUMCRAFT_INFUSION_LAYOUT;
  }

  if (normalized === "thaumcraft infusion" || normalized.endsWith(" thaumcraft infusion")) {
    return THAUMCRAFT_INFUSION_LAYOUT;
  }

  if (normalized.includes("infusion")) {
    return THAUMCRAFT_INFUSION_LAYOUT;
  }

  if (normalized.includes("crucible")) {
    return THAUMCRAFT_CRUCIBLE_LAYOUT;
  }

  if (normalized.includes("essentia") || normalized.includes("alchemy furnace")) {
    return THAUMCRAFT_ESSENTIA_SMELTING_LAYOUT;
  }

  return undefined;
}

function isThaumcraftLabel(label: string): boolean {
  const normalized = normalizeRecipeMapName(label);
  return (
    normalized.includes("thaumcraft") ||
    normalized.includes("arcane") ||
    normalized.includes("essentia")
  );
}

function isPlainFurnaceRecipeMap(recipeMap: string): boolean {
  return normalizeRecipeMapName(recipeMap) === "furnace";
}

function craftingTableLayout(recipe: Recipe): RecipeMapLayoutDefinition {
  const shaped =
    (recipe.nei?.itemInputGrid?.width ?? 0) >= 3 || countKind(recipe.inputs, "item") > 4;

  return {
    id: shaped ? "shaped-crafting" : "shapeless-crafting",
    maxItemInputs: shaped ? 9 : Math.max(1, countKind(recipe.inputs, "item")),
    maxItemOutputs: 1,
    maxFluidInputs: 0,
    maxFluidOutputs: 0,
    itemInputPositions: (count) =>
      shaped ? gridPositions(count, 25, 8, 3, 3) : compactCraftingInputPositions(count),
    itemOutputPositions: (count) => (count > 0 ? [{ x: 124, y: 26 }] : []),
    progressBars: [{ x: 84, y: 26, width: 24, height: 17, direction: "right", texture: "arrow" }],
  };
}

function furnaceLayout(): RecipeMapLayoutDefinition {
  return {
    id: "furnace",
    maxItemInputs: 1,
    maxItemOutputs: 1,
    maxFluidInputs: 0,
    maxFluidOutputs: 0,
    itemInputPositions: (count) => (count > 0 ? [{ x: 52, y: 24 }] : []),
    itemOutputPositions: (count) => (count > 0 ? [{ x: 124, y: 24 }] : []),
    progressBars: [{ x: 78, y: 24, width: 24, height: 17, direction: "right", texture: "arrow" }],
  };
}

function compactCraftingInputPositions(count: number) {
  switch (count) {
    case 0:
      return [];
    case 1:
      return gridPositions(count, 61, 26, 1, 1);
    case 2:
      return gridPositions(count, 52, 26, 2, 1);
    case 3:
      return gridPositions(count, 43, 26, 3, 1);
    case 4:
      return gridPositions(count, 52, 17, 2, 2);
    default:
      return gridPositions(count, 43, 17, 3, 2);
  }
}

function findRecipeMapLayout(recipeMap: string): RecipeMapLayoutDefinition | undefined {
  return (
    RECIPE_MAP_LAYOUTS[recipeMap] ??
    Object.entries(RECIPE_MAP_LAYOUTS).find(([knownRecipeMap]) =>
      recipeMapMatches(recipeMap, knownRecipeMap),
    )?.[1]
  );
}

function matchesKnownRecipeMap(recipeMap: string, knownRecipeMaps: Set<string>): boolean {
  return [...knownRecipeMaps].some((knownRecipeMap) => recipeMapMatches(recipeMap, knownRecipeMap));
}

function recipeMapMatches(recipeMap: string, knownRecipeMap: string): boolean {
  const normalized = normalizeRecipeMapName(recipeMap);
  const known = normalizeRecipeMapName(knownRecipeMap);
  return normalized === known || normalized.includes(known);
}

function normalizeRecipeMapName(recipeMap: string): string {
  return recipeMap
    .toLowerCase()
    .replace(/\b(recipes?|recipe map|map)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function withMinimumSlotCapacity(
  definition: RecipeMapLayoutDefinition,
  minimum: RecipeMapLayoutDefinition,
): RecipeMapLayoutDefinition {
  return {
    ...definition,
    maxItemInputs: Math.max(definition.maxItemInputs ?? 0, minimum.maxItemInputs ?? 0),
    maxItemOutputs: Math.max(definition.maxItemOutputs ?? 0, minimum.maxItemOutputs ?? 0),
    maxFluidInputs: Math.max(definition.maxFluidInputs ?? 0, minimum.maxFluidInputs ?? 0),
    maxFluidOutputs: Math.max(definition.maxFluidOutputs ?? 0, minimum.maxFluidOutputs ?? 0),
  };
}

function exportedGridLayout(recipe: Recipe): RecipeMapLayoutDefinition | undefined {
  const nei = recipe.nei;
  if (
    !nei?.itemInputGrid &&
    !nei?.itemOutputGrid &&
    !nei?.fluidInputGrid &&
    !nei?.fluidOutputGrid
  ) {
    return undefined;
  }

  const itemInputWidth = nei.itemInputGrid?.width ?? 0;
  const itemInputHeight = nei.itemInputGrid?.height ?? 0;
  const itemOutputWidth = nei.itemOutputGrid?.width ?? 0;
  const itemOutputHeight = nei.itemOutputGrid?.height ?? 0;
  const fluidInputWidth = nei.fluidInputGrid?.width ?? 0;
  const fluidInputHeight = nei.fluidInputGrid?.height ?? 0;
  const fluidOutputWidth = nei.fluidOutputGrid?.width ?? 0;
  const fluidOutputHeight = nei.fluidOutputGrid?.height ?? 0;
  const inputItemRows = Math.max(itemInputHeight, itemOutputHeight);
  const outputItemRows = inputItemRows;

  return {
    id: "exported-nei-grid",
    maxItemInputs: Math.max(1, itemInputWidth * itemInputHeight),
    maxItemOutputs: Math.max(1, itemOutputWidth * itemOutputHeight),
    maxFluidInputs: fluidInputWidth * fluidInputHeight,
    maxFluidOutputs: fluidOutputWidth * fluidOutputHeight,
    logo: { x: 80, y: 62 },
    canvas: largeCanvas(
      itemInputWidth * itemInputHeight,
      itemOutputWidth * itemOutputHeight,
      fluidInputWidth * fluidInputHeight,
      fluidOutputWidth * fluidOutputHeight,
    ),
    itemInputPositions: (count) =>
      fixedOrGrowingGrid(count, 16, 8, Math.max(itemInputWidth, 1), itemInputHeight),
    itemOutputPositions: (count) =>
      fixedOrGrowingGrid(count, 106, 8, Math.max(itemOutputWidth, 1), itemOutputHeight),
    fluidInputPositions: (count) =>
      fixedOrGrowingGrid(
        count,
        16,
        8 + inputItemRows * SLOT_SIZE,
        Math.max(fluidInputWidth, 1),
        fluidInputHeight,
      ),
    fluidOutputPositions: (count) =>
      fixedOrGrowingGrid(
        count,
        106,
        8 + outputItemRows * SLOT_SIZE,
        Math.max(fluidOutputWidth, 1),
        fluidOutputHeight,
      ),
    progressBars: DEFAULT_PROGRESS_BARS,
  };
}

function fixedOrGrowingGrid(
  count: number,
  xOrigin: number,
  yOrigin: number,
  width: number,
  declaredHeight: number,
) {
  const rowsNeeded = count > 0 ? Math.ceil(count / Math.max(width, 1)) : 0;
  return gridPositions(
    count,
    xOrigin,
    yOrigin,
    Math.max(width, 1),
    Math.max(declaredHeight, rowsNeeded),
  );
}

function defaultItemInputPositions(count: number) {
  switch (count) {
    case 0:
      return [];
    case 1:
      return gridPositions(count, 52, 24, 1, 1);
    case 2:
      return gridPositions(count, 34, 24, 2, 1);
    case 3:
      return gridPositions(count, 16, 24, 3, 1);
    case 4:
      return gridPositions(count, 34, 15, 2, 2);
    case 5:
    case 6:
      return gridPositions(count, 16, 15, 3, 2);
    default:
      return gridPositions(count, 16, 6, 3);
  }
}

function defaultItemOutputPositions(count: number) {
  switch (count) {
    case 0:
      return [];
    case 1:
      return gridPositions(count, 106, 24, 1, 1);
    case 2:
      return gridPositions(count, 106, 24, 2, 1);
    case 3:
      return gridPositions(count, 106, 24, 3, 1);
    case 4:
      return gridPositions(count, 106, 15, 2, 2);
    case 5:
    case 6:
      return gridPositions(count, 106, 15, 3, 2);
    default:
      return gridPositions(count, 106, 6, 3);
  }
}

function defaultFluidInputPositions(count: number) {
  const results: NeiPoint[] = [];
  const base = Math.max(70 - count * SLOT_SIZE, 16);
  for (let i = 0; i < count; i += 1) {
    results.push({ x: base + i * SLOT_SIZE, y: 62 });
  }
  return results;
}

function defaultFluidOutputPositions(count: number) {
  const results: NeiPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    results.push({ x: 106 + i * SLOT_SIZE, y: 62 });
  }
  return results;
}

function largeItemInputPositions(count: number) {
  return gridPositions(count, 16, 8, 3);
}

function largeItemOutputPositions(count: number) {
  return gridPositions(count, 106, 8, 3);
}

function largeFluidInputPositions(count: number, definition: RequiredRecipeMapLayoutDefinition) {
  return gridPositions(count, 16, 8 + getLargeItemRowCount(definition) * SLOT_SIZE, 3);
}

function largeFluidOutputPositions(count: number, definition: RequiredRecipeMapLayoutDefinition) {
  return gridPositions(count, 106, 8 + getLargeItemRowCount(definition) * SLOT_SIZE, 3);
}

function largeCanvas(
  maxItemInputs: number,
  maxItemOutputs: number,
  maxFluidInputs: number,
  maxFluidOutputs: number,
): NeiSize {
  const itemRows =
    Math.max(maxItemInputs, maxItemOutputs) > 0
      ? Math.floor((Math.max(maxItemInputs, maxItemOutputs) - 1) / 3) + 1
      : 0;
  const fluidRows =
    Math.max(maxFluidInputs, maxFluidOutputs) > 0
      ? Math.floor((Math.max(maxFluidInputs, maxFluidOutputs) - 1) / 3) + 1
      : 0;

  return {
    width: 170,
    height: 82 + Math.max(itemRows + fluidRows - 4, 0) * SLOT_SIZE,
  };
}

function getLargeItemRowCount(definition: RequiredRecipeMapLayoutDefinition) {
  return Math.floor((Math.max(definition.maxItemInputs, definition.maxItemOutputs) - 1) / 3) + 1;
}

function gridPositions(
  totalCount: number,
  xOrigin: number,
  yOrigin: number,
  xDirMaxCount: number,
  yDirMaxCount = 100,
): NeiPoint[] {
  const results: NeiPoint[] = [];
  let count = 0;

  for (let y = 0; y < yDirMaxCount; y += 1) {
    for (let x = 0; x < xDirMaxCount; x += 1) {
      if (count >= totalCount) {
        return results;
      }
      results.push({ x: xOrigin + x * SLOT_SIZE, y: yOrigin + y * SLOT_SIZE });
      count += 1;
    }
  }

  return results;
}

function aspectPositions(
  totalCount: number,
  side: NeiSlotSide,
  definition: RequiredRecipeMapLayoutDefinition,
): NeiPoint[] {
  if (totalCount <= 0) {
    return [];
  }
  const y =
    8 + Math.ceil(Math.max(definition.maxItemInputs, definition.maxItemOutputs, 1) / 3) * SLOT_SIZE;
  const x = side === "input" ? 8 : 98;
  return gridPositions(totalCount, x, y, 4, 3);
}

function withResourceIndexes(resources: ResourceAmount[], kind: ResourceKind) {
  return resources
    .map((resource, index) => ({ resource, resourceIndex: index }))
    .filter((entry) => entry.resource.kind === kind);
}

function positionFrames(
  resources: Array<{ resource: ResourceAmount; resourceIndex: number }>,
  side: NeiSlotSide,
  kind: ResourceKind,
  positions: NeiPoint[],
): NeiSlotFrame[] {
  return positions.map((position, index) => ({
    side,
    kind,
    resource: resources[index]?.resource,
    resourceIndex: resources[index]?.resourceIndex,
    slotIndex: index,
    x: position.x,
    y: position.y,
  }));
}

function withRequiredMaxes(
  definition: RecipeMapLayoutDefinition,
  recipe: Recipe,
): RequiredRecipeMapLayoutDefinition {
  const recipeMap = recipe.source?.recipeMap ?? recipe.machineType;
  const machineDefinition = withMachineMaxes(definition, recipe, recipeMap);

  return {
    maxItemInputs: Math.max(machineDefinition.maxItemInputs, countKind(recipe.inputs, "item")),
    maxItemOutputs: Math.max(machineDefinition.maxItemOutputs, countKind(recipe.outputs, "item")),
    maxFluidInputs: Math.max(machineDefinition.maxFluidInputs, countKind(recipe.inputs, "fluid")),
    maxFluidOutputs: Math.max(
      machineDefinition.maxFluidOutputs,
      countKind(recipe.outputs, "fluid"),
    ),
  };
}

function withMachineMaxes(
  definition: RecipeMapLayoutDefinition,
  recipe: Recipe,
  recipeMap: string,
): RequiredRecipeMapLayoutDefinition {
  const capacity = mergeRecipeMapSlotCapacity(
    recipe.nei?.slotCapacity,
    knownRecipeMapSlotCapacity(recipeMap),
  );

  return {
    maxItemInputs: Math.max(definition.maxItemInputs ?? 1, capacity?.maxItemInputs ?? 0),
    maxItemOutputs: Math.max(definition.maxItemOutputs ?? 1, capacity?.maxItemOutputs ?? 0),
    maxFluidInputs: Math.max(definition.maxFluidInputs ?? 0, capacity?.maxFluidInputs ?? 0),
    maxFluidOutputs: Math.max(definition.maxFluidOutputs ?? 0, capacity?.maxFluidOutputs ?? 0),
  };
}

function buildOverflowGroups(
  definition: RecipeMapLayoutDefinition,
  recipe: Recipe,
  counts: {
    itemInputs: number;
    itemOutputs: number;
    fluidInputs: number;
    fluidOutputs: number;
    aspectInputs: number;
    aspectOutputs: number;
  },
): NeiOverflowGroup[] {
  const recipeMap = recipe.source?.recipeMap ?? recipe.machineType;
  const capacity = mergeRecipeMapSlotCapacity(
    recipe.nei?.slotCapacity,
    knownRecipeMapSlotCapacity(recipeMap),
  );

  return [
    overflowGroup(
      "input",
      "item",
      knownCapacity(definition.maxItemInputs, capacity?.maxItemInputs),
      counts.itemInputs,
    ),
    overflowGroup(
      "output",
      "item",
      knownCapacity(definition.maxItemOutputs, capacity?.maxItemOutputs),
      counts.itemOutputs,
    ),
    overflowGroup(
      "input",
      "fluid",
      knownCapacity(definition.maxFluidInputs, capacity?.maxFluidInputs),
      counts.fluidInputs,
    ),
    overflowGroup(
      "output",
      "fluid",
      knownCapacity(definition.maxFluidOutputs, capacity?.maxFluidOutputs),
      counts.fluidOutputs,
    ),
    overflowGroup("input", "aspect", 12, counts.aspectInputs),
    overflowGroup("output", "aspect", 12, counts.aspectOutputs),
  ].filter((group): group is NeiOverflowGroup => Boolean(group));
}

function knownCapacity(definitionCapacity?: number, enrichedCapacity?: number) {
  const capacities = [definitionCapacity, enrichedCapacity].filter(
    (value): value is number => typeof value === "number",
  );
  return capacities.length > 0 ? Math.max(...capacities) : 0;
}

function overflowGroup(
  side: NeiSlotSide,
  kind: ResourceKind,
  capacity: number,
  resourceCount: number,
): NeiOverflowGroup | undefined {
  if (capacity <= 0 || resourceCount <= capacity) {
    return undefined;
  }

  return { side, kind, capacity, resourceCount };
}

function growCanvas(
  canvas: NeiSize,
  frames: NeiSlotFrame[],
  decorations: NeiDecoration[] = [],
): NeiSize {
  const maxSlotRight = Math.max(0, ...frames.map((frame) => frame.x + SLOT_SIZE + 1));
  const maxSlotBottom = Math.max(0, ...frames.map((frame) => frame.y + SLOT_SIZE + 2));
  const maxDecorationRight = Math.max(
    0,
    ...decorations.map((decoration) => decoration.x + decoration.width),
  );
  const maxDecorationBottom = Math.max(
    0,
    ...decorations.map((decoration) => decoration.y + decoration.height),
  );
  return {
    width: Math.max(canvas.width, 170, maxSlotRight, maxDecorationRight),
    height: Math.max(canvas.height, maxSlotBottom + 2, maxDecorationBottom),
  };
}

function thaumcraftOverlayDecoration(
  x: number,
  y: number,
  sourceX: number,
  sourceY: number,
  sourceWidth: number,
  sourceHeight: number,
  scale: number,
  opacity?: number,
): NeiTextureDecoration {
  return {
    kind: "texture",
    x,
    y,
    width: sourceWidth * scale,
    height: sourceHeight * scale,
    imagePath: THAUMCRAFT_OVERLAY_PATH,
    textureWidth: THAUMCRAFT_OVERLAY_SIZE,
    textureHeight: THAUMCRAFT_OVERLAY_SIZE,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    opacity,
  };
}

function countKind(resources: ResourceAmount[], kind: ResourceKind) {
  return resources.filter((resource) => resource.kind === kind).length;
}

function needsLargeLayout(recipe: Recipe) {
  return (
    countKind(recipe.inputs, "item") > 6 ||
    countKind(recipe.outputs, "item") > 6 ||
    countKind(recipe.inputs, "fluid") > 3 ||
    countKind(recipe.outputs, "fluid") > 3 ||
    countKind(recipe.inputs, "aspect") > 6 ||
    countKind(recipe.outputs, "aspect") > 6
  );
}
