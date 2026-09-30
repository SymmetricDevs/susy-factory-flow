/**
 * The indexes that keep search instant on a dataset this size:
 *
 * - A trigram index over every entry, which answers "which entries could
 *   possibly contain this word" without reading them. It narrows, it never
 *   decides: the match itself is `matchSearchEntry`.
 * - A vocabulary of display-name words that typos are corrected against. The
 *   whole corpus would offer registry ids and NBT fragments as spellings.
 */

import {
  MIN_INDEXABLE_LENGTH,
  type SearchQuery,
  type SearchTerm,
  searchQueryIndexableTerms,
  splitSearchTokens,
  withSearchCorrections,
} from "./text-search";

export interface TextSearchIndex {
  tokensByEntry: string[][];
  trigramToEntries: Map<string, number[]>;
}

export interface SearchVocabulary {
  tokens: string[];
  /** How many names each word appears in: the common word is the likely fix. */
  weights: number[];
  /** Sorted, so "is this the start of a real word" is a bisect. */
  sortedTokens: string[];
  tokenSet: Set<string>;
  trigramToTokens: Map<string, number[]>;
}

/** How far off a word may be before the guess stops being a guess. */
function maxCorrectionDistance(token: string): number {
  if (token.length < 4) {
    return 0;
  }
  return token.length >= 8 ? 2 : 1;
}

/**
 * How much of the word's shape has to survive for a candidate to be worth an
 * edit-distance check. Deliberately low: one wrong letter mid-word ("vaccum")
 * leaves only a quarter of its trigrams. The edit distance is what decides.
 */
const CORRECTION_TRIGRAM_OVERLAP = 0.2;
const MAX_CORRECTION_CANDIDATES = 3;
const MAX_VOCABULARY_TOKEN_LENGTH = 24;
/** Fewer hits than this and the strict reading of the query has not answered. */
const MIN_CONFIDENT_MATCHES = 3;

export function buildTextSearchIndex(
  searchText: string[],
  entryIndexes: number[],
): TextSearchIndex {
  const tokensByEntry: string[][] = [];
  for (const entryIndex of entryIndexes) {
    tokensByEntry[entryIndex] = [...new Set(splitSearchTokens(searchText[entryIndex] ?? ""))];
  }
  return buildTokenSearchIndex(tokensByEntry, entryIndexes);
}

/** The same index over entries already split into words. */
export function buildTokenSearchIndex(
  tokensByEntry: string[][],
  entryIndexes: number[],
): TextSearchIndex {
  const trigramToEntries = new Map<string, number[]>();

  for (const entryIndex of entryIndexes) {
    const tokens = tokensByEntry[entryIndex] ?? [];
    const entryTrigrams = new Set<string>();
    for (const token of tokens) {
      for (const trigram of getTokenTrigrams(token)) {
        entryTrigrams.add(trigram);
      }
    }

    for (const trigram of entryTrigrams) {
      const existing = trigramToEntries.get(trigram);
      if (existing) {
        existing.push(entryIndex);
      } else {
        trigramToEntries.set(trigram, [entryIndex]);
      }
    }
  }

  return { tokensByEntry, trigramToEntries };
}

/**
 * Which entries could match, or undefined when the index cannot say (e.g. a
 * word shorter than a trigram). Narrowing is an optimisation and must never
 * drop a real match.
 */
export function queryTextSearchIndex(
  index: TextSearchIndex,
  query: SearchQuery,
  options: { partial?: boolean } = {},
): number[] | undefined {
  const indexableTerms = searchQueryIndexableTerms(query);
  if (indexableTerms.length === 0) {
    return undefined;
  }
  // Asking for some of the words means an entry only has to carry one of them,
  // and a word we cannot narrow on leaves everything a candidate.
  if (options.partial && indexableTerms.length !== query.terms.length) {
    return undefined;
  }

  let candidates: number[] | undefined;
  for (const variants of indexableTerms) {
    // Any spelling of the word will do, so the term's candidates are the union
    // over its spellings; every word has to appear, so terms intersect.
    let termCandidates: number[] = [];
    for (const tokens of variants) {
      const variantCandidates = intersectTokenCandidates(index, tokens);
      termCandidates =
        termCandidates.length === 0
          ? variantCandidates
          : unionOrderedIndexes(termCandidates, variantCandidates);
    }

    if (options.partial) {
      candidates = candidates ? unionOrderedIndexes(candidates, termCandidates) : termCandidates;
      continue;
    }

    if (termCandidates.length === 0) {
      return [];
    }

    candidates = candidates
      ? intersectOrderedIndexes(candidates, termCandidates)
      : termCandidates;
    if (candidates.length === 0) {
      return [];
    }
  }

  return candidates;
}

function intersectTokenCandidates(index: TextSearchIndex, tokens: string[]): number[] {
  let candidates: number[] | undefined;
  for (const token of tokens) {
    const tokenCandidates = queryTokenCandidates(index, token);
    if (tokenCandidates.length === 0) {
      return [];
    }
    candidates = candidates ? intersectOrderedIndexes(candidates, tokenCandidates) : tokenCandidates;
    if (candidates.length === 0) {
      return [];
    }
  }
  return candidates ?? [];
}

function queryTokenCandidates(index: TextSearchIndex, token: string): number[] {
  let candidates: number[] | undefined;

  for (const trigram of getTokenTrigrams(token)) {
    const entries = index.trigramToEntries.get(trigram);
    if (!entries?.length) {
      return [];
    }

    candidates = candidates ? intersectOrderedIndexes(candidates, entries) : entries;
    if (candidates.length === 0) {
      return [];
    }
  }

  return candidates ?? [];
}

function intersectOrderedIndexes(left: number[], right: number[]): number[] {
  const rightSet = new Set(right);
  return left.filter((entry) => rightSet.has(entry));
}

function unionOrderedIndexes(left: number[], right: number[]): number[] {
  if (left.length === 0) {
    return right;
  }
  if (right.length === 0) {
    return left;
  }

  const merged = new Set(left);
  for (const entry of right) {
    merged.add(entry);
  }
  return [...merged].sort((a, b) => a - b);
}

export function getTokenTrigrams(token: string): string[] {
  if (token.length < MIN_INDEXABLE_LENGTH) {
    return [];
  }

  const trigrams = new Set<string>();
  for (let index = 0; index <= token.length - 3; index += 1) {
    trigrams.add(token.slice(index, index + 3));
  }
  return [...trigrams];
}

/** The words things are called, gathered from display names. */
export function buildSearchVocabulary(displayNames: Iterable<string>): SearchVocabulary {
  const countByToken = new Map<string, number>();
  for (const displayName of displayNames) {
    for (const token of new Set(splitSearchTokens(displayName))) {
      if (
        token.length >= MIN_INDEXABLE_LENGTH &&
        token.length <= MAX_VOCABULARY_TOKEN_LENGTH &&
        !/\d/.test(token)
      ) {
        countByToken.set(token, (countByToken.get(token) ?? 0) + 1);
      }
    }
  }

  const tokens = [...countByToken.keys()];
  const weights = tokens.map((token) => countByToken.get(token) ?? 0);
  const trigramToTokens = new Map<string, number[]>();
  tokens.forEach((token, tokenIndex) => {
    for (const trigram of getTokenTrigrams(token)) {
      const existing = trigramToTokens.get(trigram);
      if (existing) {
        existing.push(tokenIndex);
      } else {
        trigramToTokens.set(trigram, [tokenIndex]);
      }
    }
  });

  return {
    tokens,
    weights,
    sortedTokens: [...tokens].sort(),
    tokenSet: new Set(tokens),
    trigramToTokens,
  };
}

/**
 * Spellings a mistyped word probably meant. Nothing is suggested for a real
 * word or the start of one (a half-typed "creo"). Two words run together
 * ("oaklog") are offered as the pair they split into.
 */
export function suggestSearchCorrections(
  vocabulary: SearchVocabulary,
  term: SearchTerm,
): string[][] {
  const token = term.raw;
  const maxDistance = maxCorrectionDistance(token);
  if (maxDistance === 0 || vocabulary.tokenSet.has(token) || isVocabularyPrefix(vocabulary, token)) {
    return [];
  }

  const suggestions: string[][] = [];
  const split = splitJoinedWords(vocabulary, token);
  if (split) {
    suggestions.push(split);
  }

  const trigrams = getTokenTrigrams(token);
  const hitsByToken = new Map<number, number>();
  for (const trigram of trigrams) {
    for (const tokenIndex of vocabulary.trigramToTokens.get(trigram) ?? []) {
      hitsByToken.set(tokenIndex, (hitsByToken.get(tokenIndex) ?? 0) + 1);
    }
  }

  const scored: Array<{ token: string; distance: number; weight: number }> = [];
  for (const [tokenIndex, hits] of hitsByToken) {
    const candidate = vocabulary.tokens[tokenIndex];
    if (!candidate || Math.abs(candidate.length - token.length) > maxDistance) {
      continue;
    }
    const overlap = hits / Math.max(trigrams.length, getTokenTrigrams(candidate).length);
    if (overlap < CORRECTION_TRIGRAM_OVERLAP) {
      continue;
    }
    const distance = boundedEditDistance(token, candidate, maxDistance);
    if (distance <= maxDistance) {
      scored.push({ token: candidate, distance, weight: vocabulary.weights[tokenIndex] ?? 0 });
    }
  }

  // Nearest first, then the word the game uses most: "steal" is one letter from
  // both "steam" and "steel", and steel is what a thousand item names say.
  scored.sort((left, right) => left.distance - right.distance || right.weight - left.weight);
  for (const candidate of scored.slice(0, MAX_CORRECTION_CANDIDATES)) {
    suggestions.push([candidate.token]);
  }

  return suggestions;
}

/** Corrections for a whole query, ready to hand to `withSearchCorrections`. */
export function searchCorrector(vocabulary: SearchVocabulary) {
  return (term: SearchTerm) => suggestSearchCorrections(vocabulary, term);
}

/** How the results on screen were arrived at. */
export type SearchPhase = "exact" | "corrected" | "partial";

/**
 * Ask up to three times, each looser than the last, and stop as soon as
 * something answers. Corrections run only when the strict reading found fewer
 * than MIN_CONFIDENT_MATCHES hits, and part-matches only when it found none,
 * so a real word is never diluted by look-alikes.
 */
export function resolveSearchPhases<T>(
  query: SearchQuery,
  vocabulary: SearchVocabulary | undefined,
  run: (query: SearchQuery, options: { partial?: boolean }) => T[],
): { results: T[]; query: SearchQuery; phase: SearchPhase } {
  const exact = run(query, {});
  // A single stray hit is not an answer: "oaklog" matches one registry id,
  // while Oak Log is only reachable by the next phase.
  if (exact.length >= MIN_CONFIDENT_MATCHES || query.terms.length === 0) {
    return { results: exact, query, phase: "exact" };
  }

  const corrected = vocabulary
    ? withSearchCorrections(query, searchCorrector(vocabulary))
    : query;
  if (corrected !== query) {
    // Corrections are added to what was typed rather than replacing it, so this
    // pass returns everything the strict one did, still ranked above the guesses.
    const results = run(corrected, {});
    if (results.length > exact.length) {
      return { results, query: corrected, phase: "corrected" };
    }
  }

  if (exact.length === 0 && corrected.terms.length > 1) {
    const results = run(corrected, { partial: true });
    if (results.length > 0) {
      return { results, query: corrected, phase: "partial" };
    }
  }

  return { results: exact, query, phase: "exact" };
}

function isVocabularyPrefix(vocabulary: SearchVocabulary, token: string): boolean {
  const tokens = vocabulary.sortedTokens;
  let low = 0;
  let high = tokens.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const candidate = tokens[middle] ?? "";
    if (candidate.startsWith(token)) {
      return true;
    }
    if (candidate < token) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return false;
}

function splitJoinedWords(vocabulary: SearchVocabulary, token: string): string[] | undefined {
  if (token.length < 6) {
    return undefined;
  }

  for (let cut = MIN_INDEXABLE_LENGTH; cut <= token.length - MIN_INDEXABLE_LENGTH; cut += 1) {
    const left = token.slice(0, cut);
    const right = token.slice(cut);
    if (vocabulary.tokenSet.has(left) && vocabulary.tokenSet.has(right)) {
      return [left, right];
    }
  }
  return undefined;
}

/**
 * Damerau-Levenshtein distance, abandoned once it passes the limit.
 * Transpositions ("setel") count as one edit, as fast typing produces them.
 */
export function boundedEditDistance(left: string, right: string, limit: number): number {
  if (left === right) {
    return 0;
  }
  if (Math.abs(left.length - right.length) > limit) {
    return limit + 1;
  }

  let previousPrevious: number[] = [];
  let previous: number[] = Array.from({ length: right.length + 1 }, (_unused, index) => index);
  let current: number[] = [];

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current = new Array<number>(right.length + 1);
    current[0] = leftIndex;
    let rowBest = current[0];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution =
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      let value = Math.min(
        substitution,
        (previous[rightIndex] ?? 0) + 1,
        (current[rightIndex - 1] ?? 0) + 1,
      );
      if (
        leftIndex > 1 &&
        rightIndex > 1 &&
        left[leftIndex - 1] === right[rightIndex - 2] &&
        left[leftIndex - 2] === right[rightIndex - 1]
      ) {
        value = Math.min(value, (previousPrevious[rightIndex - 2] ?? 0) + 1);
      }
      current[rightIndex] = value;
      rowBest = Math.min(rowBest, value);
    }

    if (rowBest > limit) {
      return limit + 1;
    }

    previousPrevious = previous;
    previous = current;
  }

  return previous[right.length] ?? limit + 1;
}
