import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { decodePng } from "../../../scripts/png-reader";
import { computeShotMetrics } from "../../../scripts/shot-metrics";
import { creatorAppFixture, type CreatorAppSession } from "../../../scripts/creator-app-fixture";

setDefaultTimeout(30_000);

const fixture = creatorAppFixture("creator-app-chain");
let session: CreatorAppSession;

beforeAll(async () => {
  session = await fixture.start();
}, 60000);

afterAll(() => fixture.stop(session));

test("production menu mounts the actual editor and repeats save/play/return/reopen across reload", async () => {
  const { page, evidence } = session;
  await page.getByRole("button", { name: "Create or edit", exact: true }).click();
  await page.getByRole("textbox", { name: "Scene name" }).fill("Cloud course");
  await page.getByRole("button", { name: "Create scene", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).waitFor({ timeout: 20000 });
  expect(await page.evaluate(() => "__jgengineEditorHost" in window)).toBe(false);
  for (let iteration = 0; iteration < 2; iteration += 1) {
    await page.getByRole("treeitem").filter({ hasText: iteration === 0 ? "Start marker" : "Saved start 0" }).last().getByRole("button").first().click();
    await page.getByRole("textbox", { name: "Object name" }).fill(`Saved start ${iteration}`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForFunction((label) => JSON.parse(localStorage.getItem("creator-fixture:v1")!).documents[0].document.markers[0].label === label, `Saved start ${iteration}`);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByRole("button", { name: "Return to editor", exact: true }).waitFor();
    expect(await page.locator("canvas").count()).toBe(1);
    if (iteration === 0) {
      await page.waitForFunction(() => Number(document.querySelector('[aria-label="Simulation seconds"]')?.textContent) > 0.1);
      // The play surface paints a loading cover over the canvas until the scene's shaders compile.
      // The simulation clock ticks behind that cover, so screenshot before it clears captures one
      // flat colour and the pixel check below reads it as a dead 3D view.
      await page.waitForFunction(() => document.querySelector("[data-shell-warmup], [data-shell-code-loading]") === null, undefined, { timeout: 20000 });
      await mkdir(evidence, { recursive: true });
      const image = decodePng(await page.locator("canvas").screenshot({ path: `${evidence}/play.png` }));
      const pixels = computeShotMetrics(image.width, image.height, image.data, { region: { x: 0, y: 100, width: image.width, height: image.height - 100 } });
      expect(pixels.nonblank).toBe(true);
      expect(pixels.dominantColorShare).toBeLessThan(0.97);
    }
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Return to editor", exact: true }).click();
    await page.getByRole("button", { name: "Return to saved scenes", exact: true }).click();
    await page.getByRole("button", { name: "Edit Cloud course", exact: true }).click();
    await page.getByRole("button", { name: "Save", exact: true }).waitFor();
  }
  await page.reload();
  await page.getByRole("button", { name: "Create or edit", exact: true }).click();
  await page.getByRole("button", { name: "Edit Cloud course", exact: true }).click();
  await page.getByRole("treeitem").filter({ hasText: "Saved start 1" }).waitFor();
  expect(await page.evaluate(() => "__jgengineEditorHost" in window)).toBe(false);
  await page.locator("canvas").waitFor({ state: "visible" });
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/editor.png` });
  expect(session.errors).toEqual([]);
}, 180000);
