/**
 * What the search box understands. A typed word widens into weighted variants
 * (its singular, a known nickname, a likely typo, a few related words scored
 * well below a real match), so plurals, nicknames and typos still find things.
 *
 * Pure and dependency free on purpose: the server runs this over the dataset
 * index and the sidebar over the cards on the board, and both must agree on
 * what "matches" means.
 */

/** A spelling one typed word also stands for. Several tokens = a nickname. */
export interface SearchTermVariant {
  tokens: string[];
  /** 1 = exactly what was typed. Below that, a spelling we stood in for it. */
  weight: number;
}

export interface SearchTerm {
  /** The word as typed, normalized. */
  raw: string;
  variants: SearchTermVariant[];
  /** Long enough that guessing at a typo is worth it. */
  correctable: boolean;
}

/** A word we stood in for, for "showing results for ..." lines. */
export interface SearchCorrection {
  from: string;
  to: string;
}

export interface SearchQuery {
  /** The whole line, normalized: what the phrase bonuses compare against. */
  text: string;
  terms: SearchTerm[];
  corrections: SearchCorrection[];
}

/**
 * One thing being searched, split by where the words came from. A word in the
 * display name counts for much more than the same word in a registry id.
 */
export interface SearchEntryFields {
  /** Normalized display name, for whole-phrase bonuses. */
  nameText?: string;
  /** Display name tokens. */
  name?: string[];
  /** Registry id, mod id, ore dictionary group. */
  id?: string[];
  /** Tooltip and description lines. */
  text?: string[];
}

const PLURAL_WEIGHT = 0.96;
const ALIAS_WEIGHT = 0.85;
const RELATED_WEIGHT = 0.6;
const CORRECTION_WEIGHT = 0.55;
const SPLIT_WEIGHT = 0.65;

const FIELD_WEIGHT = { name: 1, id: 0.4, text: 0.32 } as const;
const EXACT_PRECISION = 1;
const PREFIX_PRECISION = 0.78;
const CONTAINS_PRECISION = 0.5;

const NAME_EQUALS_BONUS = 8;
const NAME_STARTS_BONUS = 4;
const NAME_CONTAINS_BONUS = 1.5;

/** Below this a word is too short for a typo guess to mean anything. */
export const MIN_CORRECTABLE_LENGTH = 4;
/** Trigram narrowing needs three characters to work with. */
export const MIN_INDEXABLE_LENGTH = 3;

/**
 * Nicknames the community uses that the dataset never spells out. One
 * direction only ("ebf" finds Electric Blast Furnace, "electric" never
 * expands to "ebf"), and only for unambiguous short forms.
 */
const TERM_ALIASES: Record<string, string[]> = {
  ebf: ["electric", "blast", "furnace"],
  bbf: ["bricked", "blast", "furnace"],
  lcr: ["large", "chemical", "reactor"],
  cal: ["circuit", "assembly", "line"],
  tgs: ["tree", "growth", "simulator"],
  eig: ["extreme", "industrial", "greenhouse"],
  qft: ["quantum", "force", "transformer"],
  eoh: ["eye", "of", "harmony"],
  dtpf: ["dimensionally", "transcendent", "plasma", "forge"],
  pcb: ["printed", "circuit", "board"],
  lpf: ["large", "processing", "factory"],
  ia: ["industrial", "apiary"],
  ic2: ["industrialcraft"],
  ae: ["applied", "energistics"],
  gt: ["gregtech"],
  bw: ["bartworks"],
  tc: ["thaumcraft"],
  tf: ["twilightforest"],
  nc: ["nuclearcraft"],
  hv: ["high", "voltage"],
  mv: ["medium", "voltage"],
  lv: ["low", "voltage"],
  ev: ["extreme", "voltage"],
  iv: ["insane", "voltage"],
};

/**
 * Words that mean each other closely enough to widen a search, scored well
 * below a real match so they fill the tail of the results rather than the head.
 */
const RELATED_TERMS: Record<string, string[]> = {
  wood: ["log", "plank"],
  log: ["wood"],
  plank: ["wood"],
  plant: ["crop", "farm", "seed"],
  crop: ["plant", "seed"],
  seed: ["crop", "plant"],
  bee: ["apiary", "comb", "honey"],
  honeycomb: ["comb"],
  tree: ["log", "sapling", "wood"],
  fluid: ["liquid"],
  liquid: ["fluid"],
  gem: ["crystal"],
  crystal: ["gem"],
  dust: ["powder"],
  powder: ["dust"],
  circuit: ["chip"],
  fuel: ["gas", "diesel"],
  stick: ["rod"],
  rod: ["stick"],
};

/** Accents split off by NFKD, so "Créosote" and "Creosote" are one word. */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKD").replace(COMBINING_MARKS, "").trim().toLowerCase();
}

export function splitSearchTokens(value: string): string[] {
  return normalizeSearchText(value)
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

/**
 * The singular of a typed word, when it looks plural. Only this direction is
 * needed: a typed "log" already prefix-matches "logs", but "logs" never
 * matches "log".
 */
export function singularizeSearchToken(token: string): string | undefined {
  if (token.length < 4 || !token.endsWith("s") || token.endsWith("ss")) {
    return undefined;
  }
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith("ses") || token.endsWith("xes") || token.endsWith("zes")) {
    return token.slice(0, -2);
  }
  if (token.endsWith("shes") || token.endsWith("ches")) {
    return token.slice(0, -2);
  }
  return token.slice(0, -1);
}

export function parseSearchQuery(value: string): SearchQuery {
  const text = normalizeSearchText(value);
  return {
    text,
    terms: splitSearchTokens(text).map(toSearchTerm),
    corrections: [],
  };
}

function toSearchTerm(raw: string): SearchTerm {
  const variants: SearchTermVariant[] = [{ tokens: [raw], weight: 1 }];
  const singular = singularizeSearchToken(raw);
  if (singular) {
    addVariant(variants, { tokens: [singular], weight: PLURAL_WEIGHT });
  }

  for (const key of singular ? [raw, singular] : [raw]) {
    const alias = TERM_ALIASES[key];
    if (alias) {
      addVariant(variants, { tokens: alias, weight: ALIAS_WEIGHT });
    }
    for (const related of RELATED_TERMS[key] ?? []) {
      addVariant(variants, { tokens: [related], weight: RELATED_WEIGHT });
    }
  }

  return { raw, variants, correctable: raw.length >= MIN_CORRECTABLE_LENGTH };
}

/**
 * The same query, with likely spellings of a mistyped word added as extra
 * variants rather than replacements, so a real word still finds its own
 * matches first.
 */
export function withSearchCorrections(
  query: SearchQuery,
  suggest: (term: SearchTerm) => string[][],
): SearchQuery {
  const corrections: SearchCorrection[] = [...query.corrections];
  let changed = false;
  const terms = query.terms.map((term) => {
    if (!term.correctable) {
      return term;
    }

    const suggestions = suggest(term);
    if (suggestions.length === 0) {
      return term;
    }

    changed = true;
    const variants = [...term.variants];
    for (const tokens of suggestions) {
      addVariant(variants, {
        tokens,
        weight: tokens.length > 1 ? SPLIT_WEIGHT : CORRECTION_WEIGHT,
      });
    }
    corrections.push({ from: term.raw, to: suggestions[0].join(" ") });
    return { ...term, variants };
  });

  return changed ? { ...query, terms, corrections } : query;
}

function addVariant(variants: SearchTermVariant[], variant: SearchTermVariant) {
  const key = variant.tokens.join(" ");
  if (variants.some((entry) => entry.tokens.join(" ") === key)) {
    return;
  }
  variants.push(variant);
}

export interface SearchMatchOptions {
  /**
   * Accept an entry that only answers SOME of the typed words, ranked by how
   * many it answers. The last resort when requiring all of them found nothing.
   */
  partial?: boolean;
}

/** What each answered word is worth on its own, before how well it answered. */
const PARTIAL_TERM_BONUS = 1;

/**
 * How well one thing answers the query, or undefined when it does not. Every
 * typed word must be found somewhere (AND) unless `partial` is set.
 */
export function matchSearchEntry(
  query: SearchQuery,
  entry: SearchEntryFields,
  options: SearchMatchOptions = {},
): number | undefined {
  if (query.terms.length === 0) {
    return 0;
  }

  let score = 0;
  let matched = 0;
  for (const term of query.terms) {
    const termScore = scoreSearchTerm(term, entry);
    if (termScore <= 0) {
      if (!options.partial) {
        return undefined;
      }
      continue;
    }
    matched += 1;
    score += termScore;
  }

  if (matched === 0) {
    return undefined;
  }

  if (options.partial) {
    score += matched * PARTIAL_TERM_BONUS;
  }

  // The whole line, not the words in it: an exact name beats a name that merely
  // contains every word somewhere.
  const name = entry.nameText;
  if (name && query.text) {
    if (name === query.text) {
      score += NAME_EQUALS_BONUS;
    } else if (name.startsWith(query.text)) {
      score += NAME_STARTS_BONUS;
    } else if (name.includes(query.text)) {
      score += NAME_CONTAINS_BONUS;
    }
  }

  return score;
}

export function searchQueryMatches(query: SearchQuery, entry: SearchEntryFields): boolean {
  return matchSearchEntry(query, entry) !== undefined;
}

/**
 * The same match against a corpus with no fields of its own, one flat bag of
 * words per entry (which is what the recipe index stores).
 *
 * The scratch object is reused deliberately: this runs once per candidate
 * recipe (hundreds of thousands), and scoring is synchronous, so nothing can
 * observe it between calls.
 */
const flatEntry: SearchEntryFields = { name: [] };

export function matchSearchTokens(
  query: SearchQuery,
  tokens: string[],
  options: SearchMatchOptions = {},
): number | undefined {
  flatEntry.name = tokens;
  return matchSearchEntry(query, flatEntry, options);
}

function scoreSearchTerm(term: SearchTerm, entry: SearchEntryFields): number {
  let best = 0;
  for (const variant of term.variants) {
    if (variant.weight <= best) {
      // Even a perfect match on this spelling could not beat what we have.
      continue;
    }
    const precision = scoreVariant(variant, entry);
    if (precision > 0) {
      best = Math.max(best, precision * variant.weight);
    }
  }
  return best;
}

function scoreVariant(variant: SearchTermVariant, entry: SearchEntryFields): number {
  // A nickname is only a match when every word of what it stands for is there,
  // and it is worth no more than its weakest word.
  let weakest = Number.POSITIVE_INFINITY;
  for (const token of variant.tokens) {
    const precision = Math.max(
      scoreToken(entry.name, token) * FIELD_WEIGHT.name,
      scoreToken(entry.id, token) * FIELD_WEIGHT.id,
      scoreToken(entry.text, token) * FIELD_WEIGHT.text,
    );
    if (precision <= 0) {
      return 0;
    }
    weakest = Math.min(weakest, precision);
  }
  return Number.isFinite(weakest) ? weakest : 0;
}

function scoreToken(tokens: string[] | undefined, token: string): number {
  if (!tokens?.length) {
    return 0;
  }

  let best = 0;
  for (const entryToken of tokens) {
    if (entryToken === token) {
      return EXACT_PRECISION;
    }
    if (entryToken.startsWith(token)) {
      best = PREFIX_PRECISION;
    } else if (best < CONTAINS_PRECISION && entryToken.includes(token)) {
      best = CONTAINS_PRECISION;
    }
  }
  return best;
}

/** Every token any variant could need, for trigram narrowing. */
export function searchQueryIndexableTerms(query: SearchQuery): string[][][] {
  const terms: string[][][] = [];
  for (const term of query.terms) {
    const variants = term.variants.filter((variant) =>
      variant.tokens.every((token) => token.length >= MIN_INDEXABLE_LENGTH),
    );
    // One variant too short to index means this word could match anything, so
    // it cannot narrow the candidate set for the others.
    if (variants.length !== term.variants.length || variants.length === 0) {
      continue;
    }
    terms.push(variants.map((variant) => variant.tokens));
  }
  return terms;
}
