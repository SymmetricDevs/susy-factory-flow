import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import { chromium, firefox } from "playwright-core";

const output = path.resolve(".animation-studio-results.local");
const server = await createServer({
  configFile: false,
  root: path.resolve("tools/browser-tests"),
  publicDir: false,
  resolve: { alias: { "@": path.resolve("src") } },
  esbuild: { jsx: "automatic" },
  server: { host: "127.0.0.1", port: 0, watch: null, fs: { allow: [process.cwd()] } },
});
await server.listen();
await mkdir(output, { recursive: true });
const url = `http://127.0.0.1:${server.httpServer.address().port}/animation-studio.html`;
const report = {};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url);
      await page.getByRole("region", { name: "Animation studio" }).waitFor();
      assert.equal(await page.locator(".as-lane").count(), 5);
      for (const lane of await page.locator(".as-lane").all()) assert.ok(await lane.isVisible());
      await page.getByRole("button", { name: "Add camera key", exact: true }).click();
      await page.getByLabel("Centre X", { exact: true }).fill("100");
      await page.getByLabel("Playhead", { exact: true }).fill("4");
      await page.getByRole("button", { name: "Add camera key", exact: true }).click();
      await page.getByLabel("Centre X", { exact: true }).fill("500");
      await page.getByLabel("Zoom", { exact: true }).fill("1.5");
      await page.getByLabel("Keyframe easing").selectOption("cut");
      await page.getByLabel("Playhead", { exact: true }).fill("2");
      let viewport = await page.locator(".react-flow__viewport").getAttribute("style");
      assert.ok(viewport.includes("scale(1)"), viewport);
      await page.getByLabel("Playhead", { exact: true }).fill("4");
      viewport = await page.locator(".react-flow__viewport").getAttribute("style");
      assert.ok(viewport.includes("scale(1.5)"), viewport);
      const before = await page.evaluate(() => window.studio.getState().sequence.keys.length);
      await page.getByRole("button", { name: "Duplicate selected (Ctrl+D)" }).click();
      assert.equal(
        await page.evaluate(() => window.studio.getState().sequence.keys.length),
        before + 1,
      );
      await page.getByRole("button", { name: "Undo timeline edit (Ctrl+Z)" }).click();
      assert.equal(
        await page.evaluate(() => window.studio.getState().sequence.keys.length),
        before,
      );
      await page.getByRole("button", { name: "Redo timeline edit (Ctrl+Shift+Z)" }).click();
      assert.equal(
        await page.evaluate(() => window.studio.getState().sequence.keys.length),
        before + 1,
      );
      await page.getByRole("button", { name: "Undo timeline edit (Ctrl+Z)" }).click();
      // Dragging is one transaction, and moving the key never moves a board node.
      const cameraKey = page.locator(".as-lane.as-camera .as-key").last();
      const box = await cameraKey.boundingBox();
      const historyCount = await page.evaluate(() => window.studio.getState().past.length);
      await page.mouse.move(box.x + 5, box.y + 10);
      await page.mouse.down();
      await page.mouse.move(box.x + 105, box.y + 10, { steps: 8 });
      await page.mouse.up();
      assert.equal(
        await page.evaluate(() => window.studio.getState().past.length),
        historyCount + 1,
      );
      assert.equal(await page.evaluate(() => window.studio.getState().sequence.keys[1].time), 6);
      await page.getByRole("button", { name: "Add tilt key", exact: true }).click();
      await page.getByLabel("Pitch (°)").fill("20");
      await page.getByLabel("Roll (°)").fill("-8");
      assert.ok(
        (await page.locator(".react-flow").getAttribute("style")).includes("rotateX(20deg)"),
      );
      // Picking a control must not activate it.
      await page.getByRole("button", { name: "Pick action target", exact: true }).click();
      await page.locator("#test-click").click();
      assert.equal(await page.locator("#click-count").textContent(), "0");
      assert.equal(await page.getByLabel("Action target selector").inputValue(), "#test-click");
      // Exercise real click/type/scroll events and pause/resume without duplicate actions.
      await page.evaluate(() => {
        const state = window.studio.getState();
        const action = (id, time, kind, selector, extra = {}) => ({
          id,
          time,
          label: id,
          track: "action",
          easing: "linear",
          enabled: true,
          value: { kind, selector, x: 0.1, y: 0.1, text: "", deltaX: 0, deltaY: 0, ...extra },
        });
        state.edit({
          ...state.sequence,
          duration: 1,
          keys: [
            action("click", 0, "click", "#test-click"),
            action("type", 0.2, "type", "#test-input", { text: "Sulfuric Acid" }),
            action("scroll", 0.4, "scroll", "#test-scroll", { deltaY: 200 }),
          ],
        });
      });
      await page.getByRole("button", { name: "Go to start (Home)" }).click();
      await page.getByLabel("Execute actions", { exact: true }).check();
      await page.getByRole("button", { name: "Play (Space)", exact: true }).click();
      await page.waitForFunction(
        () => !window.studio.getState().playing && window.studio.getState().time === 1,
      );
      assert.equal(await page.locator("#click-count").textContent(), "1");
      assert.equal(await page.locator("#test-input").inputValue(), "Sulfuric Acid");
      assert.equal(await page.locator("#test-scroll").evaluate((e) => e.scrollTop), 200);
      await page.getByLabel("Playhead", { exact: true }).fill("0");
      await page.getByLabel("Playhead", { exact: true }).fill("0.8");
      assert.equal(
        await page.locator("#click-count").textContent(),
        "1",
        "scrubbing must not click",
      );
      await page.getByRole("button", { name: "Clean preview (Esc to return)" }).click();
      assert.equal(await page.locator(".animation-studio").count(), 0);
      await page.keyboard.press("Escape");
      await page.getByRole("region", { name: "Animation studio" }).waitFor();
      // A failed action retries without replaying an earlier success at the same timestamp.
      await page.evaluate(() => {
        const state = window.studio.getState();
        const base = state.sequence.keys.find((k) => k.track === "action");
        state.edit({
          ...state.sequence,
          keys: [
            { ...base, id: "success", time: 0, value: { ...base.value, selector: "#test-click" } },
            {
              ...base,
              id: "failure",
              time: 0,
              value: { ...base.value, selector: "#missing-target" },
            },
          ],
        });
        window.studio.setState({ selected: ["failure"] });
      });
      await page.getByRole("button", { name: "Go to start (Home)" }).click();
      await page.getByRole("button", { name: "Play (Space)", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "Target unavailable" }).waitFor();
      assert.equal(await page.locator("#click-count").textContent(), "2");
      await page.getByLabel("Action target selector").fill("#test-click");
      await page.getByRole("button", { name: "Play (Space)", exact: true }).click();
      await page.waitForFunction(
        () => !window.studio.getState().playing && window.studio.getState().time === 1,
      );
      assert.equal(
        await page.locator("#click-count").textContent(),
        "3",
        "only the failed key should retry",
      );
      await page.getByLabel("Sequence name").fill("Factory showcase");
      await page.getByRole("button", { name: "Close animation studio" }).click();
      assert.equal(
        await page.locator(".factory-flow-board").getAttribute("data-animation-stage"),
        null,
      );
      assert.ok(!(await page.locator(".react-flow").getAttribute("style")).includes("rotateX"));
      await page.locator("#test-open").click();
      assert.equal(await page.getByLabel("Sequence name").inputValue(), "Factory showcase");
      assert.equal(await page.locator(".as-lane.as-action .as-key").count(), 2);
      // Different design tabs with the same project ID must have separate documents.
      await page.evaluate(() => window.designs.setState({ activeDesignId: "another-design" }));
      await page.waitForFunction(
        () => window.studio.getState().sequence.name === "Untitled sequence",
      );
      await page.getByLabel("Sequence name").fill("Second design");
      await page.evaluate(() => window.designs.setState({ activeDesignId: undefined }));
      await page.waitForFunction(
        () => window.studio.getState().sequence.name === "Factory showcase",
      );
      assert.equal(await page.locator(".as-lane.as-action .as-key").count(), 2);
      await page.getByLabel("Length", { exact: true }).fill("30");
      await page.getByRole("button", { name: "Add camera key", exact: true }).click();
      await page.screenshot({ path: path.join(output, `${name}-desktop.png`) });
      await page.setViewportSize({ width: 800, height: 700 });
      await page.screenshot({ path: path.join(output, `${name}-compact.png`) });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      assert.deepEqual(errors, []);
      report[name] = { passed: true, screenshots: [`${name}-desktop.png`, `${name}-compact.png`] };
    } finally {
      await browser.close();
    }
  }
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await server.close();
}
