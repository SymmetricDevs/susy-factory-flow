# The power story tooltip (retired 2026-09-06)

Pinned for later: this hover is gone from the board but is expected to come
back in some form. This page records what it was, how it came to be, what it
read, and how every figure on it was calculated, so it can be rebuilt without
archaeology. The last source is at commit `376cdc4^`,
`src/components/flow/RecipeNode.tsx`: `PowerStoryContent`, `StoryOverclockBar`,
`StoryCard`, `StoryTierChip`, `trimFactor`, `usagePctText`.

## What it was

One panel, shared by every power surface on a recipe card: the energy hatch
chip, the voltage tier chip, and the footer's POWER cell all opened it. It was
titled OVERCLOCKING and held three unlabeled boxes in the order the game
spends a machine's power supply:

1. **The balance.** What the build lets you spend.
   "2x [MV] energy hatches get you 256 EU/t to spend (2 A)", or for a
   singleblock "[MV] machine gets you 128 EU/t to spend". Tier names wore
   their GT tier colours (`StoryTierChip`, from `GT_TIER_COLORS`).
2. **The recipe and where you are.** The recipe's own draw
   ("[LV] recipe: 30 EU/t", or with parallels "x8 recipes at once, 30 EU/t
   each: 240 EU/t"), then the SPEND BAR, then one sentence stating the
   ratio, the rule, and what it bought.
3. **The outcome.** "So at peak it runs at 120 EU/t" (with a machine count:
   "So at peak each machine runs at 120 EU/t: 240 EU/t across 2"), then the
   next overclock's price ("The next overclock (x4 speed) would take 480
   EU/t." or "More power won't buy another overclock here."), then, only
   when the card ran under 99.5%, "Because the machine runs at 40%, the
   average draw is 48 EU/t."

A power stall (`describePowerStall`) closed the panel in bold red.
The panel was `w-96` (384px), 12px text, no seconds anywhere, no Usage line,
no section headers. Geometry lerped on the board's value-motion clock
(`useMotionValues`): a fresh hover mounted settled and never replayed; a tier
or hatch click made while the panel was held eased every bar boundary.

## The spend bar

The budget drawn as a bar, spent left to right, TO SCALE.

- The track's full width is the supply, `poolEuT`, with the axis labeled
  0 at the left and `poolEuT` EU/t at the right.
- The first slice is one batch's un-overclocked draw,
  `batchEuT = singleDrawEuT x parallels`. Labeled "recipe" when at least
  48px wide.
- Each further slice is one overclock, at the cumulative draw it costs, so
  every later overclock is visibly about three times wider than everything
  before it. That width progression IS the exponential mechanic. Perfect
  steps were cyan, regular steps amber, and a slice at least 26px wide was
  inscribed with the speed reached (x2, x4, x16 ...).
- The unspent tail was hatched, labeled "spare N" when at least 64px wide:
  budget held but too little for the next step, whose price hung under the
  bar's right end.
- Slots: a fixed 17 (`SPEND_BAR_SLOTS`), past GT's tier count, so the lerped
  vector had a constant length and gained or lost slices grew and shrank
  smoothly. Content width for label fitting: 364px (`SPEND_BAR_WIDTH_PX`).
- Drawn only when the ladder was HONEST (below). Runtime-ladder machines,
  whose step kinds the game never exported, got the count alone.

## What it read

Everything came from `NodePowerReport` (`src/lib/solver/power-report.ts`,
`getNodePowerReport`), plus the solve's `utilization` and the card's machine
count times parallel:

| Field | Meaning |
| --- | --- |
| `tier`, `minimumTier` | Chosen tier; the recipe's minimum tier |
| `isMultiblock`, `hatches`, `hatchTypeLabel`, `amps` | Hatch count, exotic hatch name, working amps |
| `poolEuT` | The supply: tier voltage x amps (unbounded on some cards) |
| `singleDrawEuT` | One parallel's modified draw, what ParallelHelper checks against the pool |
| `parallels` | Parallels actually running, structure capped by the pool |
| `drawEuT` | Draw while running: overclocked EU/t x parallels |
| `overclockSteps`, `perfectOverclockSteps` | Steps taken; of which perfect (machine or heat) steps, taken first |
| `perfectSpeedFactor`, `perfectEuFactor` | A perfect step's duration divisor and EU/t multiplier (4 and 4 for standard perfect; other machines carry their own) |
| `state` | ok / under-powered / tier too low, fed to `describePowerStall` |

## How every figure was calculated

```ts
normalSteps   = max(0, overclockSteps - perfectOverclockSteps)
batchEuT      = singleDrawEuT * parallels
cardPeakEuT   = drawEuT * machines            // machines = count * parallel
perRunEuT     = parallels > 0 ? drawEuT / parallels : drawEuT

// The ladder the bar draws: perfect steps first, then regular.
cumulativeEuT(steps) = batchEuT
                     * perfectEuFactor ** min(steps, perfectOverclockSteps)
                     * 4 ** max(0, steps - perfectOverclockSteps)
speedAfter(steps)    = perfectSpeedFactor ** min(steps, perfectOverclockSteps)
                     * 2 ** max(0, steps - perfectOverclockSteps)
sliceFraction(slot)  = min(1, cumulativeEuT(min(slot, stepsTaken)) / poolEuT)
spareEuT             = max(0, poolEuT - cumulativeEuT(stepsTaken))

// The bar and the rule sentence appear only when this arithmetic reproduces
// the report's real per-run draw (within 2 EU/t or 2%).
expectedEuT   = singleDrawEuT * perfectEuFactor ** perfectOverclockSteps * 4 ** normalSteps
ladderHonest  = overclockSteps === 0 || |expectedEuT - perRunEuT| <= max(2, perRunEuT * 0.02)

// The ratio sentence: "You have Nx the power this recipe needs."
powerRatio    = poolEuT / max(1, batchEuT)      // whole past 9.95, else one decimal

// The next rung's price, billed the way the game bills it: whole powers of
// four over the batch draw, floored at 32 (ULV treated as LV).
nextStepEuT   = max(batchEuT, 32) * 4 ** (overclockSteps + 1)
nextSpeed     = perfectSpeedFactor ** perfectOverclockSteps * 2 ** (normalSteps + 1)

// Average draw, once, when usage < 99.5%.
usage         = clamp(utilization, 0, 1)
averageEuT    = cardPeakEuT * usage             // usage printed with one decimal only under 0.5%

// The word for a perfect step: "perfect" only for the standard 4/4 deal,
// otherwise "machine" (arc electrodes and kin overclock their own way).
```

The rule sentence had four shapes: no steps ("An overclock takes a whole x4,
so none fire yet."); all perfect ("This machine overclocks perfectly: every
x4 power buys the full x4 speed, no energy wasted."); all regular ("This
machine's overclocks are regular: x4 power buys only x2 speed."); mixed
("The first N are perfect ...; the rest are regular ..."), each coloured in
its slices' colour. The kind was stated as a fact about the machine, never
as advice.

## How it came to be

- 2026-08-17, `59f7ec0`, v2.16.0 "the power story, one tooltip for every
  power surface": first version, built in one long session of user
  iterations.
- Same day, `e59c205`: the spend bar became to-scale and every time figure
  left the panel.
- Same day, `5ccc5f0`, v2.16.1: the outcome card ends on a number, not a
  tier chip; the yellow line defines regular/perfect as a fact about the
  machine; width to `w-96`. Deployed.
- 2026-09-06, `376cdc4`: replaced by the shared `RecipeTooltip` panel. The
  power surfaces now show rows only (Configured tier, Supply per machine,
  Draw per machine, Card peak, Card average, Parallel operations, Overclock
  steps) with no bar and no sentences.

## What the user rejected along the way

Kept here so a rebuild does not re-walk it: lecture sentences, equal-width
ladder cells, entrance animations, right-aligned text, section headers,
time figures (seconds), a Usage line, the whole-node total inside the panel
(the footer cell already says it), a tier chip opening the outcome. The
terse "copy doctrine" commit `373388f` was reverted in `75db0da` and is not to
be resurrected.

## What a return would need

The report still carries everything the bar read; nothing was removed from
`NodePowerReport`. A rebuilt bar would fit under the current
"Power" rows as a diagram, keeping the to-scale slices and the honest-ladder
guard, and leaving the sentences out to match the rest of the panel.
