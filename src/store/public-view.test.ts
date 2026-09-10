import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "@/examples";
import { useFactoryStore } from "./factory-store";

afterEach(() => useFactoryStore.getState().markHydratedProject(createEmptyProject()));

describe("public viewing edit boundary", () => {
  it("rejects edits, import, paste, and undo without changing the plan or its books", () => {
    const store = useFactoryStore.getState();
    store.markHydratedProject(createEmptyProject());
    store.addCustomRateNode();
    store.loadViewedProject({ ...useFactoryStore.getState().project, name: "Public original" });
    const before = useFactoryStore.getState();
    store.updateNode(before.project.nodes[0].id, { machineCount: 99 });
    store.deleteNode(before.project.nodes[0].id);
    store.renameProject("Changed");
    store.setProjectIdentity({ description: "Changed" });
    store.setProject(createEmptyProject());
    store.addCustomRateNode();
    store.setBoardMode("pool");
    store.cleanBoard();
    store.pasteBoardItems(
      { nodes: [], edges: [], recipes: [], storages: [], annotations: [], pockets: [] },
      { x: 20, y: 20 },
    );
    store.undo();
    store.redo();
    const after = useFactoryStore.getState();
    expect(after.project).toBe(before.project);
    expect(after.lastResult).toBe(before.lastResult);
    expect(after.undoHistory).toEqual([]);
    expect(after.redoHistory).toEqual([]);
  });

  it("allows inspection and restores editing when a personal design opens", () => {
    const store = useFactoryStore.getState();
    store.loadViewedProject(createEmptyProject());
    store.browseResource({ kind: "item", id: "test", displayName: "Test" }, "recipes");
    expect(useFactoryStore.getState().recipeBrowserResource?.id).toBe("test");
    store.markHydratedProject(createEmptyProject());
    store.renameProject("My editable copy");
    expect(useFactoryStore.getState().isReadOnly).toBe(false);
    expect(useFactoryStore.getState().project.name).toBe("My editable copy");
  });

  it("still resolves dataset resources when a shared link arrives before the dataset", () => {
    const store = useFactoryStore.getState();
    store.loadViewedProject(createEmptyProject());
    store.setDataset({
      schemaVersion: 1,
      recipes: [],
      resources: [],
      datasetVersionId: "viewer-test",
      gtnhVersion: "2.9",
      sourceInfo: { sourceId: "unknown", generatedAt: "2026-09-10" },
      oreDictionary: {},
      recipeMaps: [],
      generatedAt: "2026-09-10",
    });
    expect(useFactoryStore.getState().dataset?.datasetVersionId).toBe("viewer-test");
    expect(useFactoryStore.getState().isDatasetLoading).toBe(false);
    expect(useFactoryStore.getState().isReadOnly).toBe(true);
    expect(useFactoryStore.getState().undoHistory).toEqual([]);
  });
});
