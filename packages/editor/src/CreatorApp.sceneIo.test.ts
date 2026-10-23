import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { creatorAppFixture, type CreatorAppSession } from "../../../scripts/creator-app-fixture";

setDefaultTimeout(30_000);

const fixture = creatorAppFixture("creator-app-scene-io");
let session: CreatorAppSession;

beforeAll(async () => {
  session = await fixture.start();
  const { page } = session;
  await page.evaluate(() => (window as unknown as { seedCreator: (name: string, label: string) => Promise<unknown> }).seedCreator("Cloud course", "Saved start 1"));
  await page.getByRole("button", { name: "Create or edit", exact: true }).click();
  await page.getByRole("button", { name: "Edit Cloud course", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole("treeitem").filter({ hasText: "Saved start 1" }).waitFor();
}, 120000);

afterAll(() => fixture.stop(session));

/**
 * The play HUD's buttons, clicked without Playwright's two-frame stability check and each
 * followed by a wait on the state the click produces. A runner renders this scene at about one
 * frame a second, so that check cost 2-4 s of each click, 20-30 s of this file.
 */
function press(page: CreatorAppSession["page"], name: string) {
  return page.getByRole("button", { name, exact: true }).click({ force: true });
}

function shown(page: CreatorAppSession["page"], name: string) {
  return page.getByRole("button", { name, exact: true }).waitFor();
}

test("native export round-trips through validated import and rejects an over-budget file", async () => {
  const { page, scratch } = session;
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Editor menu", exact: true }).click();
  await page.getByRole("button", { name: "Export scene JSON", exact: true }).click();
  const download = await downloaded;
  const exported = `${scratch}/exported.json`;
  await download.saveAs(exported);
  const document = JSON.parse(await Bun.file(exported).text());
  expect(document.version).toBe(1);
  expect(document.markers[0].label).toBe("Saved start 1");
  await page.getByRole("button", { name: "Return to saved scenes", exact: true }).click();
  await page.getByRole("textbox", { name: "Scene name" }).fill("Imported course");
  await page.getByLabel("Import scene JSON", { exact: true }).setInputFiles({ name: "oversized.json", mimeType: "application/json", buffer: Buffer.from(" ".repeat(12001)) });
  await page.getByRole("alert").filter({ hasText: "byte budget" }).waitFor();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("creator-fixture:v1")!).documents.length)).toBe(1);
  await page.getByLabel("Import scene JSON", { exact: true }).setInputFiles(exported);
  await shown(page, "Save");
  await page.getByRole("treeitem").filter({ hasText: "Saved start 1" }).waitFor();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("creator-fixture:v1")!).documents.length)).toBe(2);
  expect(session.errors).toEqual([]);
}, 60000);

/** Simulation seconds read from the game clock itself, not the HUD's polled copy. */
function simSeconds(): Promise<number> {
  return session.page.evaluate(() => (window as any).simClock.now());
}

/**
 * Let `count` rendered frames pass, so a frozen clock is checked against real frames instead of
 * wall time. Three frames is enough for that and is what a runner can afford: each one costs
 * about a second there, and ten of them twice was a third of this file.
 */
function renderFrames(count: number): Promise<void> {
  return session.page.evaluate((frames) => new Promise<void>((done) => {
    let left = frames;
    const tick = () => { left -= 1; if (left <= 0) done(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }), count);
}

test("unsaved and pending failed saves survive native play, pause, resume and return", async () => {
  const { page } = session;
  await page.getByRole("treeitem").filter({ hasText: "Saved start 1" }).last().getByRole("button").first().click({ force: true });
  await page.getByRole("textbox", { name: "Object name" }).fill("Unsaved pending");
  await page.getByText("Unsaved changes", { exact: true }).waitFor();
  await press(page, "Play");
  await shown(page, "Pause simulation");
  await press(page, "Pause simulation");
  await page.waitForFunction(() => (window as any).simClock.isPaused());
  const paused = await simSeconds();
  await renderFrames(3);
  expect(await simSeconds()).toBe(paused);
  await press(page, "Step one frame (pause required)");
  await page.waitForFunction((previous) => (window as any).simClock.now() > previous && (window as any).simClock.isPaused(), paused);
  const stepped = await simSeconds();
  await renderFrames(3);
  expect(await simSeconds()).toBe(stepped);
  await press(page, "Resume simulation");
  await page.waitForFunction((previous) => (window as any).simClock.now() > previous, stepped);
  await page.keyboard.press("Escape");
  await press(page, "Return to editor");
  await page.getByText("Unsaved changes", { exact: true }).waitFor();
  await page.request.post(`http://127.0.0.1:${session.server.port}/hold-next-save`);
  await press(page, "Save");
  await shown(page, "Saving…");
  await press(page, "Play");
  await page.keyboard.press("Escape");
  await press(page, "Return to editor");
  await shown(page, "Saving…");
  // "Saving…" renders before the save's request reaches the server; releasing earlier would be a no-op.
  await session.heldSaveArrived();
  await page.request.post(`http://127.0.0.1:${session.server.port}/release-failed-save`);
  await shown(page, "Retry save");
  expect(await page.getByRole("button", { name: "Retry save", exact: true }).getAttribute("title")).toBe("Durable quota rejected");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("creator-fixture:v1")!).documents[1].document.markers[0].label)).toBe("Saved start 1");
  await press(page, "Retry save");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("creator-fixture:v1")!).documents[1].document.markers[0].label === "Unsaved pending");
  expect(await page.getByText("Unsaved changes", { exact: true }).count()).toBe(0);
  expect(session.errors).toEqual([]);
}, 180000);
