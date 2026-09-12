/**
 * A small in-memory cache for the public setups list.
 *
 * One page of the list costs three round trips to the database (the page
 * with its exact count, the reader's votes, the version list), and the
 * public list is the same for everyone: what differs per reader is only
 * `isMine` and `myVote`, which are stamped on after the fact. So the ROWS
 * of a page are kept here, keyed by the query, for a short while, and
 * every write to a post (post, edit, delete, vote) bumps the generation so
 * the next read is fresh. The server runs as one process, so one map is
 * the whole cache.
 */

const TTL_MS = 60_000;
const MAX_ENTRIES = 200;

interface Entry<T> {
  generation: number;
  expires: number;
  value: T;
}

let generation = 0;
const entries = new Map<string, Entry<unknown>>();

/** Every write to the posts table calls this; every cached page dies. */
export function invalidatePlanListCache(): void {
  generation += 1;
  entries.clear();
}

export function readPlanListCache<T>(key: string): T | undefined {
  const entry = entries.get(key);
  if (!entry) {
    return undefined;
  }
  if (entry.generation !== generation || entry.expires < Date.now()) {
    entries.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function writePlanListCache<T>(key: string, value: T): void {
  if (entries.size >= MAX_ENTRIES) {
    // Oldest first: Map iteration is insertion order.
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) {
      entries.delete(oldest);
    }
  }
  entries.set(key, { generation, expires: Date.now() + TTL_MS, value });
}
