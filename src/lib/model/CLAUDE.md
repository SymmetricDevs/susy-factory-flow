# Domain model (src/lib/model)

Types, Zod schemas, resource keys, recipe rules, and the load funnel
(`project-normalize.ts`) every saved or imported plan passes through.

## Cells are items

- A filled cell is an ordinary ITEM; it never satisfies its fluid's slot or the reverse.
  `resourceMatchesInput` compares kinds strictly. Don't add a cross-kind branch.
- Crossing forms takes a machine, as in the game (thousands of Canner recipes). The
  pipeline also mirrors fluid Canner recipes into a free "Tank" map (0 EU, 1 tick, real
  slots including empty cells).
- Loose cell wires (always on): a cell and its fluid may wire directly either way. The
  edge stays same-kind and carries the Canner's litres per cell on `edge.crossForm`,
  fetched at wire time; no ratio found, no wire. The pair question is
  `getCrossFormCellMatch` (resources.ts). The rule lives only in the gesture, edge survival
  (`isFactoryEdgeStillValid`, `dropCrossFormConnections`) and the solver expansion.
- Never auto-convert at a guessed 1000 L per cell: it hid a real machine, its empty cells
  and its power.
- `isFluidEquivalentToFilledCell` (name-tolerant) is shared by search, the loose-wire pair
  match and Pool's cell pairs. It converts nothing: only a Canner ratio lets anything wire.
- `dropCrossFormConnections` compares KINDS only, never ids (slots legitimately carry ids
  the edge does not).

## Ore dictionary and concrete items

- Concrete items carry their oredict membership. Uses of a concrete item include exact
  recipes, compatible oredict recipes and alternatives that contain it.
- A recipe picked from a concrete item keeps that concrete item in its slots through
  creation, refresh and reload (Spruce Log never silently becomes Oak Log). Handles and
  matching use the effective rendered resource, overrides included.
- Unresolved oredict slots cycle their ART only; names stay "Any ...", and rates, wire
  colours, handles and solver identity stay fixed. Never store animation frames or invent a
  concrete source for an icon (`category-presentation.ts`).

## Shared machines (shared-machine.ts)

- One card can run several recipes on one machine. Section 0 is `recipeId`; sections
  1..n are `FactoryNode.extraRecipes`. Count, tier, power and knobs are shared; slots,
  wires and oredict picks are per section.
- Addressing: section handles wear an `r<n>:` prefix (`sectionHandleId` /
  `splitSectionHandleId`); a section's solve node is `card#r<n>` (`sectionNodeId`).
  Anything resolving "the recipe at this handle" reads the section (`sectionNodeView`),
  never `node.recipeId` alone.
- `removeRecipeSection` (a factory-store action) drops the section's wires and renumbers
  later ones; removing section 0 promotes the next. Generators, crop farms and custom rate
  cards never share. Exam: `shared-machine.test.ts`.

## Boards and lists

- `board-windows.ts` (`computeBoardLevelView`) decides what the canvas shows: the root plus
  every open board, recursively. `board-paper.ts` picks papers (`pickBoardPaper`,
  `paperForBoardId`). `flattenBoards` surfaces members where their frames stood.
- `machine-list.ts` (`buildMachineList`): one row per card. Build counts the card's
  `machineCount`; Solve / Pool sum its sections' required machines, fractions kept.

## The load funnel (project-normalize.ts)

`normalizeLoadedProject` snaps positions to the grid and migrates legacy shapes (trash
cans to trash drawers, stored setup rules dropped, cross-form wires dropped). Unknown keys
are stripped by the Zod schema on import, paste and server paths, not here; IndexedDB
loads are not schema-parsed. Old plans must keep opening: add a migration rather than
breaking a schema.
