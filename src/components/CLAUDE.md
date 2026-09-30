# App UI (src/components)

The board has its own notes in `flow/CLAUDE.md`, the Pool worksheet in `pool/CLAUDE.md`.

## Interface scale: two pixel spaces

- `src/lib/ui-scale.ts` owns the size setting (60-200% of a default that is itself
  `UI_SCALE_BASE`, or `UI_SCALE_PHONE_BASE` on compact screens). A boot script in
  `layout.tsx` stamps `--ui-scale`, `data-compact` and `data-snug` before first paint.
- The app shell is CSS-`zoom`ed (`.ui-scale-shell`); the board UNZOOMS itself and carries
  the factor through its camera (`boardMaxZoom`, `boardZoomScale`). Never CSS-zoom the
  board: React Flow then measures cards and the pointer in two different spaces.
- Every measurement must know its space. REAL px: `clientX`, `getBoundingClientRect`,
  `window.innerWidth`, anything inside `.react-flow`, anything portaled to `document.body`.
  SHELL px: `offsetWidth`, `clientWidth`, `scrollLeft`, style lengths, ResizeObserver rects.
  The ratio is `getUiScale()`. Body portals keep real-px positioning and wear `.ui-zoom`.
- Viewport units are not divided by zoom: inside the shell use `--ui-vh` / `--ui-vw` /
  `--ui-dvh`, never bare `vh` / `vw`.
- The `compact:` / `snug:` Tailwind variants key on the html attributes, not media
  queries. `getUiScale()` is 1 where `matchMedia` is missing (server, jsdom).

## Compact mode (phones, small windows)

- `src/lib/compact-view.ts`: compact under 900px wide OR 560px tall (shell px). Ask the
  media query, never `window.innerWidth`, which mobile browsers widen when content overflows.
- Compact swaps the three columns for the board plus two drawers (`PanelDrawer`), the top
  bar for `AppMenu`, each toolbar for one folded button. Drawers track the finger by
  writing `translate`, not `transform`: Tailwind's translate utilities set `translate`, and
  a `transform` would compose with it and double the offset. Pair any min-height with
  `compact:min-h-0`.

## Recipe search (RecipeSearchOverlay.tsx)

- `RecipeBrowser.tsx` owns the query state. `browseResource` / `clearResourceBrowser` are
  the only doors in and out. A query is clauses (`recipe-query.ts`) plus ANY / ALL / ONLY
  per side; the server does the set algebra (`src/lib/server/CLAUDE.md`).
- Machine chips are a persisted multi-select (`machine-map-selection.v1`), sent as
  `mapMode` + `map=`; counts always cover everything that matched.
- Results page through machine sections in chip order. An open section short of its
  count shows skeletons; the first (`[data-awaiting-page]`) asks for the next page, and
  `onLoadMore` only advances from a page that has landed (`landedRecipePageKeyRef`).
- Back/forward stacks live in the store (`browseBack` / `browseForward`); Alt+arrows and
  a bare Backspace walk them.
- An add lands at `nearestFreeSpot` and the camera follows. An add started from a card's
  port wires only the clicked resource (`addConnectedRecipeNodeToState`). Refactor
  (`beginRecipeRefactor` -> `refactorNodeWithRecipe`) replaces the card in place,
  re-docking wires whose resource survives; if none would survive, it lands beside instead.
- The tier ceiling also filters generator cards by their `unlock` chip, client side
  (`powerUnlockWithinTier`); a source with no chip is never filtered.
- A machine pin (`recipeBrowserMachinePin`) scopes the maps to one machine and adds a
  recipe section to an existing card (`addRecipeToNode`).
## Inspector and panels

- Right resource column 234 shell px, left items panel 256 (desktop and drawer caps).
  Keep virtual-list row heights in sync with the CSS (`inspector/panel.css`).
- Resources show Raw or Net, switched in the first section header (Raw by default). In
  Solve, drawer rate rows hang under their resource like files in a folder
  (`BoundaryDrawers` in `inspector/flow-sections.ts`).
- The machine list is one row per CARD, never merged (`buildMachineList` in
  `src/lib/model/machine-list.ts`).
- Power display (EU/t or amps at a tier) and rate units are view dials read through
  `useRateDisplayUnits`; memoized rows subscribe to both themselves.

## Shared UI behaviour

- Dropdowns dismiss through `useDropdownDismiss`: the mouse fade counts from the nearest
  point the pointer has reached, so a panel that opens away from the pointer can be
  walked to. `fadeKeep` names the element a menu hangs from.
- Tooltips never keep themselves open: `pointer-events-none`, close as soon as the
  pointer leaves the control. Above-card tooltips anchor to their control when no card
  exists (the Pool worksheet).
- React's wheel handlers are passive: a control that adjusts on wheel needs a native
  non-passive listener to `preventDefault` the page scroll.
- Build heavy hover content lazily (pass a thunk).
- Rendered item textures keep the art in the middle half of the image; draw them at 2x
  the box.
- `DesignTabs` effects that grab refs must depend on `isHydrated`.
- Sounds (`src/lib/board-sounds.ts`) play on the canvas, recipe search, Pool worksheet and
  Library, all quiet, through one engine and its mute/volume. Firefox flushes audio at the
  end of a task: play a sound before heavy work and it is clipped.
- The Welcome tab (`welcome/`, state in `src/lib/welcome/welcome-tab.ts`) keeps its
  backdrop paused while hidden.
