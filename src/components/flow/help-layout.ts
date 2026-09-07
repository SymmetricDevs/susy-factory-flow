export interface HelpBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Validate rendered columns, including font-dependent wrapping. */
export function helpColumnsFit(columns: HelpBounds[], width: number, height: number): boolean {
  const margin = 8;
  return columns.every((rect, index) =>
    rect.left >= margin && rect.top >= margin &&
    rect.right <= width - margin && rect.bottom <= height - margin &&
    columns.slice(index + 1).every((other) =>
      rect.right + margin <= other.left || other.right + margin <= rect.left ||
      rect.bottom + margin <= other.top || other.bottom + margin <= rect.top,
    ),
  );
}
