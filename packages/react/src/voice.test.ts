import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";

const root = resolve(import.meta.dir, "../../..");
const scratch = `${root}/.scratch/voice-hook-test`;
let browser: Browser, page: Page, server: ReturnType<typeof Bun.serve>;
beforeAll(async () => {
  await rm(scratch, { recursive: true, force: true });
  await mkdir(`${scratch}/node_modules/@jgengine`, { recursive: true });
  for (const peer of ["react", "react-dom"]) await symlink(`${root}/packages/react/node_modules/${peer}`, `${scratch}/node_modules/${peer}`, "dir");
  for (const pkg of ["core", "react"]) {
    const pack = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch], { cwd: `${root}/packages/${pkg}`, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0];
    await mkdir(`${scratch}/node_modules/@jgengine/${pkg}`, { recursive: true });
    execFileSync("tar", ["-xzf", pack.filename, "-C", `node_modules/@jgengine/${pkg}`, "--strip-components=1"], { cwd: scratch });
  }
  await Bun.write(`${scratch}/fixture.tsx`, `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
    import {useVoice} from '@jgengine/react/voice';import {createLocalVoiceTransport} from '@jgengine/core/multiplayer/voiceContract';
    const audio=new AudioContext(),tracks=[audio.createMediaStreamDestination().stream.getAudioTracks()[0],audio.createMediaStreamDestination().stream.getAudioTracks()[0]],stream=new MediaStream(tracks);
    const local=createLocalVoiceTransport({userId:'crew-member'}),published=[],transport={...local.transport,publish(channelId,id){published.push(tracks.map(track=>track.enabled));return local.transport.publish(channelId,id)}},routes=[],resolveRoutes=()=>routes;let grant,requestCount=0,constraints=null;
    const capture=input=>{requestCount++;constraints=input;return new Promise(resolve=>grant=()=>resolve(stream))};
    function Fixture(){const[connected,setConnected]=useState(false),voice=useVoice({mode:new URLSearchParams(location.search).get('mode')??undefined,getUserMedia:capture,transport:connected?transport:undefined,channelId:'crew',resolveRoutes});
      window.fixture={state:()=>({mode:voice.mode,status:voice.status,transmitting:voice.transmitting,muted:voice.muted,micId:voice.micStream?.id??null,enabled:voice.micStream?.getAudioTracks().map(track=>track.enabled)??[],participants:voice.participants,constraints,requestCount}),roster:()=>local.participants('crew'),published:()=>published,grant:()=>grant(),tracks:()=>tracks.map(track=>({enabled:track.enabled,state:track.readyState}))};
      return <><output>{JSON.stringify(window.fixture.state())}</output><button onClick={()=>setConnected(!connected)}>Transport</button><button onClick={()=>void voice.requestMic()}>Microphone</button><button onClick={()=>voice.setMuted(!voice.muted)}>Mute</button><button onClick={()=>voice.keyDown()}>Talk</button><button onClick={()=>voice.keyUp()}>Release</button>{['hold','toggle','openMic'].map(mode=><button key={mode} onClick={()=>voice.setMode(mode)}>{mode}</button>)}</>;
    }const mounted=createRoot(document.getElementById('root'));window.unmountVoice=()=>flushSync(()=>mounted.unmount());mounted.render(<Fixture/>);
  `);
  const script = buildBrowserFixture(`${scratch}/fixture.tsx`);
  Bun.gc(true);
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => new URL(request.url).pathname === "/fixture.js" ? new Response(script, { headers: { "Content-Type": "text/javascript" } }) : new Response('<div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }) });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
}, 30000);
afterAll(async () => {
  await browser?.close(); server?.stop(true); await rm(scratch, { recursive: true, force: true });
  // Retire bundled build transports before another browser fixture starts.
  Bun.gc(true);
});
async function open(mode?: string) {
  await page.goto(`http://127.0.0.1:${server.port}/${mode === undefined ? "" : `?mode=${mode}`}`);
  await page.getByRole("button", { name: "Microphone", exact: true }).waitFor({ timeout: 2000 });
}
async function state() { return page.evaluate(() => (window as any).fixture.state()); }
async function press(name: string) { await page.getByRole("button", { name, exact: true }).click(); }
async function transmission(expected: boolean) {
  await page.waitForFunction(expected => {
    const state = (window as any).fixture.state();
    return state.transmitting === expected && state.enabled.every((enabled: boolean) => enabled === expected);
  }, expected, { timeout: 1000 });
  const snapshot = await state(); expect(snapshot.transmitting).toBe(expected);
  for (const enabled of snapshot.enabled) expect(enabled).toBe(expected);
}
async function grant() {
  await page.evaluate(() => (window as any).fixture.grant());
  await page.waitForFunction(() => (window as any).fixture.state().micId !== null, undefined, { timeout: 1000 });
}

test("open mic begins enabled before transport or microphone readiness", async () => {
  await open("openMic");
  expect(await state()).toMatchObject({ mode: "openMic", status: "open", transmitting: true, muted: false, micId: null, enabled: [], requestCount: 0 });
  await press("Transport"); await transmission(true);
  expect(await page.evaluate(() => (window as any).fixture.roster())).toEqual([{ userId: "crew-member" }]);
  await press("Microphone"); expect(await state()).toMatchObject({ transmitting: true, micId: null, constraints: { audio: true }, requestCount: 1 });
  await grant(); await transmission(true);
  const snapshot = await state(); expect(snapshot.enabled).toHaveLength(2);
  expect(snapshot.participants).toEqual([{ userId: "crew-member", streamId: snapshot.micId }]);
  expect(await page.evaluate(() => (window as any).fixture.published())).toEqual([[true, true]]);
});
test("mute before an open microphone grant applies to both real audio tracks", async () => {
  await open("openMic"); await press("Transport"); await press("Microphone"); await press("Mute");
  expect(await state()).toMatchObject({ mode: "openMic", status: "open", muted: true, transmitting: false });
  await grant(); await transmission(false);
  expect(await page.evaluate(() => (window as any).fixture.published())).toEqual([[false, false]]);
  await press("Mute"); await transmission(true); expect(await state()).toMatchObject({ muted: false, mode: "openMic", status: "open" });
});
for (const mode of [undefined, "hold", "toggle"]) {
  test(`${mode ?? "default"} voice starts idle and retains its explicit activation policy`, async () => {
    await open(mode); expect(await state()).toMatchObject({ mode: mode ?? "hold", status: "idle", transmitting: false, muted: false });
    await press("Microphone"); await grant(); await transmission(false);
    await press("Talk"); await transmission(true); expect(await state()).toMatchObject({ status: "keyed" });
    await press("Release"); await transmission(mode === "toggle");
    if (mode === "toggle") { await press("Talk"); await transmission(false); }
  });
}
test("mode transitions agree with controller status and captured tracks", async () => {
  await open("openMic"); await press("Microphone"); await grant(); await transmission(true);
  await press("hold"); await transmission(false); expect(await state()).toMatchObject({ mode: "hold", status: "idle" });
  await press("Talk"); await transmission(true); await press("toggle"); await transmission(false);
  expect(await state()).toMatchObject({ mode: "toggle", status: "idle" });
  await press("Talk"); await press("Release"); await transmission(true);
  await press("openMic"); await transmission(true); expect(await state()).toMatchObject({ mode: "openMic", status: "open" });
  await press("Mute"); await transmission(false); await press("hold");
  expect(await state()).toMatchObject({ mode: "hold", status: "idle", muted: true, transmitting: false });
});
for (const mode of ["hold", "openMic"]) {
  test(`microphone grant observes a pending change to ${mode}`, async () => {
    await open(mode === "hold" ? "openMic" : "hold"); await press("Transport"); await press("Microphone"); await press(mode);
    expect(await state()).toMatchObject({ mode, micId: null, transmitting: mode === "openMic" });
    await grant(); await transmission(mode === "openMic");
    expect((await state()).enabled).toHaveLength(2);
    expect(await page.evaluate(() => (window as any).fixture.published())).toEqual([[mode === "openMic", mode === "openMic"]]);
  });
}
for (const mode of ["hold", "toggle"]) {
  test(`transport replacement preserves an explicitly enabled ${mode} session and mute`, async () => {
    await open(mode); await press("Microphone"); await grant(); await press("Talk"); await transmission(true);
    await press("Transport"); await transmission(true); await press("Transport"); await transmission(true);
    expect(await state()).toMatchObject({ mode, status: "keyed", muted: false });
    await press("Mute"); await transmission(false); await press("Transport"); await transmission(false);
    expect(await state()).toMatchObject({ mode, status: "keyed", muted: true });
    await press("Mute"); await transmission(true); await press("Release"); await transmission(mode === "toggle");
    if (mode === "toggle") { await press("Talk"); await transmission(false); }
  });
}
test("unmount stops granted media tracks and leaves the actual voice transport", async () => {
  await open("openMic"); await press("Transport"); await press("Microphone"); await grant(); await transmission(true);
  expect(await page.evaluate(() => (window as any).fixture.tracks())).toEqual([{ enabled: true, state: "live" }, { enabled: true, state: "live" }]);
  await page.evaluate(() => (window as any).unmountVoice());
  expect(await page.evaluate(() => (window as any).fixture.tracks())).toEqual([{ enabled: true, state: "ended" }, { enabled: true, state: "ended" }]);
  expect(await page.evaluate(() => (window as any).fixture.roster())).toEqual([]);
});
