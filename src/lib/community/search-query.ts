/**
 * The setup search box, read as a small language: `#tag` words narrow to
 * setups wearing that tag (several stack, all must match), one `@name`
 * narrows to that creator exactly, and everything else is free text
 * matched against names, descriptions and tags. Any order, any mix.
 *
 * Pure, so the server and the library's tag dropdown parse the same way,
 * and so it is testable without a database.
 */

export interface PlanSearch {
  /** Tag terms, lowercased, without the #. */
  tags: string[];
  /** The creator, exactly as typed after the @, or empty. */
  author: string;
  /** True when an @ was typed with nothing after it: narrow to nobody. */
  bareAuthor: boolean;
  /** Free text with the pattern-matching magic scrubbed to spaces. */
  text: string;
}

/** The longest search the server will read; the rest is dropped. */
export const PLAN_SEARCH_MAX_LENGTH = 120;

/**
 * ilike patterns and PostgREST's or() syntax both have magic characters;
 * stripping them beats escaping them for a search box. Applied to free
 * text and tags, never to the author, whose underscores are real.
 */
function scrub(term: string): string {
  return term.replace(/[,()%_\\]/g, " ").trim();
}

export function parsePlanSearch(raw: string): PlanSearch {
  const tags: string[] = [];
  const words: string[] = [];
  let author = "";
  let bareAuthor = false;
  for (const token of raw.trim().slice(0, PLAN_SEARCH_MAX_LENGTH).split(/\s+/)) {
    if (!token) {
      continue;
    }
    if (token.startsWith("#")) {
      const tag = scrub(token.slice(1)).toLowerCase();
      if (tag && !tags.includes(tag)) {
        tags.push(tag);
      }
    } else if (token.startsWith("@")) {
      const name = token.slice(1);
      if (name) {
        // The last @name wins; two creators cannot both own one post.
        author = name;
        bareAuthor = false;
      } else if (!author) {
        bareAuthor = true;
      }
    } else {
      words.push(token);
    }
  }
  return { tags, author, bareAuthor, text: scrub(words.join(" ")) };
}

/** The search with `tag` added (a tag already there is left alone). */
export function withTag(raw: string, tag: string): string {
  const clean = scrub(tag).toLowerCase();
  if (!clean || parsePlanSearch(raw).tags.includes(clean)) {
    return raw;
  }
  // A tag with a space in it rides as one word: the parser reads the
  // underscore back as a space (scrub), so "#early_game" finds "early game".
  return `${raw.trim()} #${clean.replace(/\s+/g, "_")}`.trim();
}

/** The search with its creator set to `name`, replacing any other @name. */
export function withAuthor(raw: string, name: string): string {
  const kept = raw
    .trim()
    .split(/\s+/)
    .filter((token) => token && !token.startsWith("@"));
  return [...kept, `@${name.trim()}`].join(" ").trim();
}

/**
 * The smallest slice of a PostgREST query builder the search needs, so the
 * narrowing can be exercised against a recorder in tests.
 */
export interface PlanSearchQuery<T> {
  ilike(column: string, pattern: string): T;
  eq(column: string, value: string): T;
  or(filters: string): T;
}

/** Narrows `query` by every part of the search; returns the narrowed query. */
export function applyPlanSearch<T extends PlanSearchQuery<T>>(query: T, search: PlanSearch): T {
  let next = query;
  for (const tag of search.tags) {
    next = next.ilike("tags_text", `%${tag}%`);
  }
  if (search.author) {
    next = next.eq("author_name", search.author);
  } else if (search.bareAuthor) {
    // A bare @ narrows to nobody rather than to everything.
    next = next.eq("author_name", "");
  }
  if (search.text) {
    next = next.or(
      `name.ilike.%${search.text}%,description.ilike.%${search.text}%,tags_text.ilike.%${search.text}%`,
    );
  }
  return next;
}
