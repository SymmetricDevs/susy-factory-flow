import { normalizeProjectFuelProfiles } from "../model/fuels";
import { factoryProjectSchema } from "../model/schemas";
import type { FactoryProject } from "../model/types";
import { isPowerRecipe } from "../power/power-recipe";
import { isRestorableRecipe } from "../datasets/restorable-recipes";
import { FactoryJsonError, parseFactoryProjectJson } from "./factory-json";

/**
 * A PLAN CODE: the whole plan as one line of text, for sharing without an
 * account. UI copy never says "code": the plan bar's "Copy plan" puts a LINK
 * with the code after `#p=` on the clipboard, and "Paste a copied plan"
 * accepts the link or the bare code.
 *
 * The plan's JSON, deflated, in URL-safe base64. Nothing goes to a server;
 * the fragment after `#` never leaves the browser. GregTech overclock tables
 * are left out (see `withoutRuntimeTables`). Codes still run to thousands of
 * characters, too long for a Discord message.
 */

/** The code's first characters: what it is, and which way it was packed. */
const CODE_PREFIX = "gtnh1.";

/**
 * Where a code sits in a link: `https://gtnhplanner.com/#p=<code>`. Not
 * "plan": `?plan=` is already a community post's link.
 */
export const PLAN_CODE_HASH_KEY = "p";

/**
 * The plan without the GregTech overclock tables the dataset will put back
 * when it lands on a board (`recipesToRefresh`), about half a big plan. A
 * table is left out only when this page has seen the dataset carry one for
 * that id (`isRestorableRecipe`); otherwise the stored table is the only copy
 * and it travels. Power recipes (made here, not by the dataset) and the small
 * bee and crop tables stay whole. Used for copied plans and account sync.
 */
export function withoutRuntimeTables(
  project: FactoryProject,
  canRestore: (recipeId: string) => boolean = isRestorableRecipe,
): FactoryProject {
  return {
    ...project,
    recipes: project.recipes.map((recipe) => {
      if (
        isPowerRecipe(recipe) ||
        !recipe.runtimeCalculation?.sourceKind.startsWith("gregtech-") ||
        !canRestore(recipe.id)
      ) {
        return recipe;
      }
      const { runtimeCalculation, ...rest } = recipe;
      void runtimeCalculation;
      return rest;
    }),
  };
}

export async function encodePlanCode(project: FactoryProject): Promise<string> {
  const plan = factoryProjectSchema.parse(normalizeProjectFuelProfiles(project));
  // A code is a copy, never the post: whoever opens it gets a plan of their
  // own, not a link to the sender's community setup.
  const { communityPlanId, ...metadata } = plan.metadata ?? {};
  void communityPlanId;
  const slim = withoutRuntimeTables({ ...plan, metadata });
  const packed = await pipeThrough(
    new TextEncoder().encode(JSON.stringify(slim)),
    new CompressionStream("deflate-raw"),
  );
  return `${CODE_PREFIX}${toBase64Url(packed)}`;
}

/** The link that opens a code: this site, with the code after `#p=`. */
export function planCodeLink(code: string, origin: string): string {
  return `${origin}/#${PLAN_CODE_HASH_KEY}=${code}`;
}

/** The code in an address fragment (`#p=...`), if there is one. */
export function readPlanCodeFromHash(hash: string): string | undefined {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const key = `${PLAN_CODE_HASH_KEY}=`;
  return fragment.startsWith(key) ? fragment.slice(key.length) : undefined;
}

/**
 * The plan in a code, a link carrying one, or either with stray whitespace
 * or line breaks from a chat window. Anything else is refused in words a
 * player can act on.
 */
export async function decodePlanCode(text: string): Promise<FactoryProject> {
  const compact = text.replace(/\s+/g, "");
  const hashAt = compact.indexOf("#");
  const code = (hashAt >= 0 ? readPlanCodeFromHash(compact.slice(hashAt)) : undefined) ?? compact;
  if (!code.startsWith(CODE_PREFIX)) {
    throw new FactoryJsonError(
      "That is not a copied plan. Use Copy plan on the plan bar to make one.",
    );
  }
  let json: string;
  try {
    const bytes = fromBase64Url(code.slice(CODE_PREFIX.length));
    const unpacked = await pipeThrough(bytes, new DecompressionStream("deflate-raw"));
    json = new TextDecoder().decode(unpacked);
  } catch {
    throw new FactoryJsonError(
      "That copied plan is cut short or damaged. Copy it again, all of it.",
    );
  }
  return parseFactoryProjectJson(json);
}

async function pipeThrough(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  // In chunks: spreading a big array into fromCharCode overflows the stack.
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) {
    throw new Error("not base64url");
  }
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
