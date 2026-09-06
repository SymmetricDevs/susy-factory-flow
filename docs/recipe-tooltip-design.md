# Recipe and machine tooltip design

Status: implemented for ordinary recipe cards on 2026-09-06 (`recipe-tooltip-data.ts`, `machine-tooltip-data.ts`, `RecipeTooltip.tsx`); the sections below are the design it follows.
Date: 2026-09-06.
Scope: ordinary recipe cards first, including Chemical Reactor recipes and
multiblock handlers, in Build, Solve, and Pool.

## 1. What we are trying to achieve

A tooltip should identify the thing under the pointer, explain its current
reading, state a requirement when one prevents progress, and show the relevant
gestures in a compact action footer. It should be
short enough to read without interrupting work on the board.

Use literal technical language. Prefer resource names, rates, counts, and
specific causes over metaphors or descriptions of what the board “wants.”
Do not write a miniature tutorial on every control.

The same recipe can need different explanations in each mode. Its chemistry
does not change, but the meaning of its machine count, resource supply, and
connections does. We should share the layout and facts while selecting the
wording and relevant fields by mode.

### Already agreed or implemented

- Stay on the current branch; commit completed changes there.
- Use the existing canvas-button gray palette, border, and raised bevel.
- Use a restrained, blurred external shadow.
- Use a larger heading, short sections, and limited emphasis.
- Pool's mode tooltip explains its relationship to traditional GTNH planners.
- The bottom notice must use the current mode's name and color.
- Required setup must be phrased as a requirement: “You must …”.
- Restore the existing “Show me” button; do not expand it to “Show products”.
- Make available actions discoverable with small mouse icons and key labels.
- Keep action hints brief and specific to the hovered control and active mode.

### Proposed, not yet agreed

- The field lists and example tooltips below.
- Which numeric comparisons deserve space in an input/output hover.
- A small mode label on machine summaries when it clarifies a calculated value.
- The replacement status vocabulary and order of explanatory details.
- Any new persistent details panel or touch/keyboard interaction.

Do not treat this document as authorization to change machine calculations,
resource matching, wiring, or every tooltip at once.

## 2. Initial scope

Start with a normal recipe having consumed inputs and outputs. Use one
Chemical Reactor card as the reference case, then the same recipe with a
multiblock handler where the dataset supports it.

| Surface | First-pass purpose | Mode differences |
| --- | --- | --- |
| Machine name or picture | Identify the selected machine and effective configuration | Installed count versus calculated count; pool context |
| Input row | Explain supply and consumption of that resource | Connected supply versus shared pool/import |
| Output row | Explain production, demand, and excess | Explicit destination versus shared pool |
| Output demand indicator | Explain downstream demand and coverage | Connected consumers versus aggregate pool demand |
| Machine count | Explain whether the number is entered, calculated, or pinned | Build differs from Solve/Pool |
| Status | Explain the current limiting condition | Pool must not advise drawing wires |
| Power/tier | Explain effective draw or a power/configuration restriction | Count basis differs; machine behavior does not |
| Configuration control | Explain the selected option's actual effect | Usually shared across modes |

Later passes: drawers, generators, crops, bees, custom-rate cards, minimized
boards, recipe search, and the rest of the toolbar. Their shared tooltip skin
already changes globally; their wording needs separate review.

Do not use crop or generator exceptions to complicate the ordinary recipe
template before the basic template works.

## 3. The three modes: semantic contract

| Question | Build | Solve | Pool |
| --- | --- | --- | --- |
| Who sets the machine count? | User | Calculated, unless pinned | Calculated, unless pinned |
| What connects resources? | User's wires | User's wires | Shared resource pools |
| What establishes a requested scale? | Installed counts and existing plan constraints | Target rates or pinned counts | Target rates or pinned counts |
| Is an unconnected consumed input acceptable? | No, for an ordinary closed recipe | No, for an ordinary closed recipe | No manual wire is required |
| What happens to an input with no producer? | Needs a declared, connected supply | Needs a declared, connected supply | Imported automatically |
| Is a local producer's shortage automatically imported? | No | No | Do not assume so; pool topology and results determine supply |
| What happens to stored manual wires? | Used | Used | Ignored by the calculation; restored when leaving Pool |
| Are machine mechanics different? | No | No | No |

An input missing a producer in Pool is not automatically an error. “Imported”
is a normal state. Conversely, a pool with local producers is not a promise
of unlimited supplemental imports when those producers cannot meet demand.

Mode-specific wording must not claim that Pool chooses recipes, creates real
machines, or constructs a physical transport system in the game.

## 4. Writing rules

1. Start with the subject or state: “Chlorine · Input”, “Input shortage”,
   “Required machines”.
2. Explain the current condition, not a general philosophy of factories.
3. Use “You must” for a prerequisite. Use “You can” only for an optional action.
4. Prefer “Requires”, “Supplied”, “Produced”, “Consumed”, “Target”, “Surplus”,
   and “Imported” over “asks”, “eats”, “wants”, “gets”, and “leftover”.
5. Avoid “the board does the rest”, “nothing asks”, “who takes it”, “choking”,
   “story”, and “down to the decimal” in player-facing text.
6. Name the limiting resource when known. Do not substitute “something”.
7. Do not repeat the same instruction in the title, body, and footer.
8. Keep numbers attached to their units and explain their basis.
9. Use a neutral state for normal partial utilization or unused capacity.
10. Do not recommend adding machines unless the diagnosed constraint supports it.

### Provisional length budgets

| Tooltip type | Target |
| --- | --- |
| Simple control | One sentence, usually under 12 words |
| Input/output | Heading, up to two relevant rate rows, one short reason |
| Status | State and one reason; one requirement only when needed |
| Machine summary | Heading and up to four effective values |
| Unusual configuration | Selected option, effect, one restriction |

These are review targets, not truncation rules. Never hide a material cause
or unit to meet a word count. If a tooltip routinely needs more, move the
extra explanation to an appropriate details surface rather than shrinking
the font.

The action footer has its own small budget: normally two to four compact
entries, without explanatory sentences. Count equivalent mouse and keyboard
gestures as one action. Do not add filler to reach a minimum number of entries.

### Short wording candidates

| Current style | Proposed style |
| --- | --- |
| Nothing asks, so nothing runs | You must set a target or pin a machine count. |
| Asked X, gets Y | Required X · Supplied Y |
| Nothing takes the Chlorine | Chlorine output is unconnected. |
| Gets X of the Y it could eat | Supplied X of Y required. |
| No product amount needs this machine | No production target requires this machine. |
| Makes only what gets taken | Production matches demand. |
| Choking on a surplus | Output capacity limits production. |

These replacements are conditional: “unconnected” is only correct when
the connection is absent, not when a connected destination has stopped.

“You must” belongs in the requirement text. Action hints name the gesture and
result: “Left click / R · Recipes”, not “You must left click to see recipes”.

## 5. Visual structure

Use the shared panel style in `src/components/nei/tooltip-style.ts`.

- Background: `--mc-49`, matching the canvas buttons.
- Outer border: 2px `--mc-15`.
- Raised edges: upper-left `--mc-85`, lower-right `--mc-25`.
- External shadow: short offset, low opacity, a small blur.
- Heading: approximately 16px; long names may wrap.
- Body: approximately 14px with 20px line height.
- Secondary labels: smaller and muted, without reducing essential values.
- Normal text uses neutral foreground tokens.
- Mode color identifies mode; status color identifies a condition.

Keep blue Pool identity separate from green success and red shortage. A
blue heading does not mean a resource is adequately supplied.

For comparisons, prefer aligned label/value rows. For two independent rules,
use two short bullets. Avoid inline bold labels followed by long paragraphs.
Avoid italics for rates, requirements, or anything the player needs to scan.

Put action hints last, below one subtle divider. Use small neutral mouse
icons and keycaps; reserve color for meaningful mode/status information.
The hints describe controls on the card, not clickable buttons in the tooltip.

Typical width should be around 300–360px, clamped to the viewport. Expand only
when a real field needs space. A multiblock is not automatically entitled to
a larger tooltip. Keep the panel inside the viewport at the right and bottom
edges; test the longest resource and machine names.

The examples below show information order, not final typography. They do not
authorize adding every example field to every tooltip.

## 6. Numbers and their meaning

Use the effective selected recipe and existing calculation results. Distinguish:

| Term | Meaning |
| --- | --- |
| Per operation | Recipe slot quantity for one operation |
| Full-rate requirement | Consumption at the relevant configured capacity |
| Required rate | Consumption needed for the current calculated production |
| Supplied rate | Supply represented by the current calculation |
| Consumed rate | Actual calculated consumption |
| Produced rate | Actual calculated production |
| Capacity | Maximum for the specified machine count/configuration |
| Target | A rate explicitly requested by the user |
| Required machines | Calculated machine-equivalent count |
| Installed machines | Count entered in Build |
| Pinned machines | Fixed count entered in Solve or Pool |

Do not label full-rate demand as current consumption. Do not call a fractional
machine requirement a physical build count. If a rounded construction count
is shown, explicitly label it and explain its utilization only when the
calculation supports that interpretation.

Preserve the selected rate unit. Fluids use litres; items use item quantities.
Filled cells remain items, including on connections that bridge forms. If a
conversion is relevant, show the actual stored ratio; never assume 1,000 L.

Avoid presenting `0` as an explanation for an unavailable calculation. Use
“No target”, “Unavailable”, or the actual failure reason when supported.
Tiny positive values must not be formatted as exact zero.

## 7. Chemical Reactor reference examples

All values and resource names in the following examples are illustrative UI
fixtures. They are not asserted GTNH recipe stoichiometry or machine stats.
Implementation review should load a real exported Chemical Reactor recipe
and replace these values with its computed results.

Use one recipe with at least one fluid input and output, then a variant with
an item input. Check a non-consumed circuit separately if the recipe has one.

### Build: machine header

```text
Chemical Reactor                         Build

Installed machines                           2
Configured tier                             MV
Time per operation                       2.0 s
Power per active machine              120 EU/t
```

The header establishes machine identity and effective settings. It should
not also list every ingredient, output, consumer, and status explanation.
Power is explicitly per machine in this example; a total must be labeled.

### Build: supplied input

```text
Chlorine · Input

Required                            100 L/s
Supplied                            100 L/s
```

Candidate alternative: show only “Supply meets the required rate” when both
rates already appear clearly on the card. Decide this by comparing real
screenshots, not by committing to duplicate tables everywhere.

### Build: limited input

```text
Chlorine · Input shortage

Required                            100 L/s
Supplied                             60 L/s

Supply limits production to 60%.
```

Only show the percentage if this resource is actually binding and that
percentage uses the same reference capacity. With multiple tied constraints,
do not imply that fixing Chlorine alone guarantees full output.

### Build: output

```text
Product fluid · Output

Produced                            120 L/s
Consumed                            100 L/s

Surplus: 20 L/s enters storage.
```

Use “enters storage” only for a result that actually banks the surplus. A
blocked outlet requires a different statement. An unconnected output says
“You must connect this output.” It does not claim production is successfully
exported or disposed of.

### Solve: machine header and count

```text
Chemical Reactor                         Solve

Required machines                         2.5
Configured tier                             MV
Time per operation                       2.0 s
```

The count's own hover can explain the fraction:

```text
Required machines

Calculated requirement                    2.5
Whole machines                              3
Average utilization                       83%
```

The rounded figure is a presentation option, not a change to the stored or
calculated count. The existing solved-count control already has fractional
and whole-count formatting; reconcile labels with that behavior before adding
a second calculation.

### Solve: input and output

```text
Chlorine · Input

Required for target                  250 L/s
Supplied                             200 L/s

Supply is 50 L/s below the requirement.
```

```text
Product fluid · Output

Target                               500 L/s
Produced                             400 L/s

Chlorine supply limits production.
```

Show “Target” only if a real target is attributable to this output. For an
intermediate resource, use “Required downstream” when that is the actual
quantity. Do not copy the final product's target onto every intermediate.

### Pool: machine header

```text
Chemical Reactor                          Pool

Required machines                         2.5
Configured tier                             MV
Time per operation                       2.0 s
```

No general explanation of Pool is necessary on every machine. Its behavior
belongs in the mode tooltip and in resource-specific statements where relevant.

### Pool: imported input

```text
Chlorine · Imported input

Imported                             250 L/s

No producer is present in this plan.
```

No warning color and no instruction to add a source drawer. The import is
part of Pool's normal calculation.

### Pool: locally supplied input

```text
Chlorine · Input

Required                             250 L/s
Supplied by pool                     250 L/s
```

If the local pool is short, show the shortfall and supported cause. Do not
claim an automatic import will cover it just because the resource can be
imported in a different topology.

### Pool: output

```text
Product fluid · Output

Produced                             500 L/s
Used in plan                         400 L/s

Surplus: 100 L/s.
```

This is a resource balance, not a list of physical wire destinations. Resolve
whether the displayed values are card-specific or pool-wide before rendering;
never combine one card's production with all producers' consumption in a
subtraction that appears to be that card's own balance.

## 8. State coverage for ordinary inputs and outputs

| Condition | Build / Solve | Pool |
| --- | --- | --- |
| Input supplied | Required and supplied, or a short confirmation | Pool supply; identify imports when applicable |
| Input missing connection | You must connect this input. | No manual-connection instruction |
| Output missing connection | You must connect this output. | Shared output; do not diagnose missing wires |
| Upstream supply short | Name resource and shortfall | Name pool shortfall or local producer constraint |
| Connected destination stopped | Name the stopped destination when known | Use actual pool constraint, not a fictitious wire |
| Output surplus banked | State stored surplus | State pool surplus |
| Output discarded | State discarded rate | State discarded rate if a trash declaration applies |
| Target not yet provided | Solve notice uses requirement language | Pool notice uses requirement language |
| Count pinned | Identify the fixed count | Identify the fixed count |
| Disabled machine | Disabled | Disabled |
| No valid recipe | No recipe selected | No recipe selected |
| Power restriction | Name the actual tier or supply restriction | Same restriction; Pool is not free machine power |
| Multiple limiting resources | Name the relevant cause without a guaranteed single fix | Same principle |
| Calculation unavailable | State unavailability; do not show invented rates | Same principle |

Input shortage, output limitation, and unmet target are separate facts.
Do not collapse them into a generic “not enough machines” message.

### Non-consumed inputs

For a circuit, catalyst, mold, or tool marked non-consumed, use a static
requirement rather than a fabricated consumption rate:

```text
Programmed Circuit · Required item

Setting                                      2
Not consumed.
```

Do not imply automatic replacement, wear, or consumption unless the dataset
and model explicitly represent it. Keep the effective selected alternative.

### Chance outputs

Use “Average output” when the displayed rate incorporates probability. Show
the chance only where it explains the rate. Do not promise a guaranteed
quantity per operation from a probability-weighted average.

### Resource identity and cell conversions

The tooltip must use the same concrete identity as the rendered slot and its
wire. An oredict choice must not revert to the first alternative on hover.
If a filled cell bridges a fluid input, keep source and destination units
distinct. Never expose hidden Tank nodes or synthetic pool IDs as machines
the player has placed.

## 9. Multiblocks: shared template, conditional fields

The default multiblock input/output tooltip should be identical to the
ordinary recipe version. The selected machine changes computed quantities,
not the basic explanation of supply, consumption, production, and targets.

Add fields only for mechanics actually present in the selected machine:

| Mechanic | Where it belongs | What to show |
| --- | --- | --- |
| Parallel operations | Machine summary or parallel control | Effective parallel count, clearly separate from machine count |
| Speed adjustment | Machine configuration | Effective duration or a labeled multiplier |
| Power adjustment | Power/configuration hover | Effective draw and its basis |
| Heating coils | Coil control | Selected coil and relevant heat/speed effect |
| Heat requirement | Recipe/configuration restriction | Required and available heat where supported |
| Casings, pipes, electrodes, anvils | Their own control | Actual selected effect |
| Energy hatch type/count | Power hover | Effective voltage/amperage restriction |
| Perfect overclocks | Configuration/power details | Actual modeled behavior; no “no wasted energy” slogan |
| Steam | Steam hover | Steam rate, not a second EU bill |

### Multiblock examples by mode

These values are also illustrative, not claims about a particular GT machine.

| Field | Build | Solve | Pool |
| --- | --- | --- | --- |
| Heading | Selected multiblock name | Same | Same |
| Count | Installed: 2 | Required: 1.25 | Required: 1.25 |
| Parallel configuration | 8 operations | 8 operations | 8 operations |
| Effective operation time | From selected configuration | Same source | Same source |
| Resource input | Connected supply | Supply for calculated requirement | Pool supply/import |
| Resource output | Connected destination/balance | Target or downstream requirement | Pool balance |

Do not multiply a per-machine parallel figure by machine count and keep the
label “Parallels”. Distinguish configuration, available parallel capacity,
and actual active operations if more than one is shown.

### Authority of machine values

Curated machine behavior takes precedence for covered machines. Existing
effective-stat, overclock, power, and steam helpers must provide the values.
Do not derive authoritative tooltip numbers solely from baked handler stats.
Do not treat exported runtime calculations as universally authoritative for
multiblocks. Do not infer heat behavior from the mere presence of a coil.

Machine-specific exceptions should be structured by capability or existing
configuration metadata. Avoid a new switch containing one prose template
for every named multiblock. A Chemical Reactor and its compatible multiblock
handler should share almost all input/output presentation code.

## 10. What the current implementation tells us

This is a source inventory, not a claim that every listed branch is reachable.

| Source | Current responsibility | Proposed work |
| --- | --- | --- |
| `src/components/flow/FactoryFlow.tsx` | Mode keys and no-target notice | Current visual/copy pass; keep modes aligned |
| `src/components/nei/tooltip-style.ts` | Shared panel palette and bevel | Reuse, avoid separate skins |
| `src/components/nei/MinecraftTooltip.tsx` | Rich and plain tooltip rendering | Preserve lazy content and positioning |
| `src/components/nei/GlobalTitleTooltip.tsx` | Converts title attributes to tooltips | Same shared skin; simple text remains simple |
| `src/components/flow/RecipeNode.tsx` | Port, status, count, power, and configuration tooltips | Gradually separate facts from presentation |
| `src/components/flow/flow-explainers.ts` | Port/demand explanations and state words | Mode-aware phrasing from existing facts |
| `src/components/flow/node-verdict.ts` | Rail ports and diagnostic facts | Reuse; do not replace diagnoses with copy logic |
| `src/components/flow/MachineStatsContent.tsx` | Machine header hover | Review effective-stat source and shorten prose |
| `src/lib/solver/solve-mode.ts` | Target/count calculation | Source semantics; no calculation change in copy pass |
| `src/lib/solver/pool-mode.ts` | Shared resources and imports | Source pool interpretation |
| `src/lib/solver/power-report.ts` | Power and steam reports | Reuse effective values and restrictions |

### Specific findings to address during implementation

1. `unwiredDetail` has Pool wording asking for a source drawer from the Pool
   bar. This conflicts with current automatic-import behavior and the lack
   of that source key. Verify reachability, then remove or correct it.
2. `MachineStatsContent` labels overclocks “Exact” using exported runtime
   variants and otherwise gives an “Estimated” explanation. That criterion
   is insufficient for the curated machine math now used elsewhere.
3. The same component compares handler-applied duration/power for summary
   bonuses. Audit those against effective selected-node stats before calling
   the values authoritative or writing more confident text around them.
4. Port rich content returns `undefined` when both nameplate and current rate
   are nearly zero. Decide how no-target, unavailable, and NC states should
   be explained instead of losing the useful panel or showing raw fallback text.
5. `PortStory` currently encodes state, tone, and prose. Numeric rows need a
   structured presentation model; do not parse numbers back out of sentences.
6. The existing output demand/plug hover is separate from the resource hover.
   Avoid repeating the same demand explanation in both places.
7. Solved machine counts already distinguish pinned and calculated values.
   Reuse that distinction and rounding behavior rather than inventing another.

## 11. Proposed implementation shape

Resolve mode once as `build | solve | pool`, then build a small presentation
object from the selected node, effective resource/recipe, rail data, and the
latest result. A conceptual shape is:

```ts
type RecipeTooltipView = {
  title: string;
  subtitle?: string;
  status?: { label: string; tone: string };
  rows: Array<{ label: string; value: string }>;
  reason?: string;
  requirement?: string;
  actions: Array<{
    gesture: string;
    key?: string;
    label: string;
  }>;
};
```

This is a proposal, not an instruction to add a generalized UI framework.
Use existing status/tone types rather than loose strings in actual code.
Keep resource quantities structured until the final unit formatter.
Use a small typed gesture set for actual action rendering. The example's
strings describe the concept; do not build a free-form shortcut parser.

Separate three responsibilities:

1. Obtain authoritative facts using existing helpers.
2. Select relevant labels, fields, and reason for the mode and state.
3. Render a shared compact layout.

Mode-specific output should be a small branch over shared facts, not three
copies of the machine component. Render only while hovered where possible.
Do not trigger a solve, scan the entire dataset, fetch a recipe, or subscribe
every card to broad store state just to show a tooltip.

Do not change wire compatibility, stored counts, target constraints,
resource matching, or balance calculations to make a proposed sentence true.
If a desired field is not available, record that gap and omit it until its
meaning and source are established.

## 12. Action hints and interaction

### The minimum useful action footer

Apply the simplest useful rule: show the gesture and its result, once. A
tooltip should reveal hidden interactions without becoming an instruction
manual. For a normal resource row, the proposed footer is:

```text
[left mouse]  Recipes  [R]    [right mouse]  Uses  [U]
[left drag]   Connect         [left drag → empty space]  Drawer
```

Bracketed mouse descriptions above stand for small drawn icons, not literal
UI text. Use a mouse outline with the relevant button highlighted; combine
it with a short arrow for dragging. Key shortcuts use compact keycaps.
Use neutral theme colors and the same icon weight as the rest of the UI.
No emoji, animation, colored instruction tiles, or large legend.

If an icon is not immediately clear at the actual rendered size, keep the
short text label instead. The plain-text equivalent is:

```text
Left click / R · Recipes      Right click / U · Uses
Drag · Connect               Drag to empty space · Drawer
```

This is an alternative presentation of the same actions, not a second block
to put under the icon version. Icons should reduce text, not add decoding work.

### Verified gesture matrix for ordinary resource rows

The mapping below was checked against `usePortRowBrowse` in `RecipeNode.tsx`,
`port-browse.ts`, the R/U listener and connection handling in `FactoryFlow.tsx`,
and `addStorageForConnection` in `factory-store.ts`.

| Hovered surface | Build | Solve | Pool |
| --- | --- | --- | --- |
| Input or output: left click / R | Recipes producing this resource | Same | Same |
| Input or output: right click / U | Recipes consuming this resource | Same | Same |
| Input or output: left drag to compatible port | Connect | Connect | Omit: manual wiring is disabled |
| Input: left drag to empty space | Create connected drawer | Create connected drawer | Omit: no drawer is created |
| Output: left drag to empty space | Create connected drawer | Create connected drawer | Create product drawer, when one does not already exist |

“Recipes” always means recipes producing the hovered resource; “Uses” means
recipes consuming it. These labels do not reverse on an input versus output.
R and U act on the resource under the pointer, not a global selection.

A drag's destination determines its result. Do not advertise “Drag · Drawer”
without the empty-space qualifier. A compatible port/card drop connects in
Build/Solve; an arbitrary drop is not a guaranteed drawer operation.

In Pool, an existing product drawer for the resource prevents a duplicate
from this gesture. Omit the creation hint in that case. If a disabled action
needs explaining, use one brief reason in the existing drag feedback; do not
fill the hover with a list of things the user cannot do.

### Three concrete footer examples

Append these to the relevant resource examples in section 7. They are not
additional body paragraphs or a reason to repeat the rates.

**Chemical Reactor input, Build or Solve**

```text
Left click / R · Recipes      Right click / U · Uses
Drag · Connect               Drag to empty space · Drawer
```

**Chemical Reactor imported input, Pool**

```text
Left click / R · Recipes      Right click / U · Uses
```

**Chemical Reactor output, Pool, no existing product drawer**

```text
Left click / R · Recipes      Right click / U · Uses
Drag to empty space · Product drawer
```

These footer differences apply to ordinary multiblock resource rows too.
Machine-specific chemistry does not need a different gesture legend.

### Other controls: advertise only their own actions

| Surface | Candidate hint | Condition |
| --- | --- | --- |
| Calculated machine count | Left click · Pin count | Solve/Pool, not pinned |
| Pinned machine count | Left click · Edit pin | Solve/Pool, pinned |
| Pin editor | Clear · Unpin | While editing; this is not a keyboard shortcut |
| Machine selector | Left click · Choose machine | Only on the actual picker trigger |
| Configuration selector | Left click · Change setting | Only when enabled and supported |
| Static machine summary | No action footer | No direct action on that hover target |
| Status text | No generic action footer | Do not invent navigation or repair actions |

The count interactions are already present. Verify each remaining control's
actual handler before using the candidate label. A name, picture, or summary
is not automatically the machine picker. Do not copy “Choose machine” to
every machine-related hover just because a dropdown exists elsewhere.

Do not label every plus/minus button “Click to increase/decrease” if the
visible control already says that clearly. The high-value hints are hidden
gestures, alternate mouse buttons, shortcuts, and destination-dependent drags.
Keep the common Recipes/Uses hints stable on actionable resource rows; do
not hide them merely because an experienced user may already know them.

Do not add adaptive “seen once” suppression or a preference switch initially.
Compare the first real examples, then remove hints that add no information.

### Layout and behavior

- One final footer, one divider, normally at most two rows on desktop.
- Group equivalent gestures: Recipes gets one mouse icon and one R keycap.
- Keep action words to one or two words where practical.
- Keep the destination qualifier for drags, even if that entry must wrap.
- Use readable secondary text, approximately 12–13px, rather than tiny print.
- Wrap on narrow viewports; do not truncate a gesture or hide a shortcut.
- Do not change the tooltip's border, background, or heading to advertise actions.
- Do not add the action hints to the body as full sentences as well.

Existing tooltip panels are pointer-inert. Keep them that way in this pass:
the footer is a legend for the hovered surface, not a toolbar to click.
The action hint data must use the same mode/capability conditions as the real
interaction. Do not introduce another interpretation of what a drag can do.
Where those conditions are not available cheaply, identify the data gap and
resolve it without a new whole-board scan on each mouse movement.

### Touch, keyboard, and accessible descriptions

Mouse icons need accessible text such as “Left click: Recipes; shortcut R”.
When equivalent text is already included, mark the icon decorative to avoid
duplicate announcements. Do not encode the mouse button only by color.

Keep a concise accessible description on controls whose native title is
replaced by rich content. Do not imply R/U work on a keyboard-focused control
until that is implemented and verified; the current resource shortcuts use
the pointer's location.

Touch resource rows currently use a browse menu on tap or held press, with
drag handling separate. Do not advertise a desktop right click on touch.
Current hover suppression means a tooltip footer alone does not solve touch
discoverability. Keep the existing gestures; a persistent touch/keyboard
details surface remains a separate design decision.

## 13. Review and test matrix

Use a small fixture plan with real recipes for implementation QA. Include:

- One ordinary Chemical Reactor, fully connected and operating.
- A missing consumed input connection and a missing output connection.
- Restricted upstream supply and a stopped downstream consumer.
- A declared target that is met, and one that is not met.
- A fractional calculated count and a pinned count.
- A Pool input with no producer and a Pool input with local producers.
- A local Pool producer that cannot cover demand.
- Surplus stored, consumed internally, and discarded where supported.
- The same recipe with a supported multiblock handler.
- One genuine configuration restriction, such as a supported tier/heat limit.
- A non-consumed slot, chance output, concrete oredict context, and cell/fluid pair.

For each applicable case, review all three modes. Expected differences are
wording, selected fields, and actual existing mode calculations—not altered
machine mechanics.

### Semantic tests

- Pool imports must not produce a “connect this input” instruction.
- Pool must not show “add a source drawer” for an automatic import.
- Build count labels must not claim the number was calculated from a target.
- Pinned counts must be identified as fixed in Solve and Pool.
- Current, capacity, required, and target values must not be interchanged.
- Do not recommend more machines when power, input supply, or output capacity binds.
- Preserve item/fluid units and selected concrete resource identity.
- Curated effective stats must win where the calculation already uses them.
- Mode changes must update tooltip data and notice color without a reload.
- Left click/R and right click/U must map to producers and consumers on both sides.
- Pool inputs must not advertise drawer creation or manual wiring.
- Pool outputs must omit drawer creation when a product drawer already exists.
- Drag hints must distinguish compatible targets from empty space.
- Pinned and unpinned count controls must advertise the correct action.

### Visual checks

- Large mode/machine heading is readable without making the panel oversized.
- Long resource names wrap rather than hide the identifying text.
- Two rate rows align; units do not detach from values.
- Pool's extra rules do not create a dense paragraph.
- Bottom/right-edge placement remains in the viewport.
- The panel uses the same gray and bevel as the canvas controls.
- No overlapping native title and rich tooltip.
- Action icons are recognizable, shortcuts legible, and drag qualifiers visible.
- A static hover does not look clickable just because it has the shared panel style.
- The action footer stays compact and wraps cleanly at narrow widths.
- Ordinary hover does not rerender unrelated board geometry or reroute wires.

Run the repository's typecheck and full Vitest suite for implementation
changes. Add focused semantic tests for mode branches; avoid tests that only
pin arbitrary CSS strings. Use screenshots for typography and panel layout.

## 14. Incremental rollout

1. Finish the mode tooltip and no-target notice pass.
2. Review these example layouts and choose the amount of numeric detail.
3. Implement one Chemical Reactor input/output/state set and its action footers
   across all modes.
4. Review real screenshots for normal, limited, and imported inputs.
5. Add machine count and machine-header tooltips with effective stats.
6. Apply the shared template to a compatible multiblock handler.
7. Add configuration-specific details only where the machine supports them.
8. Audit remaining ordinary recipe wording, then plan specialized cards.

Each stage should be a small, reviewable change. Revisit the proposal when a
real example shows that a label is ambiguous or a field duplicates the card.
Do not use this document as a reason to ship a broad unreviewed rewrite.

## 15. Decisions for the next discussion

| Question | Recommended starting point | Alternative |
| --- | --- | --- |
| Repeat rates already visible on a port? | Only when a comparison explains a limitation | Always show two fixed rate rows |
| Show mode on every hover? | Machine summary only when needed; input/output uses contextual labels | A small mode label on all recipe tooltips |
| Show whole-machine rounding? | On the count hover only | Include it in the machine header too |
| Keep the port capacity bar? | Review beside the new numeric comparison before deciding | Remove it if it adds no useful distinction |
| Generic overclock tutorial? | Omit from the normal machine hover | Put a short formula in a separate details surface |
| Unique multiblock prose? | Only for an actual supported mechanic | A dedicated explanation for every machine |
| Main status wording? | Literal state plus resource/cause | Preserve existing status names but rewrite detail text |
| Action hints? | Mouse icons plus short labels and R/U keycaps | Short text gestures if icons are unclear |
| Obvious button actions? | Omit redundant instructions; retain hidden gestures | Show every available action |

The first concrete review should be a Chemical Reactor's input, output, and
machine-count tooltips in Build, Solve, and Pool, including their available
actions. That is enough to establish
the language and visual pattern before extending it across the site.
