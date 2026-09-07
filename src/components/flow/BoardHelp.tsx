import {
  Box,
  Eye,
  Focus,
  Gauge,
  ImagePlus,
  Network,
  Paintbrush,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  Store,
  Library,
  Trash2,
  TriangleAlert,
  Undo2,
  Zap,
} from "lucide-react";
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { helpColumnsFit } from "./help-layout";
import {
  GLANCE_CARD_CLASS,
  GLANCE_LINE,
  GLANCE_QUIET,
  GlanceRows,
  GlanceTitle,
  type GlanceRow,
} from "@/components/help/card-parts";

/**
 * The board's help corner: a "?" where the zoom buttons used to live.
 *
 * Hovering it lays a glance sheet over the whole window: each toolbar gets a
 * dashed ring, an arrow, and a card naming what is in it (see
 * `card-parts.tsx`). The things with no toolbar to ring - what a card does,
 * what a drawer does, the keys, the notices - are LEGEND cards: they stack in
 * whatever column has the room, over the panel they are nearest to.
 *
 * Pure glance layer: pointer events stay off everywhere. Moving away folds the
 * whole thing up again.
 *
 * The sheet portals to <body>: the board, the browser and the inspector each
 * sit in their own stacking contexts, so a scrim rendered inside the board
 * could never dim its neighbours.
 *
 * Regions are found by their `data-help-anchor` attribute and measured once
 * per open, so the overlay follows the real layout instead of hardcoding it.
 * Several elements may share one anchor id, and a ring may union several ids
 * (the tool row is three trays and, folded, a trigger).
 *
 * LAYOUT IS COMPUTED, NOT TUNED. Every card is CARD_W wide and cards live in
 * flex COLUMNS whose corner is fixed to a ring, so no card's position depends
 * on another card's height, and an arrow only ever leaves the card whose edge
 * sits on the column's fixed corner. The old hand-set offsets per card broke
 * at every window size the author had not looked at.
 */

type HelpRect = { left: number; top: number; right: number; bottom: number };

type Measured = {
  rects: Record<string, HelpRect>;
  button?: HelpRect;
  vw: number;
  vh: number;
};

/** Every glance card's width. Rows are written to fit it. */
const CARD_W = 320;
/** Between stacked cards in one column. */
const CARD_GAP = 14;
/** Card edge to ring edge: room for the arrow to read as an arrow. */
const CALLOUT_GAP = 18;
const RING_PAD = 5;
const ARROW_HEAD = 12;
const ARROW_STEM = 3;
/** Long enough to cross the gap from the button to the cards over it. */
const HIDE_GRACE_MS = 160;
/**
 * The smallest window the spread-out glance layout fits: below either of
 * these its columns overlap or spill off the screen, so hover falls back to
 * the one-column panel instead. Checked against screenshots with both
 * columns open (`help-probe.local.mjs` at 1440x920, 1600x1000, 1920x1080):
 * at 1440x920 the left board column has about 30px to spare.
 */
const GLANCE_MIN_VW = 1440;
const GLANCE_MIN_VH = 920;

/**
 * The sheet's own accent: one soft blue-grey.
 *
 * Not cyan: this draws five rings and a dozen cards over the whole window at
 * once, and in cyan that reads as an alarm going off.
 */
const ACCENT = GLANCE_QUIET;
const ACCENT_DIM = "rgba(147, 164, 187, 0.5)";

interface HelpCard {
  title: string;
  rows: GlanceRow[];
}

/* ------------------------------------------------------------------ */
/* The cards. Rows are short on purpose: this is a reminder, not a manual,
   and a row that wraps costs a whole line of the column's budget. */

const BUILD: HelpCard = {
  title: "Units and history",
  rows: [
    { icon: Undo2, text: "Undo / redo" },
    { chip: "/s", text: "Rate units" },
    { chip: "EU/t", text: "Power units" },
  ],
};

/** The mode switch: one card per key, in the key's colour. */
const BUILD_MODE: HelpCard = {
  title: "Build",
  rows: [
    { text: "Set counts and connections" },
    { text: "Read production rates" },
  ],
};

const SOLVE_MODE: HelpCard = {
  title: "Solve",
  rows: [
    { text: "Set connections and targets" },
    { text: "Calculate machine counts" },
  ],
};

const POOL_MODE: HelpCard = {
  title: "Pool",
  rows: [
    { text: "Set recipes and targets" },
    { text: "Automatic counts and supply" },
    { chip: "+", text: "Add product target" },
  ],
};

const TOOLS: HelpCard = {
  title: "Board tools",
  rows: [
    { icon: Pencil, text: "Annotations" },
    { icon: Paintbrush, text: "Card colour" },
    { icon: ImagePlus, text: "Insert image" },
    { icon: Eye, text: "Display options" },
    { icon: Network, text: "Auto-arrange" },
    { icon: Trash2, text: "Delete tool" },
  ],
};

const FRAMING: HelpCard = {
  title: "Viewport",
  rows: [
    { icon: Focus, text: "Fit plan" },
    { icon: Box, text: "Machine icons" },
    { icon: Gauge, text: "Utilization" },
    { icon: TriangleAlert, text: "Status" },
    { icon: Zap, text: "Power and tier" },
  ],
};

const ON_A_CARD: HelpCard = {
  title: "Machine controls",
  rows: [
    { text: "Name: select machine" },
    { chip: "LV", text: "Click: up; right-click: down" },
    { chip: "2×", text: "Hatch count" },
    { chip: "8", text: "Machine count" },
    { icon: RefreshCw, text: "Replace recipe" },
    { text: "Hover name: statistics" },
  ],
};

const DRAWERS: HelpCard = {
  title: "Drawers and tanks",
  rows: [
    { chip: "SOURCE", tone: "need", text: "Unlimited supply" },
    { chip: "PRODUCT", tone: "product", text: "Production demand" },
    { chip: "BYPRODUCT", tone: "output", text: "Collect surplus" },
    { chip: "TRASH", tone: "internal", text: "Discard" },
    { chip: "BUFFER", tone: "fine", text: "Store surplus" },
  ],
};

const BOARDS: HelpCard = {
  title: "Board windows",
  rows: [
    { chip: "Ctrl+G", text: "Group selection" },
    { text: "Title bar: move group" },
    { text: "Minimize: summary" },
    { text: "Dump: ungroup" },
  ],
};

const LEFT_COLUMN: HelpCard = {
  title: "Resources",
  rows: [
    { icon: Zap, text: "Generators and sources" },
    { icon: Search, text: "Search resources" },
    { icon: Library, text: "Saved plans" },
  ],
};

const RECIPE_SEARCH: HelpCard = {
  title: "Recipe search",
  rows: [
    { text: "Takes: inputs; Makes: outputs" },
    { chip: "ANY", text: "At least one" },
    { chip: "ALL", text: "All selected" },
    { chip: "ONLY", text: "No extras" },
    { text: "Machine buttons: filter" },
    { text: "Right-click result: add" },
  ],
};

const PLAN_TOTALS: HelpCard = {
  title: "Inputs and outputs",
  rows: [
    { chip: "INPUTS", text: "External supply" },
    { chip: "OUTPUTS", text: "Exports" },
    { chip: "INTERNAL", text: "Produced and used" },
    { chip: "RAW/NET", text: "Total / balance" },
  ],
};

const MACHINES: HelpCard = {
  title: "Machines",
  rows: [
    { icon: Store, text: "Machine counts by tier" },
    { chip: "PEAK/AVG", text: "Full / actual power" },
    { chip: "USED", text: "Power breakdown" },
    { text: "Click row: locate" },
  ],
};

const PLAN_CARD: HelpCard = {
  title: "Plan details",
  rows: [
    { text: "Name, icon and description" },
    { icon: Share2, text: "Share setup" },
    { icon: RotateCcw, text: "Reset setup" },
  ],
};

/**
 * The banners the board raises on its own, so their first sighting is not
 * their first explanation.
 */
const NOTICES: HelpCard = {
  title: "Plan diagnostics",
  rows: [
    { chip: "NOT WIRED UP", tone: "fine", text: "Unconnected slots" },
    { chip: "DEAD LOOP", tone: "bottleneck", text: "Cycle without supply" },
    { chip: "CLOG LOCK", tone: "clogged", text: "Blocked surplus" },
    { chip: "SOLVE MODE", tone: "solve", text: "Target required" },
    { chip: "POOL MODE", tone: "pool", text: "Target required" },
  ],
};

/** The gestures no button reveals. */
const MOVES: HelpCard = {
  title: "Mouse and keyboard",
  rows: [
    { text: "Drag slot: connect" },
    { text: "Drag slot to canvas: drawer" },
    { chip: "R", text: "Find production recipes" },
    { chip: "U", text: "Find uses" },
    { chip: "Shift", text: "Extend selection" },
    { chip: "Ctrl+C/V", text: "Copy / paste" },
    { chip: "Del", text: "Delete selection" },
    { chip: "Esc", text: "Cancel tool" },
    { chip: "WASD", text: "Pan" },
    { text: "Scroll: zoom" },
  ],
};

/** The same reminder for a finger: the compact world has no hover and no
 * right button, and telling a phone to right click is worse than nothing. */
const TOUCH_MOVES: HelpCard = {
  title: "Touch controls",
  rows: [
    { text: "Drag slot: connect" },
    { text: "Hold resource: recipes" },
    { text: "Tap card, then drag: move" },
    { text: "Double-tap: zoom" },
    { text: "Swipe from edge: panels" },
  ],
};

/** The mode stack, in the order the switch reads. */
const MODES: HelpCard[] = [BUILD_MODE, SOLVE_MODE, POOL_MODE];

/** Every card, in reading order, for the one-column formats. */
const LINEAR: HelpCard[] = [
  ...MODES,
  BUILD,
  TOOLS,
  FRAMING,
  ON_A_CARD,
  DRAWERS,
  BOARDS,
  LEFT_COLUMN,
  RECIPE_SEARCH,
  PLAN_TOTALS,
  MACHINES,
  PLAN_CARD,
  NOTICES,
];

/* ------------------------------------------------------------------ */

function toHelpRect(rect: DOMRect): HelpRect {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function unionRects(...rects: Array<HelpRect | undefined>): HelpRect | undefined {
  let out: HelpRect | undefined;
  for (const rect of rects) {
    if (!rect) {
      continue;
    }
    out = out
      ? {
          left: Math.min(out.left, rect.left),
          top: Math.min(out.top, rect.top),
          right: Math.max(out.right, rect.right),
          bottom: Math.max(out.bottom, rect.bottom),
        }
      : rect;
  }
  return out;
}

function measureAnchors(): Record<string, HelpRect> {
  const rects: Record<string, HelpRect> = {};
  document.querySelectorAll<HTMLElement>("[data-help-anchor]").forEach((element) => {
    const id = element.dataset.helpAnchor;
    const rect = element.getBoundingClientRect();
    if (!id || rect.width <= 0 || rect.height <= 0) {
      return;
    }
    rects[id] = unionRects(rects[id], toHelpRect(rect))!;
  });
  return rects;
}

/** A ring's rect once the ring pad is on it: what arrows aim at. */
function padRect(rect: HelpRect): HelpRect {
  return {
    left: rect.left - RING_PAD,
    top: rect.top - RING_PAD,
    right: rect.right + RING_PAD,
    bottom: rect.bottom + RING_PAD,
  };
}

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

/**
 * An axis-aligned arrow: a run of points, a head at the last one pointing
 * the way the last segment travels.
 */
type Arrow = { points: Array<{ x: number; y: number }> };

/** A column of cards with one fixed corner. */
type Column = {
  key: string;
  style: CSSProperties;
  cards: HelpCard[];
};

type GlanceLayout = {
  rings: HelpRect[];
  columns: Column[];
  arrows: Arrow[];
  /** False when the mode column has no room between the others: the
   * caller shows the one-column panel instead of overlapping cards. */
  fits: boolean;
};

/**
 * Where everything goes, from the measured rings.
 *
 * Board-left hangs under the build toolbar; the corner stack grows up from
 * the "?" and its bottom card points down at the plan bar; board-right hangs
 * under the tool row and a second board-right stack sits over the framing
 * dock; the browser cards sit inside the browser column; the legend cards
 * sit over the inspector. A closed panel takes its own cards with it
 * (nothing to explain) and the legend column moves onto the board's extra
 * width.
 */
function layoutGlance({ rects, button, vw, vh }: Measured): GlanceLayout {
  const rings: HelpRect[] = [];
  const columns: Column[] = [];
  const arrows: Arrow[] = [];

  const build = rects.build;
  const toolRow = unionRects(rects.paint, rects.view);
  const modeSwitch = rects.rules;
  const dock = rects.glance;
  const browser = rects.browser;
  const inspector = rects.inspector;
  const planBar = rects["plan-card"];

  // The x the whole right side is hung from: the tool row's right edge,
  // which is also the framing dock's.
  const rightEdge = toolRow?.right ?? dock?.right ?? vw - 12;

  // The legend's left edge when it has to sit on the board (no inspector):
  // the mode column may not run into it either.
  const legendOnBoardLeft = rightEdge - CARD_W - CARD_GAP - CARD_W;
  const rightColumnsLeft = inspector ? rightEdge - CARD_W : legendOnBoardLeft;

  // THE MODE STACK hangs under the switch, top centre, and needs a third
  // column between the build column and whatever hangs on the right. When
  // there is no room the whole spread is abandoned for the one-column panel
  // (`fits`), which is what any narrower window gets anyway.
  const leftColumnRight = (build?.left ?? 12) + CARD_W;
  const modeColumnLeft = modeSwitch
    ? clamp(
        (modeSwitch.left + modeSwitch.right) / 2 - CARD_W / 2,
        leftColumnRight + CARD_GAP,
        rightColumnsLeft - CARD_GAP - CARD_W,
      )
    : undefined;
  const modeColumnFits =
    modeSwitch !== undefined &&
    modeColumnLeft !== undefined &&
    modeColumnLeft >= leftColumnRight + CARD_GAP &&
    modeColumnLeft + CARD_W + CARD_GAP <= rightColumnsLeft;

  if (build) {
    const ring = padRect(build);
    rings.push(build);
    const top = ring.bottom + CALLOUT_GAP;
    columns.push({
      key: "board-left",
      style: { left: build.left, top, width: CARD_W },
      cards: [BUILD],
    });
    const x = clamp((ring.left + ring.right) / 2, build.left + 24, build.left + CARD_W - 24);
    arrows.push({ points: [{ x, y: top }, { x, y: ring.bottom }] });
  }

  if (modeSwitch) {
    const ring = padRect(modeSwitch);
    rings.push(modeSwitch);
    if (modeColumnFits && modeColumnLeft !== undefined) {
      const top = ring.bottom + CALLOUT_GAP;
      columns.push({
        key: "modes",
        style: { left: modeColumnLeft, top, width: CARD_W },
        cards: MODES,
      });
      const x = clamp(
        (ring.left + ring.right) / 2,
        modeColumnLeft + 24,
        modeColumnLeft + CARD_W - 24,
      );
      arrows.push({ points: [{ x, y: top }, { x, y: ring.bottom }] });
    }
  }

  if (toolRow) {
    const ring = padRect(toolRow);
    rings.push(toolRow);
    const top = ring.bottom + CALLOUT_GAP;
    const left = rightEdge - CARD_W;
    columns.push({
      key: "board-right",
      style: { left, top, width: CARD_W },
      cards: [TOOLS, ON_A_CARD],
    });
    const x = clamp((ring.left + ring.right) / 2, left + 24, left + CARD_W - 24);
    arrows.push({ points: [{ x, y: top }, { x, y: ring.bottom }] });
  }

  if (dock) {
    const ring = padRect(dock);
    rings.push(dock);
    const bottom = ring.top - CALLOUT_GAP;
    const left = dock.right - CARD_W;
    columns.push({
      key: "board-right-bottom",
      style: { left, bottom: vh - bottom, width: CARD_W },
      cards: [FRAMING],
    });
    const x = clamp((ring.left + ring.right) / 2, left + 24, left + CARD_W - 24);
    arrows.push({ points: [{ x, y: bottom }, { x, y: ring.top }] });
  }

  if (button) {
    const bottom = button.top - 10;
    columns.push({
      key: "corner",
      style: { left: button.left, bottom: vh - bottom, width: CARD_W },
      cards: [MOVES, PLAN_CARD],
    });
    if (planBar && planBar.top > bottom + ARROW_HEAD) {
      // The plan bar runs the whole width of the board's foot, so the arrow
      // drops from the stack's bottom card wherever it clears the button.
      const ring = padRect(planBar);
      rings.push(planBar);
      const x = clamp(button.right + 120, button.left + 24, button.left + CARD_W - 24);
      arrows.push({ points: [{ x, y: bottom }, { x, y: ring.top }] });
    }
  }

  if (browser) {
    rings.push(browser);
    columns.push({
      key: "browser",
      style: { left: browser.left + 12, top: browser.top + 80, width: CARD_W },
      cards: [LEFT_COLUMN, RECIPE_SEARCH],
    });
  }

  // The legend: over the inspector when it is open, else on the board's
  // extra width, left of the board-right column.
  const legendLeft = inspector
    ? inspector.left + Math.max(6, (inspector.right - inspector.left - CARD_W) / 2)
    : rightEdge - CARD_W - CARD_GAP - CARD_W;
  const legendCards = inspector
    ? [PLAN_TOTALS, MACHINES, DRAWERS, BOARDS, NOTICES]
    : [DRAWERS, BOARDS, NOTICES];
  const legendTop = inspector
    ? inspector.top + 12
    : (toolRow ? padRect(toolRow).bottom : 80) + CALLOUT_GAP;
  columns.push({
    key: "legend",
    style: { left: legendLeft, top: legendTop, width: CARD_W },
    cards: legendCards,
  });

  return { rings, columns, arrows, fits: modeSwitch === undefined || modeColumnFits };
}

/** The arrow's segments as 3px bars, and its head as a border triangle. */
function ArrowMark({ arrow }: { arrow: Arrow }) {
  const { points } = arrow;
  const segments: CSSProperties[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const vertical = from.x === to.x;
    const isLast = index === points.length - 1;
    // The last segment stops short by the head's length, so the head's tip
    // is what touches the ring.
    const trim = isLast ? ARROW_HEAD : 0;
    if (vertical) {
      const y0 = Math.min(from.y, to.y) + (to.y < from.y ? trim : 0);
      const y1 = Math.max(from.y, to.y) - (to.y > from.y ? trim : 0);
      segments.push({
        left: from.x - ARROW_STEM / 2,
        top: y0,
        width: ARROW_STEM,
        height: Math.max(0, y1 - y0),
      });
    } else {
      const x0 = Math.min(from.x, to.x) + (to.x < from.x ? trim : 0);
      const x1 = Math.max(from.x, to.x) - (to.x > from.x ? trim : 0);
      segments.push({
        left: x0,
        top: from.y - ARROW_STEM / 2,
        width: Math.max(0, x1 - x0),
        height: ARROW_STEM,
      });
    }
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const direction =
    last.x === prev.x ? (last.y < prev.y ? "up" : "down") : last.x < prev.x ? "left" : "right";
  const head: CSSProperties =
    direction === "up"
      ? {
          left: last.x - 8,
          top: last.y,
          borderLeft: "8px solid transparent",
          borderRight: "8px solid transparent",
          borderBottom: `${ARROW_HEAD}px solid ${ACCENT}`,
        }
      : direction === "down"
        ? {
            left: last.x - 8,
            top: last.y - ARROW_HEAD,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderTop: `${ARROW_HEAD}px solid ${ACCENT}`,
          }
        : direction === "left"
          ? {
              left: last.x,
              top: last.y - 8,
              borderTop: "8px solid transparent",
              borderBottom: "8px solid transparent",
              borderRight: `${ARROW_HEAD}px solid ${ACCENT}`,
            }
          : {
              left: last.x - ARROW_HEAD,
              top: last.y - 8,
              borderTop: "8px solid transparent",
              borderBottom: "8px solid transparent",
              borderLeft: `${ARROW_HEAD}px solid ${ACCENT}`,
            };
  return (
    <Fragment>
      {segments.map((style, index) => (
        <span key={index} className="absolute" style={{ ...style, backgroundColor: ACCENT }} />
      ))}
      <span className="absolute h-0 w-0" style={head} />
    </Fragment>
  );
}

/** One of the sheet's cards: a headline, then its rows. */
function GlanceCard({
  card,
  className,
  style,
}: {
  card: HelpCard;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={[GLANCE_CARD_CLASS, "px-3 py-2.5", className].filter(Boolean).join(" ")}
      style={{ border: `2px solid ${GLANCE_LINE}`, ...style }}
    >
      <GlanceTitle dense>{card.title}</GlanceTitle>
      <div className="mt-2">
        <GlanceRows rows={card.rows} accent={ACCENT} dense />
      </div>
    </div>
  );
}

const HELP_BUTTON_CLASS =
  "pointer-events-auto flex h-9 w-9 items-center justify-center border-2 border-[var(--mc-15)] bg-[var(--mc-49)] font-mono text-[16px] font-black text-white shadow-[inset_2px_2px_0_var(--mc-85),inset_-2px_-2px_0_var(--mc-25)] hover:brightness-110";

/**
 * The same help, as one scrolling sheet.
 *
 * The glance layer is built out of rings and arrows pointing at the toolbars it
 * describes; on a phone those toolbars are folded into single buttons, its cards
 * are wider than the screen, and there is no hover to open it with. So compact
 * windows get the content and drop the pointing: every card in a column, over a
 * full-screen sheet with one way out.
 */
function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[#101419] font-mono text-[#dbe3ec]">
      <div
        className="flex h-11 shrink-0 items-center justify-between px-3"
        style={{ borderBottom: `1px solid ${GLANCE_LINE}` }}
      >
        <span className="text-[12px] font-black uppercase tracking-[0.14em] text-[#aebccd]">
          Board help
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close help"
          className="flex h-9 w-9 items-center justify-center border text-[16px] text-[#aebccd]"
          style={{ borderColor: GLANCE_LINE }}
        >
          ✕
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <GlanceCard card={TOUCH_MOVES} />
        {LINEAR.map((card) => (
          <GlanceCard key={card.title} card={card} />
        ))}
      </div>
    </div>
  );
}

/**
 * The help, folded to fit: one scrollable column growing out of the "?".
 *
 * The glance layer needs a big window - a dozen cards spread over the
 * screen, each beside the toolbar it names - and between the phone layout
 * and that spread sits a band of small desktop windows where the spread
 * collapses into a pile of overlapping cards. Those windows get this
 * instead: every card in one column beside the button, scrollable, still
 * opened by hover and closed by leaving. Set a target rate or pin a machine count content, no pointing.
 */
function HelpHoverPanel({
  measured,
  onEnter,
  onLeave,
}: {
  measured: Measured;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { button, vw, vh } = measured;
  const anchorTop = button ? button.top : vh - 12;
  const anchorLeft = button ? button.left : 12;
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[120] font-mono"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="pointer-events-auto absolute flex flex-col gap-2 overflow-y-auto pr-1"
        style={{
          left: anchorLeft,
          bottom: vh - anchorTop + 10,
          width: Math.min(380, vw - anchorLeft - 12),
          maxHeight: anchorTop - 22,
        }}
      >
        <GlanceCard card={MOVES} />
        {LINEAR.map((card) => (
          <GlanceCard key={card.title} card={card} />
        ))}
      </div>
    </div>
  );
}

function HelpGlanceSheet({
  measured,
  onEnter,
  onLeave,
}: {
  measured: Measured;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { button } = measured;
  const { rings, columns, arrows } = layoutGlance(measured);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || overflow) return;
    const stacks = Array.from(sheet.querySelectorAll<HTMLElement>("[data-help-column]"));
    const check = () => {
      if (!helpColumnsFit(stacks.map((stack) => stack.getBoundingClientRect()), window.innerWidth, window.innerHeight)) {
        setOverflow(true);
      }
    };
    check();
    const observer = new ResizeObserver(check);
    stacks.forEach((stack) => observer.observe(stack));
    return () => observer.disconnect();
  }, [measured, overflow]);

  if (overflow) {
    return <HelpHoverPanel measured={measured} onEnter={onEnter} onLeave={onLeave} />;
  }
  return (
    <div
      ref={sheetRef}
      className="pointer-events-none fixed inset-0 z-[120] font-mono"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="absolute inset-0 bg-black/60" />
      {rings.map((rect, index) => (
        <div
          key={index}
          className="absolute border border-dashed"
          style={{
            borderColor: ACCENT_DIM,
            left: rect.left - RING_PAD,
            top: rect.top - RING_PAD,
            width: rect.right - rect.left + RING_PAD * 2,
            height: rect.bottom - rect.top + RING_PAD * 2,
          }}
        />
      ))}
      {arrows.map((arrow, index) => (
        <ArrowMark key={index} arrow={arrow} />
      ))}
      {columns.map((column) => (
        <div
          key={column.key}
          data-help-column={column.key}
          className="absolute flex flex-col"
          style={{ ...column.style, gap: CARD_GAP }}
        >
          {column.cards.map((card) => (
            <GlanceCard key={card.title} card={card} />
          ))}
        </div>
      ))}
      {button ? (
        /* A lit stand-in over the real (now dimmed) button, so the corner
           the sheet grew from stays readable. Hover still lands on the
           real button underneath. */
        <div
          className="absolute flex items-center justify-center border-2 bg-[var(--mc-49)] font-mono text-[16px] font-black text-white shadow-[inset_2px_2px_0_var(--mc-85),inset_-2px_-2px_0_var(--mc-25)]"
          style={{
            borderColor: ACCENT,
            left: button.left,
            top: button.top,
            width: button.right - button.left,
            height: button.bottom - button.top,
          }}
        >
          ?
        </div>
      ) : null}
    </div>
  );
}

export const BoardHelp = memo(function BoardHelp({ compact }: { compact: boolean }) {
  const [measured, setMeasured] = useState<Measured | undefined>(undefined);
  const [isSheetOpen, setSheetOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const hideTimerRef = useRef<number | undefined>(undefined);

  const show = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    const buttonRect = buttonRef.current?.getBoundingClientRect();
    setMeasured({
      rects: measureAnchors(),
      button: buttonRect ? toHelpRect(buttonRect) : undefined,
      vw: window.innerWidth,
      vh: window.innerHeight,
    });
  }, []);
  const scheduleHide = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setMeasured(undefined), HIDE_GRACE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(hideTimerRef.current), []);
  const isHoverOpen = measured !== undefined;
  useEffect(() => {
    if (!isHoverOpen) return;
    window.addEventListener("resize", show);
    return () => window.removeEventListener("resize", show);
  }, [isHoverOpen, show]);

  if (compact) {
    return (
      <div className="absolute bottom-3 left-3 z-30">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          data-help-anchor="help"
          className={HELP_BUTTON_CLASS}
          title="Board help"
          aria-label="Show board help"
        >
          ?
        </button>
        {isSheetOpen && typeof document !== "undefined"
          ? createPortal(
              <HelpSheet onClose={() => setSheetOpen(false)} />,
              document.body,
            )
          : null}
      </div>
    );
  }

  // Between the phone layout and the full spread sits a band of small
  // desktop windows; they hover the one-column panel instead. Decided per
  // open, so resizing simply changes what the next hover shows.
  const fitsGlance =
    measured !== undefined &&
    measured.vw >= GLANCE_MIN_VW &&
    measured.vh >= GLANCE_MIN_VH &&
    layoutGlance(measured).fits;

  return (
    <div
      className="absolute bottom-3 left-3 z-30"
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
    >
      <button
        ref={buttonRef}
        type="button"
        // Click too, not only hover: a pen, a touch screen above the phone
        // breakpoint, or a keyboard's Enter all land here, and help must
        // open for every one of them.
        onClick={show}
        onFocus={show}
        onBlur={scheduleHide}
        data-help-anchor="help"
        className={HELP_BUTTON_CLASS}
        title="Board help"
        aria-label="Show board help"
      >
        ?
      </button>
      {measured
        ? createPortal(
            fitsGlance ? (
              <HelpGlanceSheet measured={measured} onEnter={show} onLeave={scheduleHide} />
            ) : (
              <HelpHoverPanel measured={measured} onEnter={show} onLeave={scheduleHide} />
            ),
            document.body,
          )
        : null}
    </div>
  );
});
