# Card settings: one tile grammar

Status: PRD for approval, 2026-09-06. Nothing here is built.
Scope: the settings block on every card (the band between the ports and
the footer), plus the header and footer chips that are really settings.

## 1. Problem

The crop card's settings were rebuilt into captioned tiles with steppers and
read well. Every other card still shows the older panel: a grey band, a
caption, an icon well, and a dropdown. The band mixes real settings with
facts the machine simply has (the parallel count), gives every row an icon
well whether or not the rung has a face (a letter stands in when it does
not), and uses a dropdown for two-rung ladders and fourteen-rung ladders
alike. Generators have a third panel of their own.

## 2. Goal

One grammar. A setting is a tile. A tile has a caption, a value, and one of
four gestures. The gesture and whether the tile shows a face follow from
the setting's shape, not from which card it is on. Facts that cannot be
changed leave the settings block.

## 3. Inventory

Every setting a card can carry, with its shape, its gesture, and its face.

| Setting | Cards | Rungs | Shape | Gesture | Face |
| --- | --- | --- | --- | --- | --- |
| Heating Coil | EBF, Volcanus, Hearth, Arc Furnace, Zyngen, Autoclave, Pyrolyse, 3 more | 14 | ladder | step | coil block |
| Pipe Casing | Autoclave, Lathe, Dissection, Warehousing, 2 more | 6 | ladder | step | casing block |
| Solenoid | Large Fluid Extractor, Large Thermal Refinery | 11 | ladder | step | coil block |
| Electrode | Industrial Arc Furnace | 13 | ladder | step | none |
| Precise Casing | Precise Auto-Assembler | 5 | ladder | step | casing block |
| Sawblade | Industrial Cutting Factory | 4 | ladder | step | none |
| Electromagnet | Magnetic Flux Exhibitor | 5 | ladder | step | none |
| Laser Source | Hyper-Intensity Laser Engraver | 9 | ladder | step | hatch block |
| Tower Height | Mega Distillation Tower | 5 | ladder | step | none |
| Pressure | 8 steam multiblocks and steam singles | 2 | toggle | step | none |
| Field Coil | Naquadah Fuel Refinery | table | ladder | step | coil block |
| Voltage tier | every electric card | up to 15 | ladder | step | none, colour |
| Energy hatch count and type | electric multiblocks | 1 to 64 plus exotics | ladder plus typed | step, click types | hatch block |
| Machine count | every card | open | count | step, click types | none |
| Programmed circuit | recipes that need one | fixed | fact | none | circuit item |
| Parallel | 25 multiblocks, per Tier on 24 more | fixed by structure | fact | none | none |
| Growth, Gain | crops | 0 to 31 | count | step | none |
| Water, Fert, Sky | crops | short ladders | ladder | step | none |
| Biome | crops | tag count | ladder | step | none |
| Manager tier, Seed Bed | crops | voltage | ladder | step | none, colour |
| Growth Units, Fert Unit, Harvesting, Biome Cards, Overclocks | Industrial Farm | small counts | count | step | none |
| Aura, Frame Housings, Stimulators, Utility Blocks, Acceleration, Production, Royal Jelly | bees | item ladders | ladder or slot | step, or pick for slots | item |
| Tool per empty slot | TGS | category | slot | pick | tool item |
| Fuel, Rotor, Boiler, Steam type, Coolant, Reactor design, Pellet, Target block, Structure | generators | selects | ladder | step | item or fluid where one exists |
| Fuel rate, Duty, Acid rate, Pebble fill, Robot arms, Pipe tier | generators | numeric | count | step, click types | none |
| Oxygen boost, Liquid hydrogen boost | generators | on or off | toggle | step | none |
| Strict or overflow | buffer drawers | on or off | toggle | click | none |

Facts row: Parallel and Programmed circuit are not settings and leave the
settings block. Parallel goes to the header chip it already partly lives in
and to the machine hover. The circuit stays a chip on the port rail.

## 4. The four shapes and their one gesture each

There is no dropdown anywhere. A dropdown hides the neighbours of the
current rung, which is the one thing a ladder is about.

| Shape | Value text | Ends of the tile | Wheel | Click on the value | Long list |
| --- | --- | --- | --- | --- | --- |
| Ladder | the rung's name | minus and plus | steps | nothing | right click or held press opens the full list to jump |
| Count | the number and unit | minus and plus | steps | types a number | none |
| Toggle | the state's name | minus and plus | flips | flips | none |
| Slot | the item's name | none | nothing | opens the item picker | the picker is the list |

Minus and plus are the crop tile's narrow buttons. They are the same on a
two-rung toggle as on a fourteen-rung ladder: one grammar, learned once.
The full list on right click is the escape hatch for the fourteen-rung
coil, and it is the same list the tier chip shows for its ladder. Held
press stands in for right click on a finger.

## 5. Faces

A face is the item the rung stands for, drawn bare, in the well at the left
of the value. Rule: the well exists only when every rung of the ladder has
an item to show. A ladder with even one rung that has no item gets no well,
and its value text carries the whole meaning. No letters, no acronyms, no
placeholder art. This is what removes the letter chips.

By that rule, faces on: Heating Coil, Pipe Casing, Solenoid, Precise
Casing, Laser Source, Field Coil, energy hatches, bee items, TGS tools,
generator fuels and rotors. Faces off: Electrode, Sawblade, Electromagnet,
Tower Height, Pressure, every count, every toggle, the voltage tiers.

The voltage tiers and the seed bed keep their colour instead: the value
text is inked in the tier's own colour the way the header chip is.

## 6. Tile anatomy

The crop tile, made general.

```
+------------------------------+
| CAPTION                      |   11px small caps, muted
| [-] [face] Kanthal      [+]  |   value 13px, face 20px when present
+------------------------------+
```

- Caption is the setting's short name in the game's own word: COIL,
  CASING, ELECTRODE, SAWBLADE, MAGNET, LASER, HEIGHT, PRESSURE, TIER,
  HATCHES, MACHINES, FUEL, ROTOR, DUTY, WATER, SKY. No "Heating" in front
  of COIL, no "per Tier" in a caption.
- Value is the rung's own name and nothing more: Kanthal, not Kanthal
  Coil Block; High, not High Pressure; 256A, not 256A Laser. A count shows
  its unit small and muted after the number, the card's way.
- The tile is the crop tile's chrome exactly: the footer's bevel, the
  same border, the same ground. It sits on the card's own paper. No grey
  band around the block.
- A slot tile has no minus and plus. Its whole face is the click.
- A disabled tile (a tier control on a machine voltage cannot touch) is
  drawn at 35 percent, minus and plus included, and does not answer.

## 7. What a tile says on hover

The shared tooltip panel, rows only:

- Ladder and toggle: the rung's own effect where the data has it. Time per
  operation, draw per machine, parallel operations, heat, in that order,
  only the rows that apply. Then the footer: minus and plus step, wheel
  steps, right click for the list.
- Count: the number, its unit, and the range. Footer: click types, wheel
  steps.
- Slot: the item's name and what it does. Footer: click picks.

No sentence explains what a coil is. The name and the rows are the
explanation.

## 8. Layout

- Tiles pack four across at the card's width, wrapping, the crop panel's
  grid. A two-setting card gets two tiles on one row.
- Order is fixed and the same on every card: voltage tier and hatches
  first, then the machine's own ladders in the order the dataset lists
  them, then counts, then toggles, then slots.
- The voltage tier and hatch pair move out of the header into the first
  two tiles. The header keeps the name bar, its chevron, and the chrome
  buttons. The machine count moves out of the footer into a tile. The
  footer keeps usage, reason, and power, which are readings.
- The block is always a whole number of grid rows tall, the GridBlock
  rule.

Moving the tier chip and machine count is the visible change for a plain
singleblock, which today shows no settings block at all. Every card will
show at least two tiles: TIER and MACHINES. That is the point: the settings
are in one place on every card.

## 9. Generators and crops

- Generators drop their separate power config panel and use the same
  tiles. Their selects become ladders, their numbers counts, their booleans
  toggles. Fuel keeps its fluid face.
- Crops already are this. Their tiles keep the green ground because the
  card is green. The FORMULAS strip stays crop-only.
- Bees: Frame Housings and the other multi-slot pickers become a row of
  slot faces under one caption rather than one captioned tile each.

## 10. Out of scope

- Drawers keep their own small controls, they are not machine cards.
- Minimized boards.
- No new settings, no changes to any machine's math.

## 11. Rollout, each step reviewable

1. `SettingTile` with the four shapes and its hover, in `RecipeNode.tsx`
   beside the crop tile, sharing its chrome constants.
2. The ordinary config panel rendered on it, dropdown deleted, parallel
   row deleted, faces on and off by the rule in section 5.
3. Voltage tier, hatches, and machine count as tiles; header and footer
   slimmed.
4. Generator settings on the tiles; the power config panel deleted.
5. Bee slots as face rows; TGS tools as slot tiles.
6. Grid measurement probe on a singleblock, a coil multiblock, a generator,
   a crop farm, and a bee housing, in build and solve, at three widths.

## 12. Tests

- A unit test per shape: step wraps or clamps as the ladder says, a count
  clamps to its range, a toggle flips, a slot opens.
- The face rule pinned: a ladder with one faceless rung renders no well.
- The order rule pinned on a fixture card carrying every shape.
- Existing config tests updated for the removed dropdown.

## 13. Open questions

- Should the fourteen-rung coil ladder wrap at the ends or stop? The tier
  chip wraps. Proposal: wrap on ladders, stop on counts.
- Does the machine count tile also carry the solve-mode pin, or does the
  pin stay a footer reading? Proposal: the tile, with the pinned state in
  the value text.
- Whether the voltage tier tile should keep the tier colour as ground, as
  the header chip does, or only as ink. Proposal: ink only, so the tiles
  stay one family.
