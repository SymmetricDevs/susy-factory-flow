# Server and API (src/lib/server, src/app/api)

## Recipe queries (dataset-query.ts)

- A query is clauses (`role:kind:id`, `src/lib/datasets/recipe-query.ts`) plus
  `takesOp` / `makesOp` (any / all / only) and the map selection. The server does set
  algebra over the lookup index (`getClauseLookupRecipesByMap`): any = union,
  all = intersection, sides intersect. Every clause gets the concrete-context rewrite
  (`applyClauseResourceContexts`).
- ONLY is verified against recipe bodies (`recipeIsOnlyMatch`) up to `ONLY_VERIFY_LIMIT`
  candidates, then degrades to ALL. Non-consumed inputs never count against takes-ONLY.
- All-maps answers page through `recipeMaps` in chip order, best match first inside each
  map (`orderByRecipeMap`).
- The catalog mixes in server output, so its cache key includes `APP_VERSION`. A new
  catalog field must be added to `getDatasetCatalog`'s explicit field list (and
  `RecipeDataset` in types.ts) or it never reaches the client.
- Dataset files other than textures may be replaced in place; textures are
  cache-immutable, so a changed icon needs a new name.
- Every server cache is bounded or index-sized (the Node heap is capped at 3 GB). A slow
  site: check the heap first.
- The OG card route reads fonts through `process.cwd()` (non-standalone build).

## Supabase (community.ts, resource-popularity.ts)

The instance is small and has gone down under load. Rules:
- Every request goes through `fetchWithDbTimeout` (20 s) and aborts with a plain
  AbortError; postgrest-js retries other failures three more times.
- Nothing a page needs to render may await a community sweep. `getResourcePopularity`
  answers at once with the last good map (sweep every 6 h, retry after 30 min on failure).
- The design PUT refuses what it can without the database (size, JSON, name, stamps)
  before the rate limit's two queries; the plan schema check follows.
- Read community plan jsonb about 10 rows per statement, or it hits the statement timeout.
- The dashboard (restarts, disk IO, memory) needs the repo owner; there is no management
  token here.
