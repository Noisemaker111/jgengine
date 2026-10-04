import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, readdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserServer, type Page } from "playwright-core";
import { buildBrowserFixture, chromeGraphicsArgs, findChromeExecutable } from "../../../scripts/browser-lib";
import { cleanupBrowserFixture } from "../../../scripts/browser-fixture-cleanup";
import { decodePng } from "../../../scripts/png-reader";
import { computeShotMetrics } from "../../../scripts/shot-metrics";

const scratch = resolve(import.meta.dir, "../../../.scratch/creator-mount-test");
let browser: Browser;
let browserServer: BrowserServer | undefined;
let page: Page;
let server: ReturnType<typeof Bun.serve>;
const errors: string[] = [];
let holdNextSave = false;
let releaseFailedSave: (() => void) | null = null;

beforeAll(async () => {
  await rm(scratch, { recursive: true, force: true });
  await mkdir(`${scratch}/node_modules/@jgengine`, { recursive: true });
  for (const peer of ["react", "react-dom", "three"]) await symlink(resolve(import.meta.dir, "../node_modules", peer), `${scratch}/node_modules/${peer}`, "dir");
  const store = resolve(import.meta.dir, "../../../node_modules/.bun");
  const stdlib = (await readdir(store)).find((entry) => entry.startsWith("three-stdlib@"));
  if (stdlib === undefined) throw new Error("three-stdlib is unavailable");
  await symlink(`${store}/${stdlib}/node_modules/three-stdlib`, `${scratch}/node_modules/three-stdlib`, "dir");
  await symlink(resolve(import.meta.dir, "../../navbake/node_modules/recast-navigation"), `${scratch}/node_modules/recast-navigation`, "dir");
  await mkdir(`${scratch}/node_modules/@react-three`, { recursive: true });
  for (const peer of ["@react-three/fiber", "@react-three/drei"]) await symlink(resolve(import.meta.dir, "../node_modules", peer), `${scratch}/node_modules/${peer}`, "dir");
  for (const pkg of ["core", "react", "ws", "shell", "navbake", "editor"]) {
    const pack = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch], { cwd: resolve(import.meta.dir, "../../", pkg), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0];
    await mkdir(`${scratch}/node_modules/@jgengine/${pkg}`, { recursive: true });
    execFileSync("tar", ["-xzf", pack.filename, "-C", `node_modules/@jgengine/${pkg}`, "--strip-components=1"], { cwd: scratch });
  }
  await Bun.write(`${scratch}/fixture.tsx`, `
    import React,{useState,useEffect} from 'react';import {createRoot} from 'react-dom/client';
    import {useGameContext} from '@jgengine/react/provider';
    import {GameHost} from '@jgengine/shell/GameHost';
    import {defineGame} from '@jgengine/shell/defineGame';import {createAssetCatalog} from '@jgengine/core/scene/assetCatalog';
    import {normalizeEditorLayers} from '@jgengine/core/editor/document';import {createCreatorDocumentStorage} from '@jgengine/core/editor/creatorStorage';
    import {environment,terrain} from '@jgengine/core/world/features';
    const policy={maxDocuments:2,maxBytes:12000,maxObjects:4,maxPathPoints:16,maxGridCells:0,maxTerrainVertices:0,allowedKinds:['player_spawn','prop'],allowedAssets:[]};
    const initialDocument=()=>normalizeEditorLayers({markers:[{id:'spawn',kind:'player_spawn',label:'Start marker',position:{x:0,y:0,z:0}}]});
    function ClockHud(){const ctx=useGameContext();const[time,setTime]=useState(ctx.time.now());useEffect(()=>{const timer=setInterval(()=>setTime(ctx.time.now()),50);return()=>clearInterval(timer)},[ctx]);return <output aria-label="Simulation seconds" style={{position:'absolute',top:60,left:8,color:'white'}}>{time.toFixed(6)}</output>}
    const createPlayable=document=>defineGame({name:'Creator fixture',assets:createAssetCatalog(),editorLayers:document,world:environment({terrain:terrain({bounds:{w:24,d:24},height:0,material:'grass'})}),GameUI:ClockHud,postProcessing:{enabled:false},shadows:false,graphics:{low:{renderScale:0.5},medium:{renderScale:0.5},high:{renderScale:0.5}},server:{mode:'single'},save:'none'});
    const durable=createCreatorDocumentStorage({storage:localStorage,key:'creator-fixture:v1',policy});
    const config={policy,initialDocument,createPlayable,storage:{...durable,save:async(...args)=>{const check=await(await fetch('/save-check')).json();if(!check.ok)throw new Error(check.error);return durable.save(...args)}}};
    const playable=createPlayable(initialDocument());const loader=()=>import('@jgengine/editor');
    function Fixture(){const[open,setOpen]=useState(false);return <>{!open&&<button onClick={()=>setOpen(true)}>Create or edit</button>}<GameHost playable={playable} editor={loader} creator={config} creatorOpen={open} onCreatorOpenChange={setOpen}/></>}
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `);
  const script = buildBrowserFixture(`${scratch}/fixture.tsx`);
  const stylePath = resolve(import.meta.dir, "../../../apps/dev/src/index.css");
  const tailwindImporter = Bun.resolveSync("@tailwindcss/vite", resolve(import.meta.dir, "../../../apps/dev/vite.config.ts"));
  const { compile } = await import(Bun.resolveSync("@tailwindcss/node", tailwindImporter));
  const { Scanner } = await import(Bun.resolveSync("@tailwindcss/oxide", tailwindImporter));
  const compiled = await compile(await Bun.file(stylePath).text(), { base: resolve(stylePath, ".."), from: stylePath, onDependency: () => {} });
  const css = compiled.build(new Scanner({ sources: compiled.sources }).scan());
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/hold-next-save") { holdNextSave = true; return Response.json({ ok: true }); }
    if (path === "/release-failed-save") { releaseFailedSave?.(); releaseFailedSave = null; return Response.json({ ok: true }); }
    if (path === "/save-check") {
      if (!holdNextSave) return Response.json({ ok: true });
      holdNextSave = false;
      return new Promise<Response>((done) => { releaseFailedSave = () => done(Response.json({ ok: false, error: "Durable quota rejected" })); });
    }
    if (path === "/fixture.js") return new Response(script, { headers: { "content-type": "text/javascript" } });
    if (path === "/fixture.css") return new Response(css, { headers: { "content-type": "text/css" } });
    return new Response('<link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "content-type": "text/html" } });
  } });
  browserServer = await chromium.launchServer({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox", ...chromeGraphicsArgs()] });
  browser = await chromium.connect(browserServer.wsEndpoint());
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (failure) => errors.push(failure.message));
  await page.goto(`http://127.0.0.1:${server.port}`);
}, 60000);

afterAll(() => cleanupBrowserFixture({
  releasePending: () => {
    const release = releaseFailedSave;
    releaseFailedSave = null;
    release?.();
  },
  browserServer,
  server,
  removeScratch: () => rm(scratch, { recursive: true, force: true }),
}));

test("production menu mounts the actual editor and repeats save/play/return/reopen across reload", async () => {
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
      const evidence = resolve(import.meta.dir, "../../../.scratch/creator-evidence");
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
  const evidence = resolve(import.meta.dir, "../../../.scratch/creator-evidence");
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/editor.png` });
  expect(errors).toEqual([]);
}, 180000);

test("native export round-trips through validated import and rejects an over-budget file", async () => {
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
  await page.getByRole("button", { name: "Save", exact: true }).waitFor();
  await page.getByRole("treeitem").filter({ hasText: "Saved start 1" }).waitFor();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("creator-fixture:v1")!).documents.length)).toBe(2);
  expect(errors).toEqual([]);
}, 60000);

test("unsaved and pending failed saves survive native play, pause, resume and return", async () => {
  await page.getByRole("treeitem").filter({ hasText: "Saved start 1" }).last().getByRole("button").first().click();
  await page.getByRole("textbox", { name: "Object name" }).fill("Unsaved pending");
  await page.getByText("Unsaved changes", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause simulation", exact: true }).click();
  await page.waitForTimeout(200);
  const paused = Number(await page.getByLabel("Simulation seconds", { exact: true }).textContent());
  await page.waitForTimeout(200);
  expect(Number(await page.getByLabel("Simulation seconds", { exact: true }).textContent())).toBe(paused);
  await page.getByRole("button", { name: "Step one frame (pause required)", exact: true }).click();
  await page.waitForFunction((previous) => Number(document.querySelector('[aria-label="Simulation seconds"]')?.textContent) > previous, paused);
  await page.waitForTimeout(200);
  const stepped = Number(await page.getByLabel("Simulation seconds", { exact: true }).textContent());
  await page.waitForTimeout(200);
  expect(Number(await page.getByLabel("Simulation seconds", { exact: true }).textContent())).toBe(stepped);
  await page.getByRole("button", { name: "Resume simulation", exact: true }).click();
  await page.waitForFunction((previous) => Number(document.querySelector('[aria-label="Simulation seconds"]')?.textContent) > previous, stepped);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Return to editor", exact: true }).click();
  await page.getByText("Unsaved changes", { exact: true }).waitFor();
  await page.request.post(`http://127.0.0.1:${server.port}/hold-next-save`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Saving…", exact: true }).waitFor();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Return to editor", exact: true }).click();
  await page.getByRole("button", { name: "Saving…", exact: true }).waitFor();
  await page.request.post(`http://127.0.0.1:${server.port}/release-failed-save`);
  await page.getByRole("button", { name: "Retry save", exact: true }).waitFor();
  expect(await page.getByRole("button", { name: "Retry save", exact: true }).getAttribute("title")).toBe("Durable quota rejected");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("creator-fixture:v1")!).documents[1].document.markers[0].label)).toBe("Saved start 1");
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("creator-fixture:v1")!).documents[1].document.markers[0].label === "Unsaved pending");
  expect(await page.getByText("Unsaved changes", { exact: true }).count()).toBe(0);
  expect(errors).toEqual([]);
}, 180000);
