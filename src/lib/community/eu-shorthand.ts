/**
 * The EU/t box's shorthand: "14.3k", "2M", "1.5G", "512", with or without
 * spaces and an "EU/t" trailing it. Case does not matter except that a
 * bare "m" is read as mega, never milli: nobody filters setups by
 * thousandths of an EU. Anything that does not parse is undefined, and
 * the box treats that as no limit.
 */
const SUFFIXES: Record<string, number> = {
  k: 1e3,
  m: 1e6,
  g: 1e9,
  t: 1e12,
};

export function parseEuT(text: string): number | undefined {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/eu\s*\/?\s*t?$/, "")
    .replace(/[\s,_]/g, "");
  const match = /^(\d+(?:\.\d+)?)([kmgt])?$/.exec(cleaned);
  if (!match) {
    return undefined;
  }
  const value = Number(match[1]) * (match[2] ? SUFFIXES[match[2]] : 1);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}
