# Pool worksheet (src/components/pool)

The worksheet IS Pool mode's interface, not a fourth mode. It covers the mounted canvas
(positions, wires and camera survive untouched) and borrows the inspector's width.
It reads the same solve books and `buildMachineList` figures as the board.

- Reuse, don't rebuild: `RecipeNodeEditor` renders the card's own controls without
  handles; settings use `MachineConfigControlPanel`; counts use `SolvedMachinesStat`;
  single-block voltage uses the card's tier chip; rules use `RuleButton` in its "table"
  dress. Specialty machine behaviour must stay shared between card and worksheet.
- Layout: Desired rates beside Total power on top; the recipe table below, where each
  scope (All production, then each production group) opens with its Inputs / Outputs /
  Internal materials (`renderScope` in `ProductionGroups.tsx`).
- A machine group is one `<tbody>`: Picture / Machine / Tier / Count / Power span its
  recipe rows; Status and Circuit are per recipe; actions on the right. Settings are
  closed by default and open from the gear into a full-width row below the group.
- Takes / Makes are compact icon rows; their column widths are measured once from the
  widest recipe and shared by every row (`--pool-takes-width` / `--pool-makes-width`).
- No minimum table width and no horizontal scroll. Breakpoints: stacked machine header
  at 1080px of worksheet width, two-column rows at 660px.
- Drags are pointer-based (`worksheet-pointer-drag.tsx`): app-drawn preview, edge
  auto-scroll, Escape cancels. Never native drag images. Order and folded rows are
  per-plan browser state (`WorkspaceView.poolWorksheetOrder`, `poolCollapsedMachines`),
  never the project or undo history.
- Wheel over settings and hatch controls uses a non-passive capture listener so the
  page does not scroll.
- Production groups: the Balance toggle pressed (the default) = Match, off = Ignore
  (pinned in `PoolWorksheet.test.tsx`). Scope semantics are in `src/lib/solver/CLAUDE.md`.
