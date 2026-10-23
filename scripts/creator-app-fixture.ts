// Setup shared by the two creator browser tests in packages/editor. Each test file pays
// its own copy - packing the packages, compiling the stylesheet, booting Chromium - so a
// file holds one scenario and the two halves of the old single scenario time separately.
import { mkdir, readdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, chromeGraphicsArgs, findChromeExecutable, killPid } from "./browser-lib";
import { cleanupBrowserFixture, ownBrowserProcess, type OwnedBrowserProcess } from "./browser-fixture-cleanup";
import { installPublicPackages } from "./browser-test-fixture";

const repoRoot = resolve(import.meta.dir, "..");
const editorRoot = resolve(repoRoot, "packages/editor");

export interface CreatorAppSession {
  page: Page;
  server: ReturnType<typeof Bun.serve>;
  scratch: string;
  /** Where a scenario writes its screenshots; one directory per fixture name. */
  evidence: string;
  /** Page errors the scenario asserts are empty at its end. */
  errors: string[];
  /** Resolves once the save the fixture is holding has actually reached the server. */
  heldSaveArrived(): Promise<void>;
}

export interface CreatorAppFixture {
  start(): Promise<CreatorAppSession>;
  stop(session: CreatorAppSession): Promise<void>;
}

export function creatorAppFixture(name: string): CreatorAppFixture {
  const scratch = resolve(repoRoot, ".scratch", name);
  const evidence = resolve(repoRoot, ".scratch/creator-evidence", name);
  let browser: Browser | undefined;
  let ownedBrowserProcess: OwnedBrowserProcess | undefined;
  let server: ReturnType<typeof Bun.serve> | undefined;
  let holdNextSave = false;
  let releaseFailedSave: (() => void) | null = null;
  let heldSaveArrived: Promise<void> = Promise.resolve();
  let markHeldSaveArrived = () => {};

  async function start(): Promise<CreatorAppSession> {
    const errors: string[] = [];
    await rm(scratch, { recursive: true, force: true });
    await mkdir(`${scratch}/node_modules/@jgengine`, { recursive: true });
    for (const peer of ["react", "react-dom", "three"]) await symlink(resolve(editorRoot, "node_modules", peer), `${scratch}/node_modules/${peer}`, "dir");
    const store = resolve(repoRoot, "node_modules/.bun");
    const stdlib = (await readdir(store)).find((entry) => entry.startsWith("three-stdlib@"));
    if (stdlib === undefined) throw new Error("three-stdlib is unavailable");
    await symlink(`${store}/${stdlib}/node_modules/three-stdlib`, `${scratch}/node_modules/three-stdlib`, "dir");
    await symlink(resolve(editorRoot, "../navbake/node_modules/recast-navigation"), `${scratch}/node_modules/recast-navigation`, "dir");
    await mkdir(`${scratch}/node_modules/@react-three`, { recursive: true });
    for (const peer of ["@react-three/fiber", "@react-three/drei"]) await symlink(resolve(editorRoot, "node_modules", peer), `${scratch}/node_modules/${peer}`, "dir");
    await installPublicPackages(scratch, ["core", "react", "ws", "shell", "navbake", "editor"]);
    await Bun.write(`${scratch}/fixture.tsx`, `
    import React,{useState,useEffect} from 'react';import {createRoot} from 'react-dom/client';
    import {useGameContext} from '@jgengine/react/provider';
    import {GameHost} from '@jgengine/shell/GameHost';
    import {defineGame} from '@jgengine/shell/defineGame';import {createAssetCatalog} from '@jgengine/core/scene/assetCatalog';
    import {normalizeEditorLayers} from '@jgengine/core/editor/document';import {createCreatorDocumentStorage} from '@jgengine/core/editor/creatorStorage';
    import {environment,terrain} from '@jgengine/core/world/features';
    const policy={maxDocuments:2,maxBytes:12000,maxObjects:4,maxPathPoints:16,maxGridCells:0,maxTerrainVertices:0,allowedKinds:['player_spawn','prop'],allowedAssets:[]};
    const initialDocument=()=>normalizeEditorLayers({markers:[{id:'spawn',kind:'player_spawn',label:'Start marker',position:{x:0,y:0,z:0}}]});
    function ClockHud(){const ctx=useGameContext();window.simClock=ctx.time;const[time,setTime]=useState(ctx.time.now());useEffect(()=>{const timer=setInterval(()=>setTime(ctx.time.now()),50);return()=>clearInterval(timer)},[ctx]);return <output aria-label="Simulation seconds" style={{position:'absolute',top:60,left:8,color:'white'}}>{time.toFixed(6)}</output>}
    const createPlayable=document=>defineGame({name:'Creator fixture',assets:createAssetCatalog(),editorLayers:document,world:environment({terrain:terrain({bounds:{w:24,d:24},height:0,material:'grass'})}),GameUI:ClockHud,postProcessing:{enabled:false},shadows:false,graphics:{low:{renderScale:0.5},medium:{renderScale:0.5},high:{renderScale:0.5}},server:{mode:'single'},save:'none'});
    const durable=createCreatorDocumentStorage({storage:localStorage,key:'creator-fixture:v1',policy});
    // A scenario that only needs a saved scene seeds it here instead of re-driving the
    // create/rename/save clicks, which cost 20 s of browser frames per test file.
    window.seedCreator=(name,label)=>durable.save({version:1,id:crypto.randomUUID(),name,revision:0,document:normalizeEditorLayers({markers:[{id:'spawn',kind:'player_spawn',label,position:{x:0,y:0,z:0}}]})},null);
    const config={policy,initialDocument,createPlayable,storage:{...durable,save:async(...args)=>{const check=await(await fetch('/save-check')).json();if(!check.ok)throw new Error(check.error);return durable.save(...args)}}};
    const playable=createPlayable(initialDocument());const loader=()=>import('@jgengine/editor');
    function Fixture(){const[open,setOpen]=useState(false);return <>{!open&&<button onClick={()=>setOpen(true)}>Create or edit</button>}<GameHost playable={playable} editor={loader} creator={config} creatorOpen={open} onCreatorOpenChange={setOpen}/></>}
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `);
    const script = buildBrowserFixture(`${scratch}/fixture.tsx`);
    const stylePath = resolve(repoRoot, "apps/dev/src/index.css");
    const tailwindImporter = Bun.resolveSync("@tailwindcss/vite", resolve(repoRoot, "apps/dev/vite.config.ts"));
    const { compile } = await import(Bun.resolveSync("@tailwindcss/node", tailwindImporter));
    const { Scanner } = await import(Bun.resolveSync("@tailwindcss/oxide", tailwindImporter));
    const compiled = await compile(await Bun.file(stylePath).text(), { base: resolve(stylePath, ".."), from: stylePath, onDependency: () => {} });
    const css = compiled.build(new Scanner({ sources: compiled.sources }).scan());
    server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request, held) => {
      const path = new URL(request.url).pathname;
      if (path === "/hold-next-save") {
        holdNextSave = true;
        heldSaveArrived = new Promise((arrived) => { markHeldSaveArrived = arrived; });
        return Response.json({ ok: true });
      }
      if (path === "/release-failed-save") { releaseFailedSave?.(); releaseFailedSave = null; return Response.json({ ok: true }); }
      if (path === "/save-check") {
        if (!holdNextSave) return Response.json({ ok: true });
        holdNextSave = false;
        // The scenario releases this save explicitly; fixture cleanup also drains it.
        held.timeout(request, 0);
        markHeldSaveArrived();
        return new Promise<Response>((done) => { releaseFailedSave = () => done(Response.json({ ok: false, error: "Durable quota rejected" })); });
      }
      if (path === "/fixture.js") return new Response(script, { headers: { "content-type": "text/javascript" } });
      if (path === "/fixture.css") return new Response(css, { headers: { "content-type": "text/css" } });
      return new Response('<link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "content-type": "text/html" } });
    } });
    const launchedBrowser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox", ...chromeGraphicsArgs()] });
    browser = launchedBrowser;
    const inspection = await launchedBrowser.newBrowserCDPSession();
    try {
      ownedBrowserProcess = ownBrowserProcess((await inspection.send("SystemInfo.getProcessInfo")).processInfo, async (pid) => {
        if (launchedBrowser.isConnected()) killPid(pid, true);
        await launchedBrowser.close();
      });
    } finally { await inspection.detach(); }
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("pageerror", (failure) => errors.push(failure.message));
    await page.goto(`http://127.0.0.1:${server.port}`);
    return { page, server, scratch, evidence, errors, heldSaveArrived: () => heldSaveArrived };
  }

  async function stop(session: CreatorAppSession): Promise<void> {
    await cleanupBrowserFixture({
      releasePending: () => {
        const release = releaseFailedSave;
        releaseFailedSave = null;
        release?.();
      },
      ownedBrowserProcess,
      browser,
      server: session.server,
      removeScratch: () => rm(scratch, { recursive: true, force: true }),
    });
  }

  return { start, stop };
}
