# Machine feedback pass — September 2026

This is the player-report queue and resolution log. Completed here means the
specific reported defect was addressed, not that every mechanic is modeled.
Release 3.1.3 is pending deployment; production was 3.1.2 when checked September 11.

| Order | Machine | Report | Resolution |
|---|---|---|---|
| 1 | Neutron Activator | Astralzx: height should be adjustable; tall builds are unrealistically slow. | Fixed in `7a7021b`, pending 3.1.3. Direct integer entry from 4 pipe casings with no structural maximum; game-source duration rounding and sub-tick throughput. Accelerator power and neutron kinetic energy regulation remain unmodeled. |
| 2 | Utupu-Tanuri | Lord Peverell, September 9: missing coil benefits and incorrect structure picture. | Pending 3.1.3. Vacuum Furnace now matches the existing Utupu-Tanuri definition; both modes receive coils, 2.2x speed, half EU, up to 4 power-limited parallels, heat discounts and perfect overclocks. Picker starts at recipe heat. Removed the incorrect render; the actual controller icon is used. |

## Utupu-Tanuri evidence

- Game source: `GT5-Unofficial` local revision `8e23867`,
  [MTEIndustrialDehydrator.java](https://github.com/GTNewHorizons/GT5-Unofficial/blob/8e23867/src/main/java/gtPlusPlus/xmod/gregtech/common/tileentities/machines/multi/processing/MTEIndustrialDehydrator.java).
  `getAvailableRecipeMaps` lists both maps. `validateRecipe` requires coil heat
  at least equal to recipe special value. Shared processing logic uses 1/2.2
  duration, 0.5 EU, 4 parallels, heat discount and heat overclocks with raw coil
  heat (no voltage heat bonus).
- The [player-supplied wiki page](https://wiki.gtnewhorizons.com/wiki/Utupu-Tanuri)
  agrees: 5% multiplicative EU discount per 900 K excess and one perfect OC per
  1800 K excess. Dehydration starts from zero K; vacuum recipes do not.
- Local 2.9.0-beta-2 export: 88 Multiblock Dehydrator recipes and 17 Vacuum
  Furnace recipes, all without explicit handler lists. The screenshot's
  sulfur/antimony/poor nether waste recipe is
  `gtpp.recipe.vacfurnace:a068a7261b3d65c2`: 1200 ticks, 30720 EU/t, 7200 K.
  Vacuum Furnace previously had no curated match, so its exported runtime
  calculation bypassed the machine's modifiers and coils.
- At UV with four parallels, that recipe is 272 ticks with Naquadah coils;
  Trinium supplies 1801 K excess, two heat discounts and one perfect OC,
  reducing it to 136 ticks. LuV power only supports two simultaneous parallels.
- Tests: `src/lib/machines/utupu-tanuri.test.ts` covers both modes, heat minima,
  old/default coil selections, runtime bypass and the singleblock boundary.
  Structure-art tests prevent the incorrect render from returning.
