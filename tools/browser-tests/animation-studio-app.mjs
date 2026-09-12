import assert from "node:assert/strict";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const output = path.resolve(".animation-studio-results.local");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    sessionStorage.setItem("gtnh-factory-flow-welcome-left", "1");
    if (!localStorage.getItem("animation-app-fixture")) {
      const resource = (id, amount) => ({ kind: "item", id, amount, displayName: id });
      const recipe = (id, machine, input, output) => ({
        id,
        name: machine,
        kind: "custom",
        machineType: machine,
        minimumTier: "LV",
        durationTicks: 100,
        eut: 24,
        inputs: [resource(input, 1)],
        outputs: [resource(output, 2)],
        machineHandlers: [
          { id, label: machine, machineType: machine, minimumTier: "LV", kind: "single" },
        ],
      });
      const node = (id, recipeId, x, y) => ({
        id,
        recipeId,
        machineCount: 1,
        parallel: 1,
        overclockTier: "LV",
        enabled: true,
        position: { x, y },
      });
      localStorage.setItem(
        "gtnh-factory-flow.project.v2",
        JSON.stringify({
          schemaVersion: 1,
          id: "animation-app-fixture",
          name: "Factory showcase",
          fuelProfiles: [],
          recipes: [
            recipe("crush", "Macerator", "Iron Ore", "Crushed Iron Ore"),
            recipe("wash", "Ore Washer", "Crushed Iron Ore", "Purified Iron Ore"),
          ],
          nodes: [node("one", "crush", 100, 100), node("two", "wash", 700, 100)],
          storages: [],
          edges: [
            {
              id: "wire",
              source: "one",
              target: "two",
              resourceKind: "item",
              resourceId: "Crushed Iron Ore",
            },
          ],
        }),
      );
      localStorage.setItem("animation-app-fixture", "1");
    }
  });
  await page.goto(process.env.ANIMATION_APP_URL ?? "http://localhost:3000", {
    waitUntil: "domcontentloaded",
  });
  await page.locator('button[aria-label^="Version"]').waitFor({ timeout: 60000 });
  await page.locator(".react-flow__node").first().waitFor({ timeout: 30000 });
  await page.locator('button[aria-label^="Version"]').click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Open animation studio", exact: true }).click();
  await page.getByRole("region", { name: "Animation studio" }).waitFor();
  await page.getByRole("button", { name: "Add camera key", exact: true }).click();
  await page.getByLabel("Playhead", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Add camera key", exact: true }).click();
  await page.getByLabel("Zoom", { exact: true }).fill("1.3");
  await page.getByRole("button", { name: "Add tilt key", exact: true }).click();
  await page.getByLabel("Pitch (°)").fill("12");
  await page.getByLabel("Yaw (°)").fill("-6");
  await page.getByRole("button", { name: "Place cursor key", exact: true }).click();
  await page.mouse.click(900, 350);
  await page.getByRole("button", { name: "Add marker", exact: true }).click();
  await page.getByLabel("Keyframe name").fill("Reactor close-up");
  await page.getByLabel("Sequence name").fill("Factory showcase");
  await page.screenshot({ path: path.join(output, "app-desktop.png") });
  await page.getByRole("button", { name: "Go to start (Home)" }).click();
  await page.getByRole("button", { name: "Play (Space)", exact: true }).click();
  await page.getByRole("button", { name: "Pause (Space)", exact: true }).waitFor();
  await page.getByRole("button", { name: "Pause (Space)", exact: true }).click();
  await page.getByRole("button", { name: "Clean preview (Esc to return)" }).click();
  await page.screenshot({ path: path.join(output, "app-clean.png") });
  await page.keyboard.press("Escape");
  // Rehearse a real machine-count edit, then restore the saved board.
  await page.getByRole("button", { name: "Save start state", exact: true }).click();
  await page.getByRole("button", { name: "Go to start (Home)" }).click();
  const machine = page.locator('.react-flow__node[data-id="one"]');
  const count = machine.locator('input[aria-label$=" count"]').first();
  const initialCount = await count.inputValue();
  await page.getByRole("button", { name: "Pick action target", exact: true }).click();
  await machine
    .getByRole("button", { name: /^Increase .* count$/ })
    .first()
    .click();
  assert.equal(await count.inputValue(), initialCount, "Picking must not edit the machine count");
  await page.getByLabel("Execute actions", { exact: true }).check();
  await page.getByRole("button", { name: "Play (Space)", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.react-flow__node[data-id="one"] input[aria-label$=" count"]')
        .value === "2",
  );
  await page.getByRole("button", { name: "Pause (Space)", exact: true }).click();
  await page.getByRole("button", { name: "Restore start", exact: true }).click();
  assert.equal(await count.inputValue(), initialCount, "Restore start must restore the project");
  await page.getByRole("button", { name: "Close animation studio" }).click();
  assert.equal(await page.locator("[data-animation-stage]").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Actual app dev-menu, camera, tilt, cursor, playback, clean preview, and close passed.",
  );
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages())
      await page.screenshot({ path: path.join(output, "app-failure.png") });
  throw error;
} finally {
  await browser.close();
}
