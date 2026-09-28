// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignRecord, DesignSummary } from "@/lib/designs/design-library";

/** The library on this device: every write lands here, and reads answer from it. */
const records = vi.hoisted(() => new Map<string, DesignRecord>());
const storage = vi.hoisted(() => ({
  listDesignSummaries: vi.fn(async () => [...records.values()]),
  listDesignFolders: vi.fn(async () => []),
  readDesign: vi.fn(async (id: string) => records.get(id)),
  readDesignSummary: vi.fn(async (id: string) => records.get(id)),
  writeDesign: vi.fn(async (record: DesignRecord) => {
    records.set(record.id, record);
  }),
  writeDesignIfUnchanged: vi.fn(async (record: DesignRecord) => {
    records.set(record.id, record);
    return "written" as const;
  }),
  writeDesignSummary: vi.fn(async (summary: DesignSummary) => {
    const record = records.get(summary.id);
    if (record) {
      records.set(summary.id, { ...record, ...summary });
    }
  }),
  writeDesignFolder: vi.fn(async () => undefined),
  deleteDesign: vi.fn(async (id: string) => {
    records.delete(id);
  }),
  deleteDesignFolder: vi.fn(async () => undefined),
  readActiveDesignId: vi.fn(() => "mine"),
  writeActiveDesignId: vi.fn(),
}));
vi.mock("@/lib/designs/design-storage", () => storage);
vi.mock("@/lib/designs/design-tab-sync", () => ({
  THIS_TAB_ID: "this-tab",
  isEditingInThisTab: () => true,
  announceDesignSaved: vi.fn(),
  subscribeDesignSaved: () => () => undefined,
}));
vi.mock("@/lib/designs/design-camera", () => ({
  keepDesignCameras: vi.fn(),
  forgetDesignCameras: vi.fn(),
  rememberDesignCamera: vi.fn(),
  readDesignCamera: vi.fn(),
  beginDesignCameraHandover: vi.fn(),
  beginDesignHandover: vi.fn(),
  endDesignHandover: vi.fn(),
}));

import { createEmptyProject } from "@/examples";
import { createDesign } from "@/lib/designs/design-library";
import { serializeFactoryProject } from "@/lib/import-export";
import { openLibrary, readLibraryTabState } from "@/lib/library/library-tab";
import { useDesignStore } from "@/store/design-store";
import { useFactoryStore } from "@/store/factory-store";
import { BoardActions } from "./BoardActions";

afterEach(cleanup);

beforeEach(async () => {
  records.clear();
  vi.clearAllMocks();
  const mine = createDesign({ ...createEmptyProject(), name: "My big design" }, "My big design");
  records.set("mine", { ...mine, id: "mine" });
  useDesignStore.setState({ designs: [], activeDesignId: undefined, isHydrated: false });
  await useDesignStore.getState().hydrate();
});

function planFile(name: string, communityPlanId?: string): File {
  const project = {
    ...createEmptyProject(),
    name,
    metadata: { ...createEmptyProject().metadata, ...(communityPlanId ? { communityPlanId } : {}) },
  };
  return new File([serializeFactoryProject(project)], "imported.json", {
    type: "application/json",
  });
}

describe("Import a plan (a player lost a big design to it, 2026-09-28)", () => {
  it("opens the file as a new design and never writes it over the one under the Library", async () => {
    expect(useDesignStore.getState().activeDesignId).toBe("mine");
    openLibrary();

    const { container } = render(<BoardActions />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(input!, { target: { files: [planFile("Imported plan", "their-post")] } });

    await waitFor(() => expect(useDesignStore.getState().activeDesignId).not.toBe("mine"));
    const activeId = useDesignStore.getState().activeDesignId!;

    // The design that was open is exactly as it was.
    expect(records.get("mine")?.project.name).toBe("My big design");
    for (const [record] of [
      ...storage.writeDesign.mock.calls,
      ...storage.writeDesignIfUnchanged.mock.calls,
    ]) {
      if (record.id === "mine") {
        expect(record.project.name).toBe("My big design");
      }
    }

    // The file is a design of its own, on the board, with no post link.
    const imported = records.get(activeId);
    expect(imported?.name).toBe("Imported plan");
    expect(imported?.project.metadata?.communityPlanId).toBeUndefined();
    expect(useFactoryStore.getState().project.name).toBe("Imported plan");
    expect(readLibraryTabState().active).toBe(false);
    expect(useDesignStore.getState().designs.map((design) => design.id).sort()).toEqual(
      [activeId, "mine"].sort(),
    );
  });
});
