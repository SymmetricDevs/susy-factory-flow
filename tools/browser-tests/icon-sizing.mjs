import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import { chromium, firefox } from "playwright-core";

const output = path.resolve(process.env.ICON_TEST_OUTPUT ?? ".icon-sizing-results.local");
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
const port = server.httpServer.address().port;
const report = {};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch({ headless: true });
    report[name] = { version: browser.version(), runs: [] };
    try {
      for (const dpr of [1, 2]) {
        const page = await browser.newPage({
          viewport: { width: 1600, height: 1200 },
          deviceScaleFactor: dpr,
        });
        page.setDefaultTimeout(20000);
        const errors = [];
        page.on("pageerror", (error) => {
          console.log(error.message);
          errors.push(error.message);
        });
        page.on("console", (msg) => {
          if (msg.type() === "error") console.log(msg.text());
        });
        for (const scale of [0.9, 1, 1.17])
          for (const camera of [0.65, 1, 1.5]) {
            await page.goto(
              `http://127.0.0.1:${port}/icon-sizing.html?scale=${scale}&camera=${camera}`,
              { waitUntil: "domcontentloaded" },
            );
            await page.waitForSelector('[data-case="hatch"] img');
            await page.waitForFunction(() =>
              Array.from(document.images).every(
                (image) => image.complete && image.naturalWidth > 0,
              ),
            );
            assert.deepEqual(errors, [], `${name}: browser errors`);
            const dimensions = await page.locator("[data-case]").evaluateAll((elements) =>
              elements.map((element) => {
                const art = element.querySelector(".minecraft-pixel-art");
                const box = art.parentElement;
                const rect = art.getBoundingClientRect();
                return {
                  id: element.dataset.case,
                  box: box.getBoundingClientRect().width,
                  width: rect.width,
                  height: rect.height,
                  expectedBox: Number(element.dataset.box),
                  expectedArt: Number(element.dataset.art),
                };
              }),
            );
            for (const row of dimensions) {
              const close = (actual, wanted) =>
                assert.ok(
                  Math.abs(actual - wanted) < 0.16,
                  `${name} dpr=${dpr} scale=${scale} camera=${camera} ${row.id}: ${actual} != ${wanted}`,
                );
              close(row.box, row.expectedBox * scale * camera);
              close(row.width, row.expectedArt * scale * camera);
              close(row.height, row.expectedArt * scale * camera);
            }
            report[name].runs.push({ dpr, scale, camera, dimensions });
            if (scale === 1 && camera === 1 && dpr === 1)
              await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
          }
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
  for (let i = 0; i < report.chromium.runs.length; i++) {
    const a = report.chromium.runs[i],
      b = report.firefox.runs[i];
    for (let j = 0; j < a.dimensions.length; j++)
      for (const axis of ["box", "width", "height"]) {
        assert.ok(
          Math.abs(a.dimensions[j][axis] - b.dimensions[j][axis]) < 0.16,
          `Engine mismatch: ${a.dimensions[j].id} ${axis}`,
        );
      }
  }
  console.log(
    `PASS: ${report.chromium.runs.length * report.chromium.runs[0].dimensions.length} icon cases per engine; Chromium ${report.chromium.version}, Firefox ${report.firefox.version}.`,
  );
} finally {
  await writeFile(path.join(output, "measurements.json"), JSON.stringify(report, null, 2));
  await server.close();
}
