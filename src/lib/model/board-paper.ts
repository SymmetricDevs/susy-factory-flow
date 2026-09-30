/**
 * The paper a board is drawn on. There is no default colour: every board
 * wears one of the canvas papers. A new board takes a random paper nobody else
 * on the plan wears; a board with no stored paper derives one from its id, so
 * it looks the same on every reload and screen without a migration.
 *
 * Only DARK papers are listed: a pale sheet under dark cards reads as a hole
 * in the plan.
 */

/** Canvas theme ids a board may be laid on, darkest family first. */
export const BOARD_PAPER_IDS: readonly string[] = [
  "slate",
  "blueprint",
  "chalkboard",
  "graphite",
  "gunmetal",
  "midnight",
  "charcoal",
  "void",
];

/**
 * A paper for a board that has never been given one. Hashed from the id (never
 * random), so it is stable across reloads, shares and undo.
 */
export function paperForBoardId(boardId: string): string {
  let hash = 0;
  for (let index = 0; index < boardId.length; index += 1) {
    hash = (hash * 31 + boardId.charCodeAt(index)) | 0;
  }
  return BOARD_PAPER_IDS[Math.abs(hash) % BOARD_PAPER_IDS.length];
}

/**
 * A paper for a NEW board: random, but never one already in use if any is
 * free (two same-coloured boards side by side read as one).
 */
export function pickBoardPaper(
  wornPapers: Iterable<string | undefined>,
  random: () => number = Math.random,
): string {
  const worn = new Set<string>();
  for (const paper of wornPapers) {
    if (paper !== undefined) {
      worn.add(paper);
    }
  }
  const free = BOARD_PAPER_IDS.filter((paper) => !worn.has(paper));
  const pool = free.length > 0 ? free : BOARD_PAPER_IDS;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
