# Power generation (src/lib/power)

- Generator cards follow the community "GTNH Power Planner" workbook, decoded in
  `docs/power-planner-math.md`; where the workbook and the Java disagree on flows, the Java
  wins (THTR: TRISO pebbles in, burned pebbles out per 9-hour operation, helium is a kept
  charge; HTGR: fuel, burned fuel and 256 L helium lost per cycle, cycle length from
  onRunningTick's speedups, `htgrOperation` in `sources/reactors.ts`).
- A power card's unlock chip is the tier of the controller's own recipe.
- EU is a wireable resource. The EU-per-unit rate display never splits energy between a
  recipe's outputs (`src/lib/model/rate-unit.ts`).
- Coolant cells are ports; the vacuum freezer is a placed machine, not built in.
- "Free" inputs (`FREE_INPUT_ITEM_IDS`) are never consumed or wired.
- Tooltips can lie (the ECE's lubricant line) and the workbook can be wrong (MOX rods);
  the Java wins.
- `boilerFuels`: `euPerItem` is burn ticks, `burnTime` is large-boiler seconds.
- On load, `resynthesizePowerRecipes` must run before `dropCrossFormConnections`, or power
  cards lose their fuel wires. A cloned power card remints its owned recipe.
- The closed-plan rule waives unwired power outputs, or old generators load dead.
- Exam: `power.test.ts`.
