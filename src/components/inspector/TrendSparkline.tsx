"use client";

import { useId, useRef, useState } from "react";
import { formatCompact } from "@/lib/model";
import { useBoardMotion, useMotionPoints, useMotionValue } from "@/components/flow/board-motion";

/**
 * One resource's balance across recent edits. The zero line is drawn and
 * always inside the band; pointing snaps a crosshair to the nearest edit and
 * reads out its value. Colour follows the LATEST value (green spare, red
 * short), not the trend.
 *
 * Width comes from the containing box: a viewBox with
 * `preserveAspectRatio="none"` rescales without measuring. Redraws animate on
 * the board's value-motion clock; the crosshair always snaps.
 */
const VIEW_WIDTH = 100;

/** How long the line takes to lie down on its new shape. */
const TREND_MORPH_MS = 600;

export function TrendSparkline({
  series,
  height,
  unit,
  multiplier,
}: {
  series: number[];
  height: number;
  unit: string;
  /** Applied to the readout only; the shape is scale-free. */
  multiplier: number;
}) {
  const gradientId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number>();
  const { valueMotion } = useBoardMotion();

  const latest = series[series.length - 1] ?? 0;
  const stroke = latest >= 0 ? "var(--flow-output)" : "var(--flow-input)";
  const hasLine = series.length >= 2;

  const rawMax = Math.max(...series, 0);
  const rawMin = Math.min(...series, 0);
  // A dead-flat line would give a zero-height band and divide by zero; give it
  // something to sit in the middle of.
  const span = rawMax - rawMin || Math.max(Math.abs(rawMax), 1);
  const padY = 3;
  const plotHeight = height - padY * 2;
  const toY = (value: number) => padY + ((rawMax - value) / span) * plotHeight;
  const toX = (index: number) => (hasLine ? (index / (series.length - 1)) * VIEW_WIDTH : 0);

  // Hooks before the too-short early return below, so their order never
  // depends on how many edits the chart holds.
  const targetPoints = hasLine
    ? series.map((value, index) => ({ x: toX(index), y: toY(value) }))
    : [];
  const shownPoints = useMotionPoints(targetPoints, valueMotion && hasLine, TREND_MORPH_MS);
  const zeroY = useMotionValue(toY(0), valueMotion && hasLine, TREND_MORPH_MS);

  const readIndex = hoverIndex ?? series.length - 1;
  const readValue = series[readIndex] ?? 0;
  // The resting dot rides the line's own clock; a crosshair dot is the
  // pointer's and must never lag it.
  const dotY = useMotionValue(
    toY(readValue),
    valueMotion && hasLine && hoverIndex === undefined,
    TREND_MORPH_MS,
  );

  // One point cannot draw a line, so the chart holds its space and says why.
  if (!hasLine) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-[10px] text-fg-muted"
      >
        Edit the board to start the chart
      </div>
    );
  }

  const line = shownPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const lastX = shownPoints[shownPoints.length - 1]?.x ?? VIEW_WIDTH;
  const firstX = shownPoints[0]?.x ?? 0;

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const box = hostRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) {
      return;
    }
    const ratio = (event.clientX - box.left) / box.width;
    const index = Math.round(ratio * (series.length - 1));
    setHoverIndex(Math.min(series.length - 1, Math.max(0, index)));
  };

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full"
      onMouseMove={handleMove}
      onMouseLeave={() => setHoverIndex(undefined)}
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        preserveAspectRatio="none"
        aria-hidden
        className="block"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* The line the value would have to cross to change sign. */}
        <line
          x1="0"
          y1={zeroY}
          x2={VIEW_WIDTH}
          y2={zeroY}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
          className="text-fg-muted/50"
        />

        {/* Filled down to zero, not to the floor, so the area reads as distance
            from breaking even rather than as an arbitrary column height. */}
        <polygon
          points={`${firstX},${zeroY} ${line} ${lastX},${zeroY}`}
          fill={`url(#${gradientId})`}
        />
        <polyline
          points={line}
          fill="none"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          // Without this the horizontal squash from preserveAspectRatio="none"
          // would stretch the stroke into a wedge.
          vectorEffect="non-scaling-stroke"
        />

        <line
          x1={toX(readIndex)}
          y1="0"
          x2={toX(readIndex)}
          y2={height}
          stroke={stroke}
          strokeWidth="1"
          strokeOpacity={hoverIndex === undefined ? 0 : 0.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/*
        The marker is an HTML dot, not an SVG circle, which the stretched
        viewBox would squash into an egg. x is a percentage of the 0-100
        viewBox; y is already in pixels (viewBox height = element height).
      */}
      <span
        className="pointer-events-none absolute h-[5px] w-[5px] rounded-full"
        style={{
          left: `${toX(readIndex)}%`,
          top: dotY,
          background: stroke,
          transform: "translate(-50%, -50%)",
        }}
      />

      {/*
        The readout shows only while a point is pointed at: at rest the last
        point is the row's current rate, already shown above.
      */}
      {hoverIndex === undefined ? (
        <span className="pointer-events-none absolute left-0 top-0 text-[10px] tabular-nums text-fg-muted">
          {series.length} edits
        </span>
      ) : (
        <span
          className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap rounded bg-surface-sunken/90 px-1 text-[10px] font-bold tabular-nums"
          // Follows the crosshair, clamped inside the box so it cannot hang off
          // either end.
          style={{
            left: `${Math.min(88, Math.max(12, toX(readIndex)))}%`,
            color: stroke,
          }}
        >
          {readValue > 0 ? "+" : readValue < 0 ? "−" : ""}
          {formatCompact(Math.abs(readValue) * multiplier)}
          <span className="opacity-70">{unit}</span>
        </span>
      )}
    </div>
  );
}
