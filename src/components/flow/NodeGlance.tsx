"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * What a node shows once it is too small to read: the interior stops being
 * drawn (see node-detail.ts and the rules in globals.css) and one of these
 * takes its place, the single fact that still means something at that size.
 * For a machine that is how hard it is running; for a drawer, a tank or a
 * trash can it is what is in it.
 *
 * - It must not affect layout. Node size is a routing input, so a card that
 *   changed shape with zoom would reroute the board on every wheel tick. Hence
 *   `absolute inset-0`, and `display` rather than anything that reflows.
 * - It must fill whatever card it lands in, from a small drawer to a wide
 *   multiblock. The text is drawn in an SVG with a viewBox, so the browser
 *   scales it to the box.
 */

/*
 * The hop map paints this layer in CSS. Hovering a card zoomed out floods the
 * board with distance colours (see hop-map.ts): the map writes two custom
 * properties onto each node element and globals.css does the rest, so a hover
 * costs no React work. That is why the glance layer takes no colour props;
 * do not move them into state. The paint lands only on this layer, which has
 * no say in the card's size, so the router never sees it.
 */

export function NodeGlanceText({
  text,
  className,
  accent,
  word,
  valueSize,
  icon,
}: {
  /** A string, or a text-producing fragment (the eased usage figure). */
  text: ReactNode;
  /** Tone colour for the figure; `fill` reads it through currentColor. */
  className?: string;
  /** Explicit ink, when the colour is computed (a glance surface's accent). */
  accent?: string;
  /** A second, small line under the figure — the reason word, the tier chip. */
  word?: string;
  /**
   * The figure's font size IN PIXELS, for the icon row only — callers whose
   * value can run long (the power view) step it down as the draw gains
   * digits so "9.99M EU/t" still lands inside the card.
   */
  valueSize?: number;
  /**
   * The machine's art, sat to the LEFT of the figure so a coloured card
   * still says what machine it is. With an icon the layer switches from the
   * fitted SVG to a plain HTML row: recipe cards are all the same fixed
   * width, so pixel sizes hold, and — unlike an SVG viewBox, which cannot
   * shrink to its text — the icon and the figure centre in the card as ONE
   * group instead of hugging the left edge.
   */
  icon?: ReactNode;
}) {
  if (icon) {
    return (
      <div
        data-node-detail="glance"
        aria-hidden
        // `flex` from the start: whether the layer SHOWS is the stylesheet's
        // call (`data-detail-level` plus the fade rules in globals.css), and
        // a display switch cannot fade.
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 p-2 font-mono"
      >
        <span className="flex shrink-0 items-center justify-center">{icon}</span>
        <span
          className={["flex min-w-0 flex-col items-start", className ?? ""].join(" ")}
          style={accent ? { color: accent } : undefined}
        >
          <span
            className="whitespace-nowrap font-black leading-none tabular-nums"
            style={{ fontSize: valueSize ?? (word ? 56 : 64) }}
          >
            {text}
          </span>
          {word ? (
            <span className="mt-1.5 whitespace-nowrap text-[15px] font-bold uppercase leading-none tracking-[1px] opacity-85">
              {word}
            </span>
          ) : null}
        </span>
      </div>
    );
  }
  return (
    <div
      data-node-detail="glance"
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-1"
    >
      <svg
        viewBox="0 0 100 30"
        preserveAspectRatio="xMidYMid meet"
        className={["h-full w-full font-mono", className ?? ""].join(" ")}
        style={accent ? { color: accent } : undefined}
      >
        <text
          x="50"
          y="24"
          textAnchor="middle"
          fontSize="30"
          fontWeight="900"
          fill="currentColor"
          className="tabular-nums"
        >
          {text}
        </text>
      </svg>
    </div>
  );
}

/**
 * The LED tile: zoomed out, the card face behind the big icon takes the
 * icon's own colour, deep-dimmed — the item stays the bright thing and the
 * tile reads as its shadow. Delivered as a CSS variable rather than an
 * inline background so the hop map's hover paint (globals.css, higher
 * specificity) can still flood the layer in status mode.
 */
export function glanceTileStyle(tint: string): CSSProperties {
  return { "--glance-bg": `color-mix(in srgb, ${tint} 26%, #07090c)` } as CSSProperties;
}

export function NodeGlanceIcon({ children, tileTint }: { children: ReactNode; tileTint?: string }) {
  return (
    <div
      data-node-detail="glance"
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-1"
      style={tileTint ? glanceTileStyle(tileTint) : undefined}
    >
      {/* Just centres. Sizing is the caller's job: a sprite is a
          background-image on a fixed-size span, so it has to be asked for at
          the size you want. */}
      <div className="flex h-full w-full items-center justify-center">{children}</div>
    </div>
  );
}
