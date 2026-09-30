/**
 * A small in-memory cache for the public setups list.
 *
 * A page costs several database round trips, and the rows are the same for
 * every reader (`isMine` and `myVote` are stamped on afterwards). So a page's
 * ROWS are kept briefly, keyed by the query; every write to a post bumps the
 * generation so the next read is fresh. The server is one process, so one
 * map is the whole cache.
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
