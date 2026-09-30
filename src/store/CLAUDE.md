# Stores, designs and plans (src/store)

`factory-store.ts` owns the project graph, solve results, selection and undo.
`design-store.ts` owns the design library (IndexedDB) and tabs. Related code:
`src/lib/designs/`, `src/lib/library/`, `src/lib/import-export/`, `src/lib/community/`.

The plan of record is IndexedDB; localStorage `project.v2` is only a one-shot seed.
Load migrations are not Zod-guarded: open each design under its own guard and never make
an unreadable design active.

## Two tabs share one library

Every save goes through `persistCanvas` in design-store.ts:
- A tab remembers the stored version its canvas came from (`canvasBase`). A save lands
  only if storage still holds that version, checked and written in one IndexedDB
  transaction (`writeDesignIfUnchanged`).
- A tab writes only what it was edited into (`isEditingInThisTab`): a background tab
  changes its plan by itself (recipe refresh) and must never echo that back. Changes
  made while a plan is being put up (`showProject`) never count.
- A stale tab holding its own edits saves them as "<name> (conflict copy)" and says so
  (`TabConflictNotice`). Nothing is lost either way.
- Saves are queued (`persistQueue`) so one tab never conflicts with itself, and
  `writeDesignSummary` keeps the stored plan stamps (`keepStoredPlanMarks`). Copy names
  come from `conflictCopyName` (counted, never stacked, clipped to 80 characters).
- Tabs announce saves over a BroadcastChannel (`design-tab-sync.ts`); a visible tab with
  no edits reloads at once, a hidden one checks when it comes back into view.
- Exam: the "two browser tabs" block of `design-store.test.ts`.

## Plans arriving and leaving

- Every arriving plan (import, paste, `#p=` link, a community copy) opens as a NEW design
  via `importProjectAsDesign`. Nothing calls `setProject` over the open design.
- Copy plan puts a link on the clipboard: `<origin>/#p=gtnh1.<deflate-raw base64url
  JSON>` (`plan-code.ts`). The arrival code is captured at module load
  (`src/lib/open-plan-code.ts`) because the address is rewritten later. Players never see
  the word "code".
- Plans are slimmed by dropping GregTech `runtimeCalculation` tables
  (`withoutRuntimeTables`), but only for recipes this page has seen the dataset carry
  (`isRestorableRecipe`); the landing refresh re-fetches bare recipes (`recipesToRefresh`).
  Account sync pushes the same slim plan.
- Import/export preserves resource identity (`fluid.*` in the UI means fluid metadata was
  not resolved), recipe overrides, chosen handlers, tier/config and concrete oredict picks.
- Recipe ids are not stable across exports: import keeps an id the dataset still has and
  re-finds a missing one by CONTENT (`resolve-recipes`, then a name search scored by
  content). Never accept a name match alone.

## Public view

- Someone else's community post opens VIEW-ONLY (`design-store.publicView`, transient, no
  design id). Never autosave it into a personal design. Only an explicit copy ("Make a
  copy" on the view bar, "Open a copy" in the Library) adds it to the library.
- `factory-store` refuses project edits while `isReadOnly`. Resource clicks must not open
  recipe search in view mode; `data-viewer-inspect` never wraps ports or editing controls.
- An owner's posted design follows autosaves (`src/lib/community/post-follow.ts`): plan
  and metadata only, never a timed live-board photo (capturing forced glance mode and
  stalled the board every minute).

## Account sync (src/lib/library/library-sync.ts)

- The Supabase instance is small. Pushes wait for 5 s of quiet (30 s max while editing,
  at once when the tab hides). Only a LOCAL change schedules a push, judged by
  `libraryChangeSignature`, never by array identity; a run never schedules the next one.
- A design the server refused is not resent until its stamp moves. Names are clipped to
  80 characters. Hidden tabs skip the poll.

## Recipe browser state

`browseResource`, `browseBack` / `browseForward`, `recipeBrowserMachinePin`,
`beginRecipeRefactor` live in factory-store; the rules are in `src/components/CLAUDE.md`.
