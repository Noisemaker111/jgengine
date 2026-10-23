import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { creatorAppFixture, type CreatorAppSession } from "../../../scripts/creator-app-fixture";

setDefaultTimeout(30_000);

const fixture = creatorAppFixture("creator-app-scene-io");
let session: CreatorAppSession;
let lap = performance.now();
const mark = (label: string) => {
  const now = performance.now();
  console.log(`LAP ${label} ${(now - lap).toFixed(0)}ms`);
  lap = now;
};

beforeAll(async () => {
  lap = performance.now();
  session = await fixture.start();
  mark("fixture.start");
  const { page } = session;
  await page.evaluate(() => (window as unknown as { seedCreator: (name: string, label: string) => Promise<unknown> }).seedCreator("Cloud course", "Saved start 1"));
  mark("seed");
  await page.getByRole("button", { name: "Create or edit", exact: true }).click();
  mark("open creator");
  await page.getByRole("button", { name: "Edit Cloud course", exact: true }).click();
  mark("edit course");
  await page.getByRole("button", { name: "Save", exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole("treeitem").filter({ hasText: "Saved start 1" }).waitFor();
  mark("editor ready");
}, 120000);

afterAll(() => fixture.stop(session));

test("native export round-trips through validated import and rejects an over-budget file", async () => {
  lap = performance.now();
  const { page, scratch } = session;
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Editor menu", exact: true }).click();
  mark("menu");
  await page.getByRole("button", { name: "Export scene JSON", exact: true }).click();
  const download = await downloaded;
  mark("export click");
  const exported = `${scratch}/exported.json`;
  await download.saveAs(exported);
  mark("saveAs");
  const document = JSON.parse(await Bun.file(exported).text());
  expect(document.version).toBe(1);
  expect(document.markers[0].label).toBe("Saved start 1");
  await page.getByRole("button", { name: "Return to saved scenes", exact: true }).click();
  mark("return saved");
  await page.getByRole("textbox", { name: "Scene name" }).fill("Imported course");
  mark("fill name");
  await page.getByLabel("Import scene JSON", { exact: true }).setInputFiles({ name: "oversized.json", mimeType: "application/json", buffer: Buffer.from(" ".repeat(12001)) });
  await page.getByRole("alert").filter({ hasText: "byte budget" }).waitFor();
  mark("oversize rejected");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("creator-fixture:v1")!).documents.length)).toBe(1);
  await page.getByLabel("Import scene JSON", { exact: true }).setInputFiles(exported);
  await page.getByRole("button", { name: "Save", exact: true }).waitFor();
  await page.getByRole("treeitem").filter({ hasText: "Saved start 1" }).waitFor();
  mark("import accepted");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("creator-fixture:v1")!).documents.length)).toBe(2);
  expect(session.errors).toEqual([]);
  mark("test1 end");
}, 60000);

/** Simulation seconds read from the game clock itself, not the HUD's polled copy. */
function simSeconds(): Promise<number> {
  return session.page.evaluate(() => (window as any).simClock.now());
}

/** Let `count` rendered frames pass, so a frozen clock is checked against real frames instead of wall time. */
function renderFrames(count: number): Promise<void> {
  return session.page.evaluate((frames) => new Promise<void>((done) => {
    let left = frames;
    const tick = () => { left -= 1; if (left <= 0) done(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }), count);
}

test("unsaved and pending failed saves survive native play, pause, resume and return", async () => {
  lap = performance.now();
  const { page } = session;
  await page.getByRole("treeitem").filter({ hasText: "Saved start 1" }).last().getByRole("button").first().click();
  mark("select doc");
  await page.getByRole("textbox", { name: "Object name" }).fill("Unsaved pending");
  mark("fill name");
  await page.getByText("Unsaved changes", { exact: true }).waitFor();
  mark("unsaved");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  mark("play");
  const fps = await page.evaluate(() => new Promise<number>((done) => {
    const start = performance.now();
    let left = 5;
    const tick = () => { left -= 1; if (left <= 0) done((performance.now() - start) / 5); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  mark(`five frames ${fps.toFixed(0)}ms each`);
  await page.getByRole("button", { name: "Pause simulation", exact: true }).click();
  mark("pause");
  await page.waitForFunction(() => (window as any).simClock.isPaused());
  mark("paused fn");
  const paused = await simSeconds();
  await renderFrames(10);
  mark("frames 10");
  expect(await simSeconds()).toBe(paused);
  await page.getByRole("button", { name: "Step one frame (pause required)", exact: true }).click();
  mark("step");
  await page.waitForFunction((previous) => (window as any).simClock.now() > previous && (window as any).simClock.isPaused(), paused);
  const stepped = await simSeconds();
  mark("stepped fn");
  await renderFrames(10);
  mark("frames 10 b");
  expect(await simSeconds()).toBe(stepped);
  await page.getByRole("button", { name: "Resume simulation", exact: true }).click();
  mark("resume");
  await page.waitForFunction((previous) => (window as any).simClock.now() > previous, stepped);
  mark("resumed fn");
  await page.keyboard.press("Escape");
  mark("escape");
  await page.getByRole("button", { name: "Return to editor", exact: true }).click();
  mark("return");
  await page.getByText("Unsaved changes", { exact: true }).waitFor();
  mark("unsaved again");
  await page.request.post(`http://127.0.0.1:${session.server.port}/hold-next-save`);
  mark("hold post");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  mark("save click");
  await page.getByRole("button", { name: "Saving…", exact: true }).waitFor();
  mark("saving shown");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  mark("play b");
  await page.keyboard.press("Escape");
  mark("escape b");
  await page.getByRole("button", { name: "Return to editor", exact: true }).click();
  mark("return b");
  await page.getByRole("button", { name: "Saving…", exact: true }).waitFor();
  mark("saving b shown");
  await session.heldSaveArrived();
  mark("held arrived");
  await page.request.post(`http://127.0.0.1:${session.server.port}/release-failed-save`);
  await page.getByRole("button", { name: "Retry save", exact: true }).waitFor();
  mark("retry shown");
  expect(await page.getByRole("button", { name: "Retry save", exact: true }).getAttribute("title")).toBe("Durable quota rejected");
  mark("retry title");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("creator-fixture:v1")!).documents[1].document.markers[0].label)).toBe("Saved start 1");
  mark("stored label");
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  mark("retry click");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("creator-fixture:v1")!).documents[1].document.markers[0].label === "Unsaved pending");
  mark("retry done");
  expect(await page.getByText("Unsaved changes", { exact: true }).count()).toBe(0);
  expect(session.errors).toEqual([]);
  mark("test2 end");
}, 180000);
