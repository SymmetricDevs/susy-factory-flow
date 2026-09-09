/**
 * Points two machines at each other's rendered icon in a dataset that is
 * ALREADY BUILT, so a mis-named render can be corrected without paying for
 * the Minecraft export again. normalize-oracle-export.mjs does the same swap
 * (SWAPPED_RENDERED_ICON_SLUGS) for every rebuild from here on; this is the
 * patch for the datasets that were built before it.
 *
 * It exchanges the iconPath and dominantColor of the two machines wherever
 * they appear - the resource index, the machine/map icon tables, the recipe
 * indexes and the shards - and never touches the PNGs themselves: a texture
 * URL is served immutable, so overwriting one in place would leave every
 * browser that already fetched it holding the old picture for good.
 *
 * Usage: node swap-rendered-icons.mjs <dataset-dir> [slugA:slugB ...]
 *   node tools/dataset-pipeline/scripts/swap-rendered-icons.mjs \
 *     public/datasets/gtnh/local-2.9.0-beta-2
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const datasetDir = process.argv[2];
const pairs = (process.argv.slice(3).length > 0
  ? process.argv.slice(3)
  : ["industrial_coke_oven:industrial_electrolyzer"]
).map((pair) => {
  const [left, right] = pair.split(":");
  if (!left || !right) {
    throw new Error(`Expected a slugA:slugB pair, got "${pair}".`);
  }
  return [left, right];
});

if (!datasetDir || !existsSync(datasetDir)) {
  throw new Error("Usage: swap-rendered-icons.mjs <dataset-dir> [slugA:slugB ...]");
}

const slugOf = (iconPath) =>
  path
    .basename(String(iconPath ?? ""))
    .replace(/-[0-9a-f]+\.png$/i, "");

/**
 * slug -> the icon every resource under it should wear instead. Built from
 * the dataset's own resource index, so the swap uses the icons that are
 * really published rather than guessing a file name.
 */
const replacement = new Map();
const resourceIndexPath = path.join(datasetDir, "resource-index.json.gz");
const resourceIndex = await readJsonGz(resourceIndexPath);
const iconBySlug = new Map();
for (const resource of resourceIndex.resources ?? []) {
  const slug = slugOf(resource.iconPath);
  if (resource.iconPath && !iconBySlug.has(slug)) {
    iconBySlug.set(slug, {
      iconPath: resource.iconPath,
      dominantColor: resource.dominantColor,
    });
  }
}
for (const [left, right] of pairs) {
  const leftIcon = iconBySlug.get(left);
  const rightIcon = iconBySlug.get(right);
  if (!leftIcon || !rightIcon) {
    throw new Error(`Dataset has no rendered icon for "${!leftIcon ? left : right}".`);
  }
  replacement.set(left, rightIcon);
  replacement.set(right, leftIcon);
  console.log(`Swapping ${left} <-> ${right}`);
}

let swapped = 0;

function applySwap(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      applySwap(entry);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  const icon = typeof value.iconPath === "string" ? replacement.get(slugOf(value.iconPath)) : undefined;
  if (icon) {
    value.iconPath = icon.iconPath;
    if (icon.dominantColor) {
      value.dominantColor = icon.dominantColor;
    }
    swapped += 1;
  }
  for (const entry of Object.values(value)) {
    applySwap(entry);
  }
}

const targets = [
  resourceIndexPath,
  path.join(datasetDir, "recipe-index.json.gz"),
  path.join(datasetDir, "recipe-lookup-index.json.gz"),
  ...(existsSync(path.join(datasetDir, "recipes-shards"))
    ? (await fs.readdir(path.join(datasetDir, "recipes-shards")))
        .filter((file) => file.endsWith(".json.gz"))
        .map((file) => path.join(datasetDir, "recipes-shards", file))
    : []),
];

for (const target of targets) {
  if (!existsSync(target)) {
    continue;
  }
  const before = swapped;
  const json = target === resourceIndexPath ? resourceIndex : await readJsonGz(target);
  applySwap(json);
  if (swapped === before) {
    continue;
  }
  await writeJsonGz(target, json);
  console.log(`  ${path.relative(datasetDir, target)}: ${swapped - before} icon(s)`);
}

console.log(`Swapped ${swapped} icon reference(s).`);
console.log(
  "recipes.json.gz is left alone: it is the pipeline's own build input, never served, and a rebuild regenerates it with the swap already applied.",
);

async function readJsonGz(filePath) {
  return JSON.parse(zlib.gunzipSync(await fs.readFile(filePath)).toString("utf8"));
}

async function writeJsonGz(filePath, json) {
  await fs.writeFile(filePath, zlib.gzipSync(Buffer.from(JSON.stringify(json)), { level: 9 }));
}
