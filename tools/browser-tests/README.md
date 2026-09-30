# Icon sizing check (Chromium vs Firefox)

`ResourceIcon` draws sprite art larger than its clipped slot (`calc(200% - 8px)`) to crop
the dataset's transparent margin. With the default `flex-shrink: 1`, Firefox shrank the
art's width but not its height, so icons rendered smaller than in Chromium. Artwork
therefore keeps `shrink-0` in every renderer (images, atlas spans, hatch art, the NEI
aspect glyph). `itemZoom` magnifies art without enlarging the slot; `sprite-fit.ts` caps
it so wide or off-centre art stays whole.

## Run

```sh
node node_modules/playwright-core/cli.js install --with-deps --only-shell chromium firefox
npm run test:icons:browsers
```

The script starts its own Vite server, imports the real icon components and asserts slot
and artwork sizes (both engines within 0.16 CSS px) across sprite kinds, slot sizes,
interface scales, camera zooms and DPR 1 and 2. jsdom has no layout, so Vitest cannot
catch this. Results go to `.icon-sizing-results.local/` (or `ICON_TEST_OUTPUT`).
