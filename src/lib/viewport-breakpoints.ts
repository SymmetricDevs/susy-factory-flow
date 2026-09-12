/**
 * The two layout breakpoints, in SHELL pixels (see ui-scale.ts). Kept in a
 * module with no "use client" so the server layout can inline them into the
 * boot script; compact-view.ts re-exports them and owns the media queries.
 */

/** Under this width the columns become drawers and the top bar one menu. */
export const COMPACT_MAX_WIDTH = 900;

/** A window shorter than this is compact whatever its width (a phone on its side). */
export const COMPACT_MAX_HEIGHT = 560;

/** Under this width the top bar's labelled buttons drop to their icons. */
export const SNUG_MAX_WIDTH = 1280;
