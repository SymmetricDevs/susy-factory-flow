"use client";

import { SpawnKeys } from "@/components/SpawnKeys";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_DATASET_MANIFEST_URL } from "@/lib/datasets";
import {
  getRecipeDatasetRecipe,
  queryRecipeDatasetResources,
  queryRecipeDatasetRecipes,
  type RecipeDatasetQueryResult,
  type RecipeMapSelection,
} from "@/lib/datasets/browser-loader";
import type {
  RecipeQueryClause,
  RecipeQuerySideOp,
} from "@/lib/datasets/recipe-query";
import type { DatasetResourceIndexEntry, RecipeSummary } from "@/lib/datasets/types";
import { resourceMatchesInput } from "@/lib/model";
import { MACHINE_PIN_RESOURCE_ID, useFactoryStore } from "@/store/factory-store";
import { useDesignStore } from "@/store/design-store";
import { leaveWelcomeTab, readWelcomeTabState } from "@/lib/welcome/welcome-tab";
import type { RecipeInputPicks, TierFilter } from "@/store/factory-store";
import type { Recipe, ResourceAmount } from "@/lib/model/types";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import {
  OPEN_SIDEBAR_TAB_EVENT,
  takePendingSearchFocus,
  takePendingSidebarTab,
} from "@/lib/sidebar-tab";
import { writeWorkspaceView } from "@/lib/workspace-view";
import {
  deferStateUpdate,
  getDatasetVersionCacheKey,
  ResourceIndexPane,
  RESOURCE_SEARCH_DEBOUNCE_MS,
  type IndexedResource,
} from "./ResourceIndexPane";
import { ChevronIcon } from "./PanelDrawer";
import {
  RecipeSearchOverlay,
  type RecipeMapChip,
  type StencilClause,
} from "./RecipeSearchOverlay";

// The preview helpers used to live here; they moved out with the overlay and
// keep their old import path for everyone already using it.
export {
  contextualizePreviewRecipe,
  summaryToPreviewRecipe,
  type PreviewContextResource,
} from "./recipe-preview";

const RECIPE_QUERY_LIMIT = 120;

/** Whether the filter block under the search box is folded away. */
/** The machine chips' multi-select: which maps' recipes the search shows. */
const MAP_SELECTION_STORAGE_KEY = "gtnh-factory-flow.machine-map-selection.v1";

const RECIPE_QUERY_CACHE_TTL_MS = 90_000;
const RECIPE_SEARCH_DEBOUNCE_MS = 200;

interface RecipeBrowserProps {
  onLoadDatasetVersion: (versionId: string) => void;
}

export function RecipeBrowser({ onLoadDatasetVersion }: RecipeBrowserProps) {
  const datasetManifest = useFactoryStore((state) => state.datasetManifest);
  const datasetManifestUrl = useFactoryStore((state) => state.datasetManifestUrl);
  const selectedDatasetVersionId = useFactoryStore((state) => state.selectedDatasetVersionId);
  const projectRecipes = useFactoryStore((state) => state.project.recipes);
  const recipeSearch = useFactoryStore((state) => state.recipeSearch);
  const maxTier = useFactoryStore((state) => state.maxTierFilter);
  const browserResource = useFactoryStore((state) => state.recipeBrowserResource);
  const browserMode = useFactoryStore((state) => state.recipeBrowserMode);
  const browserSeed = useFactoryStore((state) => state.recipeBrowserSeed);
  const refactorNodeId = useFactoryStore((state) => state.recipeBrowserRefactorNodeId);
  const seedNonce = useFactoryStore((state) => state.recipeBrowserSeedNonce);
  const machinePin = useFactoryStore((state) => state.recipeBrowserMachinePin);
  const addRecipeToNode = useFactoryStore((state) => state.addRecipeToNode);
  const selectedRecipeId = useFactoryStore((state) => state.selectedRecipeId);
  const setRecipeSearch = useFactoryStore((state) => state.setRecipeSearch);
  const setHighlightSearch = useFactoryStore((state) => state.setHighlightSearch);
  const setMaxTier = useFactoryStore((state) => state.setMaxTierFilter);
  const browseResource = useFactoryStore((state) => state.browseResource);
  const browseBack = useFactoryStore((state) => state.browseBack);
  const browseForward = useFactoryStore((state) => state.browseForward);
  const canBrowseBack = useFactoryStore((state) => state.recipeBrowserBack.length > 0);
  const canBrowseForward = useFactoryStore((state) => state.recipeBrowserForward.length > 0);
  const clearResourceBrowser = useFactoryStore((state) => state.clearResourceBrowser);
  const selectRecipe = useFactoryStore((state) => state.selectRecipe);
  const addNodeForRecipe = useFactoryStore((state) => state.addNodeForRecipeObject);
  const addConnectedNodeForRecipe = useFactoryStore(
    (state) => state.addConnectedNodeForRecipeObject,
  );
  const refactorNodeWithRecipe = useFactoryStore((state) => state.refactorNodeWithRecipe);
  const beginRecipeAdd = useFactoryStore((state) => state.beginRecipeAdd);
  const resolveRecipeAdd = useFactoryStore((state) => state.resolveRecipeAdd);
  const failRecipeAdd = useFactoryStore((state) => state.failRecipeAdd);
  const [recipePage, setRecipePage] = useState(0);
  const [recipeBookSearch, setRecipeBookSearch] = useState("");
  const [filteredRecipes, setFilteredRecipes] = useState<RecipeSummary[]>([]);
  const [recipeTotal, setRecipeTotal] = useState(0);
  const [recipeHasMore, setRecipeHasMore] = useState(false);
  const [availableRecipeMaps, setAvailableRecipeMaps] = useState<string[]>([]);
  // The machine chips' selection. Absent means everything is selected (the
  // default); "exclude" carries the unselected chips, "include" the selected
  // ones. Stored rather than derived so a map unselected on one search stays
  // unselected on the next, even across searches where it never appears.
  const [mapSelection, setMapSelection] = useState<RecipeMapSelection | undefined>(undefined);
  // PINNED to a machine: the search is scoped to that machine's maps and the
  // stored chip selection stands aside until the pin comes off.
  const effectiveMapSelection = useMemo<RecipeMapSelection | undefined>(
    () => (machinePin ? { mode: "include", maps: machinePin.recipeMaps } : mapSelection),
    [machinePin, mapSelection],
  );
  // The master switch: what the whole left panel is FOR right now — finding
  // items to build with, stamping saved blueprints, or browsing the network's
  // shared setups. One at a time, full column each; the old bottom-strip
  // library never had room to breathe.
  // A request that arrived before this column was mounted (a phone's drawer is
  // unmounted while closed) is waiting in module state, so the tab it asked for
  // is collected here as well as by the listener below.
  const [sidebarMode, setSidebarMode] = useState<"items">(
    () => takePendingSidebarTab() ?? "items",
  );
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // A request that wanted the search box focused, collected on mount the way
  // the tab is (the panel may have been closed when it was made).
  const [pendingSearchFocus, setPendingSearchFocus] = useState(() => takePendingSearchFocus());
  // The box lights up for a moment as well as taking the cursor: a caret
  // alone is easy to miss, and "Find a recipe" has to visibly do something.
  const [isSearchFlashing, setSearchFlashing] = useState(false);
  useEffect(() => {
    if (!pendingSearchFocus || sidebarMode !== "items") {
      return;
    }
    setPendingSearchFocus(false);
    setSearchFlashing(true);
    // A freshly mounted column paints its search box a few frames in, so
    // the focus keeps trying for up to a second rather than firing once
    // into an empty ref. The loop is deliberately NOT cancelled by the
    // cleanup: the setPendingSearchFocus above re-runs this effect at once,
    // and a cleanup that cancelled the frame killed the focus before it
    // could land. After an unmount the ref is empty and the loop just runs
    // out.
    let tries = 0;
    const tryFocus = () => {
      const input = searchInputRef.current;
      if (input) {
        input.focus();
        input.select();
        return;
      }
      if (tries++ < 60) {
        window.requestAnimationFrame(tryFocus);
      }
    };
    window.requestAnimationFrame(tryFocus);
    // Same story for the flash: left to run out on its own.
    window.setTimeout(() => setSearchFlashing(false), 1400);
  }, [pendingSearchFocus, sidebarMode]);
  const [recipeMapIcons, setRecipeMapIcons] = useState<Record<string, DatasetResourceIndexEntry>>(
    {},
  );
  const [recipeMapCounts, setRecipeMapCounts] = useState<Record<string, number>>({});
  // The stencil's edits, keyed by the browse that seeded them: a NEW browse
  // (different item or direction) starts the stencil over, while edits made on
  // the open search survive its own refetches. Held as edits-plus-key rather
  // than plain state so a fresh browse can never fire a query against the
  // previous item's conditions.
  const [stencilEdits, setStencilEdits] = useState<
    | {
        key: string;
        clauses: StencilClause[];
        takesOp: RecipeQuerySideOp;
        makesOp: RecipeQuerySideOp;
      }
    | undefined
  >(undefined);
  const [recipeQueryLoading, setRecipeQueryLoading] = useState(false);
  const [recipeQueryError, setRecipeQueryError] = useState<string | undefined>();
  const recipeQueryCacheRef = useRef<Map<string, RecipeQueryCacheEntry>>(new Map());
  const pendingRecipePrefetchesRef = useRef<Set<string>>(new Set());
  const debouncedRecipeSearch = useDebouncedValue(recipeSearch, RESOURCE_SEARCH_DEBOUNCE_MS);
  const debouncedRecipeBookSearch = useDebouncedValue(recipeBookSearch, RECIPE_SEARCH_DEBOUNCE_MS);



  // And the general form of the same thing: anything outside the column can
  // ask for a tab by name, and for the cursor in the search box.
  useEffect(() => {
    const openTab = () => {
      const tab = takePendingSidebarTab();
      if (tab) {
        setSidebarMode(tab);
      }
      if (takePendingSearchFocus()) {
        setPendingSearchFocus(true);
      }
    };
    window.addEventListener(OPEN_SIDEBAR_TAB_EVENT, openTab);
    return () => window.removeEventListener(OPEN_SIDEBAR_TAB_EVENT, openTab);
  }, []);

  // Publish the settled query to the canvas. Highlighting every node, storage and
  // edge against a half-typed word is wasted work the user never sees, so the
  // board only reacts once typing pauses.
  useEffect(() => {
    setHighlightSearch(debouncedRecipeSearch);
  }, [debouncedRecipeSearch, setHighlightSearch]);

  const activeResource = useMemo(() => {
    if (!browserResource) {
      return undefined;
    }

    return {
      ...browserResource,
      recipeCount: 0,
      anchorNodeId: browserResource.anchorNodeId,
    };
  }, [browserResource]);

  const recipeMaps = useMemo(
    () => availableRecipeMaps.filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [availableRecipeMaps],
  );

  const recipeMapTabs = useMemo(
    () => buildRecipeMapTabs(recipeMaps, recipeMapIcons),
    [recipeMapIcons, recipeMaps],
  );

  const recipeMapChips = useMemo<RecipeMapChip[]>(
    () =>
      recipeMapTabs.map((tab) => ({
        ...tab,
        count: recipeMapCounts[tab.id],
        selected: isMapSelectedIn(effectiveMapSelection, tab.id),
      })),
    [effectiveMapSelection, recipeMapCounts, recipeMapTabs],
  );

  // The All chip reads from what is on screen: lit when every listed chip is
  // selected, whatever out-of-view maps the stored selection also carries.
  const allRecipeMapsSelected = useMemo(
    () => recipeMaps.every((recipeMap) => isMapSelectedIn(effectiveMapSelection, recipeMap)),
    [effectiveMapSelection, recipeMaps],
  );

  // Opening the search seeds the stencil with exactly the question the click
  // asked: left click = one output condition, right click = one input - or,
  // for a refactor, every input and output of the card being replaced. Edits
  // made after that carry the browse's key and win while it stays open.
  const browseKey = browserResource
    ? [
        // The nonce makes every refactor press a fresh browse: the card's
        // settings may have changed, and old stencil edits must not
        // resurrect over the new seed.
        refactorNodeId ? `refactor:${refactorNodeId}:${seedNonce}` : "",
        machinePin ? `pin:${machinePin.nodeId}:${seedNonce}` : "",
        browserResource.kind,
        browserResource.id,
        browserMode,
      ].join("|")
    : "";
  const seededStencil = useMemo<StencilClause[]>(() => {
    if (!browserResource) {
      return [];
    }
    if (browserSeed?.length) {
      return browserSeed.map((clause) => ({ ...clause }));
    }
    // A pinned browse starts with no condition: the machine is the whole
    // question, and its stand-in resource is not a thing to search for.
    if (browserResource.id === MACHINE_PIN_RESOURCE_ID) {
      return [];
    }
    return [
      {
        role: browserMode === "uses" ? "takes" : "makes",
        kind: browserResource.kind,
        id: browserResource.id,
        displayName: browserResource.displayName,
        iconPath: browserResource.iconPath,
        iconAtlas: browserResource.iconAtlas,
        dominantColor: browserResource.dominantColor ?? browserResource.iconAtlas?.dominantColor,
      },
    ];
  }, [browserMode, browserResource, browserSeed]);
  const editsApply = stencilEdits?.key === browseKey;
  const stencilClauses = editsApply ? stencilEdits.clauses : seededStencil;
  // ALL is the default reading: a fresh stencil holds one condition, where
  // all and any agree, and every added condition is usually meant as "and".
  const takesOp = editsApply ? stencilEdits.takesOp : "all";
  const makesOp = editsApply ? stencilEdits.makesOp : "all";
  const queryClauses = useMemo<RecipeQueryClause[]>(
    () => stencilClauses.map(({ role, kind, id }) => ({ role, kind, id })),
    [stencilClauses],
  );

  const changeStencilClauses = useCallback(
    (clauses: StencilClause[]) => {
      setStencilEdits({ key: browseKey, clauses, takesOp, makesOp });
      setRecipePage(0);
    },
    [browseKey, makesOp, takesOp],
  );
  const changeTakesOp = useCallback(
    (op: RecipeQuerySideOp) => {
      setStencilEdits({ key: browseKey, clauses: stencilClauses, takesOp: op, makesOp });
      setRecipePage(0);
    },
    [browseKey, makesOp, stencilClauses],
  );
  const changeMakesOp = useCallback(
    (op: RecipeQuerySideOp) => {
      setStencilEdits({ key: browseKey, clauses: stencilClauses, takesOp, makesOp: op });
      setRecipePage(0);
    },
    [browseKey, stencilClauses, takesOp],
  );
  const swapStencilSides = useCallback(() => {
    setStencilEdits({
      key: browseKey,
      clauses: stencilClauses.map((clause) => ({
        ...clause,
        role: clause.role === "takes" ? "makes" : "takes",
      })),
      takesOp: makesOp,
      makesOp: takesOp,
    });
    setRecipePage(0);
  }, [browseKey, makesOp, stencilClauses, takesOp]);

  const recipeTotalAcrossMaps = useMemo(() => {
    const counted = Object.values(recipeMapCounts).reduce((sum, count) => sum + count, 0);
    return counted > 0 ? counted : recipeTotal;
  }, [recipeMapCounts, recipeTotal]);
  const activeRecipeQuery = activeResource
    ? debouncedRecipeBookSearch.trim()
    : debouncedRecipeSearch.trim();

  const selectedDatasetVersion = useMemo(
    () => datasetManifest?.versions.find((entry) => entry.id === selectedDatasetVersionId),
    [datasetManifest?.versions, selectedDatasetVersionId],
  );

  const getRecipeQueryKey = useCallback(
    (selection: RecipeMapSelection | undefined, page: number) =>
      selectedDatasetVersion
        ? getRecipeQueryCacheKey({
            versionId: getDatasetVersionCacheKey(selectedDatasetVersion),
            query: activeRecipeQuery,
            resource: activeResource,
            mode: browserMode,
            clauses: queryClauses,
            takesOp,
            makesOp,
            mapSelection: selection,
            maxTier,
            offset: page * RECIPE_QUERY_LIMIT,
            limit: RECIPE_QUERY_LIMIT,
          })
        : "",
    [
      activeRecipeQuery,
      activeResource,
      browserMode,
      makesOp,
      maxTier,
      queryClauses,
      selectedDatasetVersion,
      takesOp,
    ],
  );


  // Everything selected is the default; a trimmed selection is a saved
  // preference, applied deferred for the same SSR-agreement reason as the
  // view above.
  useEffect(() => {
    const stored = readStoredMapSelection();
    if (stored) {
      return deferStateUpdate(() => setMapSelection(stored));
    }
    return undefined;
  }, []);

  const changeMapSelection = useCallback((selection: RecipeMapSelection | undefined) => {
    setMapSelection(selection);
    setRecipePage(0);
    if (selection) {
      window.localStorage.setItem(MAP_SELECTION_STORAGE_KEY, JSON.stringify(selection));
    } else {
      window.localStorage.removeItem(MAP_SELECTION_STORAGE_KEY);
    }
  }, []);

  const toggleRecipeMap = useCallback(
    (recipeMap: string) => {
      changeMapSelection(toggledMapSelection(mapSelection, recipeMap, recipeMaps));
    },
    [changeMapSelection, mapSelection, recipeMaps],
  );

  // "Only this machine": the selection becomes that one map, and every
  // other chip goes dark until All or a chip brings it back.
  const selectOnlyRecipeMap = useCallback(
    (recipeMap: string) => {
      changeMapSelection({ mode: "include", maps: [recipeMap] });
    },
    [changeMapSelection],
  );

  // The All chip is select-all / select-none: lit, a click clears the board;
  // unlit, a click selects everything (and forgets stored exclusions).
  const toggleAllRecipeMaps = useCallback(() => {
    changeMapSelection(allRecipeMapsSelected ? { mode: "include", maps: [] } : undefined);
  }, [allRecipeMapsSelected, changeMapSelection]);

  // A pointer over a chip is probably about to toggle it, so the answer that
  // toggle would show starts travelling now.
  const prefetchRecipeMapToggle = useCallback(
    (recipeMap: string) => {
      if (!selectedDatasetVersion) {
        return;
      }

      const query = activeRecipeQuery;
      // Map chips only exist inside the book, which only opens on a resource.
      if (!activeResource) {
        return;
      }

      const nextSelection = toggledMapSelection(mapSelection, recipeMap, recipeMaps);
      const cacheKey = getRecipeQueryKey(nextSelection, 0);
      if (
        !cacheKey ||
        getCachedRecipeQuery(recipeQueryCacheRef.current, cacheKey) ||
        pendingRecipePrefetchesRef.current.has(cacheKey)
      ) {
        return;
      }

      pendingRecipePrefetchesRef.current.add(cacheKey);
      void queryRecipeDatasetRecipes(
        datasetManifestUrl ?? DEFAULT_DATASET_MANIFEST_URL,
        selectedDatasetVersion,
        {
          query,
          resource: activeResource
            ? {
                kind: activeResource.kind,
                id: activeResource.id,
              }
            : undefined,
          mode: browserMode,
          clauses: queryClauses.length > 0 ? queryClauses : undefined,
          takesOp,
          makesOp,
          allMaps: true,
          mapSelection: nextSelection,
          maxTier,
          offset: 0,
          limit: RECIPE_QUERY_LIMIT,
        },
      )
        .then((result) => {
          setCachedRecipeQuery(recipeQueryCacheRef.current, cacheKey, result);
          trimRecipeQueryCache(recipeQueryCacheRef.current);
        })
        .catch(() => {
          // Prefetch is opportunistic; the real toggle will surface real errors.
        })
        .finally(() => {
          pendingRecipePrefetchesRef.current.delete(cacheKey);
        });
    },
    [
      activeResource,
      activeRecipeQuery,
      browserMode,
      datasetManifestUrl,
      getRecipeQueryKey,
      makesOp,
      mapSelection,
      maxTier,
      queryClauses,
      recipeMaps,
      selectedDatasetVersion,
      takesOp,
    ],
  );

  const searchPickerResources = useCallback(
    async (pickerQuery: string, signal: AbortSignal) => {
      if (!selectedDatasetVersion) {
        return [];
      }
      const result = await queryRecipeDatasetResources(
        datasetManifestUrl ?? DEFAULT_DATASET_MANIFEST_URL,
        selectedDatasetVersion,
        { query: pickerQuery, offset: 0, limit: 48 },
        { signal },
      );
      return result.resources;
    },
    [datasetManifestUrl, selectedDatasetVersion],
  );

  const getFullRecipe = useCallback(
    async (recipeId: string, preferDataset = false): Promise<Recipe> => {
      const projectRecipe = projectRecipes.find((recipe) => recipe.id === recipeId);
      if (!preferDataset && projectRecipe && recipeHasRenderableIcons(projectRecipe)) {
        return projectRecipe;
      }
      if (!selectedDatasetVersion) {
        throw new Error("No dataset version is selected.");
      }

      return getRecipeDatasetRecipe(
        datasetManifestUrl ?? DEFAULT_DATASET_MANIFEST_URL,
        selectedDatasetVersion,
        recipeId,
      );
    },
    [datasetManifestUrl, projectRecipes, selectedDatasetVersion],
  );

  const handleAddRecipe = useCallback(
    async (
      recipeSummary: RecipeSummary,
      machineHandlerId?: string,
      inputPicks?: RecipeInputPicks,
    ) => {
      const currentState = useFactoryStore.getState();
      const currentResource = currentState.recipeBrowserResource
        ? {
            ...currentState.recipeBrowserResource,
            recipeCount: 0,
            anchorNodeId: currentState.recipeBrowserResource.anchorNodeId,
          }
        : activeResource;
      const currentMode = currentState.recipeBrowserResource
        ? currentState.recipeBrowserMode
        : browserMode;
      // A pick made while Welcome covers the board would land on whatever tab
      // is hidden underneath it, unseen. It gets a fresh blank tab instead, so
      // the card arrives on a board the player is actually looking at. Anchor
      // and refactor targets are cards of the covered plan, so they are
      // dropped along with it - on a blank board there is nothing to wire to
      // or replace.
      const welcomeCovered = readWelcomeTabState().active;
      if (welcomeCovered) {
        await useDesignStore.getState().addDesign();
        leaveWelcomeTab();
      }
      const currentRefactorNodeId = welcomeCovered
        ? undefined
        : currentState.recipeBrowserRefactorNodeId;
      const currentMachinePin = welcomeCovered ? undefined : currentState.recipeBrowserMachinePin;
      const anchorNodeId = welcomeCovered ? undefined : currentResource?.anchorNodeId;
      const contextResource = getRecipeAddContextResource(
        currentResource,
        currentMode,
        recipeSummary,
      );
      // The book closes on the press, not on the response. A click that seems
      // to do nothing gets clicked again; the chip over the board carries the
      // wait instead, and the apology when the fetch fails.
      clearResourceBrowser();
      const pendingId = beginRecipeAdd(recipeSummary.name);
      try {
        const recipe = await getFullRecipe(recipeSummary.id, Boolean(currentResource));
        if (currentMachinePin) {
          // The pinned machine's card takes the pick as one more recipe.
          if (!addRecipeToNode(currentMachinePin.nodeId, recipe, { inputPicks })) {
            failRecipeAdd(
              pendingId,
              `No machine runs both ${recipeSummary.name} and what ${currentMachinePin.label} already has.`,
            );
            return;
          }
        } else if (currentRefactorNodeId) {
          // The refactor's landing: the pick replaces the card it came from.
          refactorNodeWithRecipe(currentRefactorNodeId, recipe, { machineHandlerId });
        } else if (anchorNodeId && contextResource) {
          // Opened from a card's port: the pick lands beside that card and
          // wires itself to the clicked resource.
          addConnectedNodeForRecipe(recipe, anchorNodeId, contextResource, {
            machineHandlerId,
            inputPicks,
          });
        } else {
          addNodeForRecipe(recipe, contextResource, {
            machineHandlerId,
            inputPicks,
            focusCamera: true,
          });
        }
        resolveRecipeAdd(pendingId);
      } catch (error) {
        failRecipeAdd(
          pendingId,
          error instanceof Error ? error.message : "The recipe could not be loaded.",
        );
      }
    },
    [
      activeResource,
      addConnectedNodeForRecipe,
      addNodeForRecipe,
      addRecipeToNode,
      beginRecipeAdd,
      browserMode,
      clearResourceBrowser,
      failRecipeAdd,
      getFullRecipe,
      refactorNodeWithRecipe,
      resolveRecipeAdd,
    ],
  );

  const prefetchRecipeAdd = useCallback(
    (recipeId: string) => {
      // Warm the session cache while the pointer is still hovering, so the
      // plus button usually has its recipe before it is pressed. A failure
      // here is nothing: the click fetches again and reports its own.
      void getFullRecipe(recipeId, true).catch(() => undefined);
    },
    [getFullRecipe],
  );




  useEffect(() => {
    return deferStateUpdate(() => setRecipePage(0));
  }, [
    activeResource?.id,
    activeResource?.kind,
    browserMode,
    maxTier,
    activeRecipeQuery,
    queryClauses,
    takesOp,
    makesOp,
    selectedDatasetVersion?.id,
  ]);

  useEffect(() => {
    return deferStateUpdate(() => setRecipeBookSearch(""));
  }, [activeResource?.id, activeResource?.kind, browserMode, selectedDatasetVersion?.id]);

  useEffect(() => {
    if (!selectedDatasetVersion) {
      return deferStateUpdate(() => {
        setFilteredRecipes([]);
        setRecipeTotal(0);
        setRecipeHasMore(false);
        setAvailableRecipeMaps([]);
        setRecipeMapIcons({});
        setRecipeMapCounts({});
      });
    }

    const query = activeRecipeQuery;
    // Nothing on screen reads these until a resource is being browsed - the
    // search IS the resource view, and it opens with its own filter box.
    // Running the query anyway meant every keystroke in the item box searched
    // 270,000 recipes for a list no one ever saw.
    if (!activeResource) {
      return deferStateUpdate(() => {
        setFilteredRecipes([]);
        setRecipeTotal(0);
        setRecipeHasMore(false);
        setAvailableRecipeMaps([]);
        setRecipeMapIcons({});
        setRecipeMapCounts({});
        setRecipeQueryLoading(false);
        setRecipeQueryError(undefined);
      });
    }

    const cacheKey = getRecipeQueryKey(effectiveMapSelection, recipePage);
    const cached = getCachedRecipeQuery(recipeQueryCacheRef.current, cacheKey);
    if (cached) {
      return scheduleAfterPaint(() => {
        setFilteredRecipes((current) =>
          recipePage === 0 ? cached.recipes : appendUniqueRecipes(current, cached.recipes),
        );
        setRecipeTotal(cached.total);
        setRecipeHasMore(cached.hasMore);
        setAvailableRecipeMaps(cached.recipeMaps);
        setRecipeMapIcons(cached.recipeMapIcons ?? {});
        setRecipeMapCounts(cached.recipeMapCounts ?? {});
        setRecipeQueryLoading(false);
        setRecipeQueryError(undefined);
      });
    }

    const controller = new AbortController();
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        if (recipePage === 0) {
          setFilteredRecipes([]);
          setRecipeTotal(0);
          setRecipeHasMore(false);
        }
        setRecipeQueryLoading(true);
        setRecipeQueryError(undefined);
      }
    });

    const cancelAfterPaint = scheduleAfterPaint(() => {
      void queryRecipeDatasetRecipes(
        datasetManifestUrl ?? DEFAULT_DATASET_MANIFEST_URL,
        selectedDatasetVersion,
        {
          query,
          // A pinned browse's stand-in resource is not a question for the
          // dataset; the pin scopes the maps and the stencil asks the rest.
          resource:
            activeResource && activeResource.id !== MACHINE_PIN_RESOURCE_ID
              ? {
                  kind: activeResource.kind,
                  id: activeResource.id,
                }
              : undefined,
          mode: browserMode,
          clauses: queryClauses.length > 0 ? queryClauses : undefined,
          takesOp,
          makesOp,
          allMaps: true,
          mapSelection: effectiveMapSelection,
          maxTier,
          offset: recipePage * RECIPE_QUERY_LIMIT,
          limit: RECIPE_QUERY_LIMIT,
        },
        { signal: controller.signal },
      )
        .then((result) => {
          if (cancelled) {
            return;
          }
          setCachedRecipeQuery(recipeQueryCacheRef.current, cacheKey, result);
          trimRecipeQueryCache(recipeQueryCacheRef.current);
          setFilteredRecipes((current) =>
            recipePage === 0 ? result.recipes : appendUniqueRecipes(current, result.recipes),
          );
          setRecipeTotal(result.total);
          setRecipeHasMore(result.hasMore);
          setAvailableRecipeMaps(result.recipeMaps);
          setRecipeMapIcons(result.recipeMapIcons ?? {});
          setRecipeMapCounts(result.recipeMapCounts ?? {});
          setRecipeQueryLoading(false);
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }
          setFilteredRecipes([]);
          setRecipeTotal(0);
          setRecipeHasMore(false);
          setAvailableRecipeMaps([]);
          setRecipeMapIcons({});
          setRecipeMapCounts({});
          setRecipeQueryError(error instanceof Error ? error.message : "Recipe query failed.");
          setRecipeQueryLoading(false);
        });
    });

    return () => {
      cancelled = true;
      controller.abort();
      cancelAfterPaint();
    };
  }, [
    activeRecipeQuery,
    activeResource,
    browserMode,
    datasetManifestUrl,
    getRecipeQueryKey,
    makesOp,
    effectiveMapSelection,
    maxTier,
    queryClauses,
    recipePage,
    selectedDatasetVersion,
    takesOp,
  ]);
  return (
    <>
      <aside
        data-help-anchor="browser"
        className="relative z-40 flex h-full min-h-[360px] compact:min-h-0 flex-col border-r border-neutral-800 bg-[#25272c] text-neutral-100"
      >
        {(
          // The wheel pages the list from anywhere in the column, including over
          // the controls and the recent shelf: nothing here scrolls, so a wheel
          // that did nothing was just a panel that felt broken.
          <div className="flex min-h-0 flex-1 flex-col">
        {/* The cards that are not recipes - generator, custom rate, crop
            farm - above the search, since this column is where things get
            added from. They came off the board's build tray (2026-09-06). */}
        <SpawnKeys
          leading={
            /* The way to fold this column away, at the start of the top row
               (it used to sit in the search box). On a phone it closes the
               drawer. */
            <button
              type="button"
              onClick={() => writeWorkspaceView({ leftPanelOpen: false })}
              aria-label="Hide the items column"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-100"
            >
              <ChevronIcon direction="left" />
            </button>
          }
        />
        <ResourceIndexPane
          search={recipeSearch}
          onSearchChange={setRecipeSearch}
          searchInputRef={searchInputRef}
          searchFlashing={isSearchFlashing}
          activeResource={activeResource}
          onBrowse={browseResource}
        />
          </div>
        )}
      </aside>

      {activeResource ? (
        <RecipeSearchOverlay
          clauses={stencilClauses}
          takesOp={takesOp}
          makesOp={makesOp}
          onClausesChange={changeStencilClauses}
          onTakesOpChange={changeTakesOp}
          onMakesOpChange={changeMakesOp}
          onSwapSides={swapStencilSides}
          recipeMapChips={recipeMapChips}
          allRecipeMapsSelected={allRecipeMapsSelected}
          onToggleRecipeMap={toggleRecipeMap}
          onSelectOnlyRecipeMap={selectOnlyRecipeMap}
          onToggleAllRecipeMaps={toggleAllRecipeMaps}
          onRecipeMapHover={prefetchRecipeMapToggle}
          recipes={filteredRecipes}
          totalAcrossMaps={recipeTotalAcrossMaps}
          hasMore={recipeHasMore}
          isLoading={recipeQueryLoading}
          queryError={recipeQueryError}
          query={recipeBookSearch}
          onQueryChange={(query) => {
            setRecipeBookSearch(query);
            setRecipePage(0);
          }}
          maxTier={maxTier}
          onMaxTierChange={setMaxTier}
          selectedRecipeId={selectedRecipeId}
          onSelectRecipe={selectRecipe}
          onAdd={handleAddRecipe}
          onPrefetch={prefetchRecipeAdd}
          onBrowseResource={(resource, mode) =>
            browseResource(
              {
                kind: resource.kind,
                id: resource.id,
                displayName: resource.displayName,
                iconPath: resource.iconPath,
                iconAtlas: resource.iconAtlas,
                dominantColor: resource.dominantColor ?? resource.iconAtlas?.dominantColor,
                anchorNodeId: activeResource.anchorNodeId,
              },
              mode,
            )
          }
          onLoadMore={() => {
            if (!recipeQueryLoading && recipeHasMore) {
              setRecipePage((page) => page + 1);
            }
          }}
          onClose={clearResourceBrowser}
          browseKey={browseKey}
          canGoBack={canBrowseBack}
          canGoForward={canBrowseForward}
          onBack={browseBack}
          onForward={browseForward}
          contextResource={activeResource}
          searchPickerResources={searchPickerResources}
          machinePin={machinePin}
        />
      ) : null}
    </>
  );
}

interface RecipeMapTab {
  id: string;
  label: string;
  icon?: Pick<
    ResourceAmount,
    "kind" | "id" | "amount" | "displayName" | "iconPath" | "iconAtlas" | "dominantColor"
  >;
}

interface RecipeQueryCacheEntry {
  result: RecipeDatasetQueryResult;
  expiresAt: number;
}

function getRecipeAddContextResource(
  activeResource: (IndexedResource & { anchorNodeId?: string }) | undefined,
  mode: "recipes" | "uses",
  contextRecipe: RecipeSummary | undefined,
):
  | (Pick<
      ResourceAmount,
      | "kind"
      | "id"
      | "displayName"
      | "iconPath"
      | "iconAtlas"
      | "dominantColor"
      | "tooltip"
      | "modId"
    > & {
      mode: "recipes" | "uses";
      inputIndex?: number;
      neiSlot?: ResourceAmount["neiSlot"];
    })
  | undefined {
  if (!activeResource) {
    return undefined;
  }

  if (mode === "uses") {
    const contextInputIndex = contextRecipe?.inputs.findIndex(
      (input) =>
        (input.kind === activeResource.kind && input.id === activeResource.id) ||
        resourceMatchesInput({ kind: activeResource.kind, id: activeResource.id }, input),
    );
    const contextInput =
      contextInputIndex !== undefined && contextInputIndex >= 0
        ? contextRecipe?.inputs[contextInputIndex]
        : undefined;
    const contextSlotInput =
      contextInput ??
      contextRecipe?.inputs.find(
        (input) =>
          input.neiSlot &&
          resourceMatchesInput({ kind: activeResource.kind, id: activeResource.id }, input),
      );
    if (contextSlotInput && !contextSlotInput.id.startsWith("oredict:")) {
      return {
        kind: contextSlotInput.kind,
        id: contextSlotInput.id,
        displayName: contextSlotInput.displayName ?? activeResource.displayName,
        iconPath: contextSlotInput.iconPath ?? activeResource.iconPath,
        iconAtlas: contextSlotInput.iconAtlas ?? activeResource.iconAtlas,
        dominantColor:
          contextSlotInput.dominantColor ??
          contextSlotInput.iconAtlas?.dominantColor ??
          activeResource.dominantColor ??
          activeResource.iconAtlas?.dominantColor,
        tooltip: contextSlotInput.tooltip,
        modId: contextSlotInput.modId,
        mode,
        inputIndex: contextInputIndex,
        neiSlot: contextSlotInput.neiSlot,
      };
    }
  }

  return {
    kind: activeResource.kind,
    id: activeResource.id,
    displayName: activeResource.displayName,
    iconPath: activeResource.iconPath,
    iconAtlas: activeResource.iconAtlas,
    dominantColor: activeResource.dominantColor ?? activeResource.iconAtlas?.dominantColor,
    mode,
  };
}

function recipeHasRenderableIcons(recipe: Recipe) {
  return [...recipe.inputs, ...recipe.outputs]
    .filter((resource) => resource.kind === "item")
    .every((resource) => Boolean(resource.iconPath || resource.iconAtlas));
}


function scheduleAfterPaint(callback: () => void) {
  if (typeof window === "undefined") {
    callback();
    return () => undefined;
  }

  let cancelled = false;
  let firstFrame = 0;
  let secondFrame = 0;

  firstFrame = window.requestAnimationFrame(() => {
    secondFrame = window.requestAnimationFrame(() => {
      if (!cancelled) {
        callback();
      }
    });
  });

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(firstFrame);
    window.cancelAnimationFrame(secondFrame);
  };
}


function appendUniqueRecipes(current: RecipeSummary[], incoming: RecipeSummary[]) {
  const seen = new Set(current.map((recipe) => recipe.id));
  const next = [...current];
  for (const recipe of incoming) {
    if (seen.has(recipe.id)) {
      continue;
    }
    seen.add(recipe.id);
    next.push(recipe);
  }
  return next;
}

function getRecipeQueryCacheKey({
  versionId,
  query,
  resource,
  mode,
  clauses,
  takesOp,
  makesOp,
  mapSelection,
  maxTier,
  offset,
  limit,
}: {
  versionId: string;
  query: string;
  resource?: Pick<ResourceAmount, "kind" | "id">;
  mode: "recipes" | "uses";
  clauses: RecipeQueryClause[];
  takesOp: RecipeQuerySideOp;
  makesOp: RecipeQuerySideOp;
  mapSelection: RecipeMapSelection | undefined;
  maxTier: TierFilter;
  offset: number;
  limit: number;
}) {
  return [
    versionId,
    query.trim().toLowerCase(),
    resource ? `${resource.kind}:${resource.id}` : "",
    mode,
    clauses.map((clause) => `${clause.role}:${clause.kind}:${clause.id}`).join(","),
    takesOp,
    makesOp,
    mapSelection ? `${mapSelection.mode}:${[...mapSelection.maps].sort().join(",")}` : "all",
    maxTier,
    offset,
    limit,
  ].join("|");
}

/** Whether the chips' selection shows this map's recipes. Absent means all. */
function isMapSelectedIn(selection: RecipeMapSelection | undefined, recipeMap: string): boolean {
  if (!selection) {
    return true;
  }
  const listed = selection.maps.includes(recipeMap);
  return selection.mode === "exclude" ? !listed : listed;
}

/**
 * One chip's toggle. Exclusions and inclusions are edited in place so a map
 * unselected on an earlier search survives this one; the only normalisations
 * are back to "all" - an emptied exclusion list, or an include list that has
 * grown to cover every chip on screen.
 */
function toggledMapSelection(
  selection: RecipeMapSelection | undefined,
  recipeMap: string,
  visibleMaps: string[],
): RecipeMapSelection | undefined {
  if (!selection) {
    return { mode: "exclude", maps: [recipeMap] };
  }
  const listed = selection.maps.includes(recipeMap);
  const maps = listed
    ? selection.maps.filter((map) => map !== recipeMap)
    : [...selection.maps, recipeMap];
  if (selection.mode === "exclude") {
    return maps.length > 0 ? { mode: "exclude", maps } : undefined;
  }
  if (visibleMaps.every((map) => maps.includes(map))) {
    return undefined;
  }
  return { mode: "include", maps };
}

function readStoredMapSelection(): RecipeMapSelection | undefined {
  try {
    const stored = window.localStorage.getItem(MAP_SELECTION_STORAGE_KEY);
    if (!stored) {
      return undefined;
    }
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "mode" in parsed &&
      (parsed.mode === "exclude" || parsed.mode === "include") &&
      "maps" in parsed &&
      Array.isArray(parsed.maps)
    ) {
      const maps = parsed.maps.filter((map): map is string => typeof map === "string");
      // An empty exclusion list is just "all"; keep the state canonical.
      if (parsed.mode === "exclude" && maps.length === 0) {
        return undefined;
      }
      return { mode: parsed.mode, maps };
    }
  } catch {
    // A stale or foreign value reads as the default.
  }
  return undefined;
}

function getCachedRecipeQuery(cache: Map<string, RecipeQueryCacheEntry>, key: string) {
  const entry = cache.get(key);
  if (!entry) {
    return undefined;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }

  return entry.result;
}

function setCachedRecipeQuery(
  cache: Map<string, RecipeQueryCacheEntry>,
  key: string,
  result: RecipeDatasetQueryResult,
) {
  cache.set(key, {
    result,
    expiresAt: Date.now() + RECIPE_QUERY_CACHE_TTL_MS,
  });
}

function trimRecipeQueryCache(cache: Map<string, RecipeQueryCacheEntry>) {
  while (cache.size > 120) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) {
      return;
    }
    cache.delete(oldestKey);
  }
}

function buildRecipeMapTabs(
  recipeMaps: string[],
  icons: Record<string, DatasetResourceIndexEntry>,
): RecipeMapTab[] {
  return recipeMaps.map((recipeMap) => {
    const resource = icons[recipeMap];
    return {
      id: recipeMap,
      label: recipeMap,
      icon: resource
        ? {
            kind: resource.kind,
            id: resource.id,
            amount: 1,
            displayName: resource.displayName,
            iconPath: resource.iconPath,
            iconAtlas: resource.iconAtlas,
            dominantColor: resource.dominantColor ?? resource.iconAtlas?.dominantColor,
          }
        : undefined,
    };
  });
}


