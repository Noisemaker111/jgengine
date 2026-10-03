import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";

const root = resolve(import.meta.dir, "../../..");
const scratch = `${root}/.scratch/voice-capture-lifecycle-test`;
let browser: Browser, page: Page, server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  await rm(scratch, { recursive: true, force: true });
  await mkdir(`${scratch}/node_modules/@jgengine`, { recursive: true });
  for (const peer of ["react", "react-dom"]) {
    await symlink(`${root}/packages/react/node_modules/${peer}`, `${scratch}/node_modules/${peer}`, "dir");
  }
  for (const pkg of ["core", "react"]) {
    const pack = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch], {
      cwd: `${root}/packages/${pkg}`, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }))[0];
    await mkdir(`${scratch}/node_modules/@jgengine/${pkg}`, { recursive: true });
    execFileSync("tar", ["-xzf", pack.filename, "-C", `node_modules/@jgengine/${pkg}`, "--strip-components=1"], { cwd: scratch });
  }
  await Bun.write(`${scratch}/fixture.tsx`, `
    import React,{StrictMode,useEffect,useLayoutEffect,useState} from 'react';
    import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
    import {useVoice} from '@jgengine/react/voice';
    import {createLocalVoiceTransport} from '@jgengine/core/multiplayer/voiceContract';
    const audio=new AudioContext(),requests=[],results=[],publishes=[],joins=[],publicationRequests=[],unhandled=[];
    let publicationMode='normal';
    window.addEventListener('unhandledrejection',event=>unhandled.push(event.reason?.message??String(event.reason)));
    const capture=()=>{
      if(reuseIndex>=0){const shared=requests[reuseIndex];return new Promise((resolve,reject)=>requests.push({...shared,resolve,reject}))}
      const sources=[audio.createMediaStreamDestination(),audio.createMediaStreamDestination()];
      const stream=new MediaStream(sources.flatMap(source=>source.stream.getAudioTracks()));
      const stops=new Map();
      for(const track of stream.getTracks()){
        stops.set(track.id,0);const stop=track.stop.bind(track);
        track.stop=()=>{stops.set(track.id,stops.get(track.id)+1);stop()};
      }
      return new Promise((resolve,reject)=>requests.push({stream,sources,stops,resolve,reject}));
    };
    const transports=['A','B'].map(id=>{
      const local=createLocalVoiceTransport({userId:'crew-'+id});
      return {...local.transport,
        join(channel,stream){joins.push({id,channel,stream:stream??null});return local.transport.join(channel,stream)},
        publish(channel,stream){
          publishes.push({id,channel,stream});
          if(publicationMode==='reject')return Promise.reject(new Error('publish-denied-'+id));
          if(publicationMode==='defer')return new Promise((resolve,reject)=>publicationRequests.push({
            resolve:()=>void local.transport.publish(channel,stream).then(resolve,reject),
            reject:()=>reject(new Error('publish-denied-'+id))
          }));
          return local.transport.publish(channel,stream)
        }
      };
    });
    let voiceLatest,replaceTransport,replaceChannel,remembered,reuseIndex=-1;
    const start=voice=>{const index=results.length;results.push(null);void voice.requestMic().then(result=>results[index]=result);};
    function Fixture(){
      const [index,setIndex]=useState(0),[channelId,setChannelId]=useState('crew');
      const voice=useVoice({mode:'openMic',getUserMedia:capture,transport:transports[index],channelId});
      voiceLatest=voice;replaceTransport=()=>flushSync(()=>setIndex(1));replaceChannel=()=>flushSync(()=>setChannelId('wing'));
      useEffect(()=>{if(new URLSearchParams(location.search).has('auto'))start(voice)},[]);
      useLayoutEffect(()=>{if(new URLSearchParams(location.search).has('layout'))start(voice)},[index,channelId]);
      return <output>{voice.micStream?.id??'No microphone'}</output>;
    }
    const mounted=createRoot(document.getElementById('root'));
    const strict=new URLSearchParams(location.search).has('strict');
    mounted.render(strict?<StrictMode><Fixture/></StrictMode>:<Fixture/>);
    window.fixture={
      start:()=>start(voiceLatest),remember:()=>remembered=voiceLatest.requestMic,startRemembered:()=>start({requestMic:remembered}),grant:index=>requests[index].resolve(requests[index].stream),
      reject:index=>requests[index].reject(new Error('denied-'+index)),
      publication:mode=>publicationMode=mode,publishResolve:index=>publicationRequests[index].resolve(),publishReject:index=>publicationRequests[index].reject(),
      replace:()=>replaceTransport(),channel:()=>replaceChannel(),reuse:index=>reuseIndex=index,unmount:()=>flushSync(()=>mounted.unmount()),
      snapshot:()=>({results,publishes,joins,unhandled,micId:voiceLatest?.micStream?.id??null,error:voiceLatest?.micError??null,
        requests:requests.map(request=>({id:request.stream.id,tracks:request.stream.getTracks().map(track=>({state:track.readyState,enabled:track.enabled,stops:request.stops.get(track.id)}))}))}),
    };
  `);
  const script = buildBrowserFixture(`${scratch}/fixture.tsx`);
  Bun.gc(true);
  server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch: (request) => new URL(request.url).pathname === "/fixture.js"
      ? new Response(script, { headers: { "Content-Type": "text/javascript" } })
      : new Response('<div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }),
  });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
}, 30000);

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  await rm(scratch, { recursive: true, force: true });
  Bun.gc(true);
});

async function open(query = "") {
  await page.goto(`http://127.0.0.1:${server.port}/${query}`);
  await page.getByText("No microphone", { exact: true }).waitFor({ timeout: 2000 });
  await page.waitForFunction((strict) => (window as any).fixture.snapshot().joins.length >= (strict ? 2 : 1), query.includes("strict"));
}
async function action(method: string, index?: number | string) {
  await page.evaluate(({ method, index }) => (window as any).fixture[method](index), { method, index });
}
async function snapshot() { return page.evaluate(() => (window as any).fixture.snapshot()); }
async function settled(index: number) {
  await page.waitForFunction((index) => (window as any).fixture.snapshot().results[index] !== null, index, { timeout: 1000 });
  return snapshot();
}
async function granted(index: number, resultIndex = index) {
  await action("grant", index);
  const state = await settled(resultIndex);
  await page.waitForFunction((id) => (window as any).fixture.snapshot().micId === id, state.requests[index].id, { timeout: 1000 });
  return snapshot();
}
function ended(request: any) { expect(request.tracks).toEqual([{ state: "ended", enabled: true, stops: 1 }, { state: "ended", enabled: true, stops: 1 }]); }
function live(request: any) { expect(request.tracks).toEqual([{ state: "live", enabled: true, stops: 0 }, { state: "live", enabled: true, stops: 0 }]); }

for (const query of ["", "?strict"]) {
  test(`native deferred mic grant after unmount is retired${query ? " in StrictMode" : ""}`, async () => {
    await open(query);
    await action("start");
    await action("unmount");
    await action("grant", 0);
    const state = await settled(0);
    expect(state.results).toEqual([false]);
    ended(state.requests[0]);
    expect(state.publishes).toEqual([]);
  });
}

test("a successful repeated request retires the previous native stream", async () => {
  await open(); await action("start"); await granted(0);
  await action("start"); const state = await granted(1);
  expect(state.results).toEqual([true, true]);
  ended(state.requests[0]); live(state.requests[1]);
  expect(state.publishes.map((item: any) => item.stream)).toEqual(state.requests.map((item: any) => item.id));
  await action("unmount");
  const retired = await snapshot();
  ended(retired.requests[0]); ended(retired.requests[1]);
});

test("out-of-order grants preserve the most recent request and retire the older native stream", async () => {
  await open(); await action("start"); await action("start"); await granted(1);
  await action("grant", 0); const state = await settled(0);
  expect(state.results).toEqual([false, true]);
  ended(state.requests[0]); live(state.requests[1]);
  expect(state.micId).toBe(state.requests[1].id);
  expect(state.publishes).toEqual([{ id: "A", channel: "crew", stream: state.requests[1].id }]);
});

test("a rejected latest request does not authorize an older pending native grant", async () => {
  await open(); await action("start"); await action("start"); await action("reject", 1); await settled(1);
  await action("grant", 0); const state = await settled(0);
  expect(state.results).toEqual([false, false]);
  ended(state.requests[0]); expect(state.micId).toBeNull();
  expect(state.error).toBe("denied-1"); expect(state.publishes).toEqual([]);
});

test("a late rejected request cannot overwrite the latest accepted mic state", async () => {
  await open(); await action("start"); await action("start"); await granted(1);
  await action("reject", 0); const state = await settled(0);
  expect(state.error).toBeNull(); expect(state.micId).toBe(state.requests[1].id);
  live(state.requests[1]);
});

test("pending grants are retired when their voice transport is replaced", async () => {
  await open(); await action("start"); await action("replace"); await action("grant", 0);
  const retired = await settled(0);
  expect(retired.results).toEqual([false]); ended(retired.requests[0]);
  expect(retired.publishes).toEqual([]);
  await action("start"); const state = await granted(1);
  expect(state.publishes).toEqual([{ id: "B", channel: "crew", stream: state.requests[1].id }]);
  live(state.requests[1]);
});

test("already accepted native capture survives transport replacement and is joined to the replacement", async () => {
  await open(); await action("start"); await granted(0); await action("replace");
  const state = await snapshot();
  live(state.requests[0]); expect(state.micId).toBe(state.requests[0].id);
  expect(state.joins.at(-1)).toEqual({ id: "B", channel: "crew", stream: state.requests[0].id });
});

test("StrictMode setup cleanup remount rejects the first effect-owned permission request", async () => {
  await open("?strict&auto");
  expect((await snapshot()).requests).toHaveLength(2);
  await action("grant", 0); const retired = await settled(0);
  expect(retired.results[0]).toBe(false); ended(retired.requests[0]); expect(retired.publishes).toEqual([]);
  const state = await granted(1);
  expect(state.results).toEqual([false, true]); live(state.requests[1]);
});

test("failed replacement capture preserves the previously accepted native stream", async () => {
  await open(); await action("start"); await granted(0); await action("start"); await action("reject", 1);
  const state = await settled(1);
  expect(state.results).toEqual([true, false]); expect(state.error).toBe("denied-1");
  live(state.requests[0]); expect(state.micId).toBe(state.requests[0].id);
  expect(state.publishes).toHaveLength(1);
});


test("a retained request callback after unmount does not start another permission request", async () => {
  await open(); await action("unmount"); await action("start");
  const state = await settled(0);
  expect(state.results).toEqual([false]); expect(state.requests).toEqual([]);
  expect(state.publishes).toEqual([]);
});

test("channel replacement also retires its pending native grant", async () => {
  await open(); await action("start"); await action("channel"); await action("grant", 0);
  const state = await settled(0);
  expect(state.results).toEqual([false]); ended(state.requests[0]); expect(state.publishes).toEqual([]);
  await action("start"); const accepted = await granted(1);
  expect(accepted.publishes).toEqual([{ id: "A", channel: "wing", stream: accepted.requests[1].id }]);
});

test("a capture provider reusing an accepted native stream does not retire the current owner", async () => {
  await open(); await action("start"); await granted(0); await action("reuse", 0);
  await action("start"); await action("start"); await granted(2);
  await action("grant", 1); const state = await settled(1);
  expect(state.results).toEqual([true, false, true]);
  live(state.requests[0]); live(state.requests[1]); live(state.requests[2]);
  expect(state.publishes).toHaveLength(2);
  await action("unmount");
  const retired = await snapshot();
  ended(retired.requests[0]); ended(retired.requests[1]); ended(retired.requests[2]);
});


for (const method of ["replace", "channel"]) {
  test(`retained callbacks cannot request capture for a retired ${method === "replace" ? "transport" : "channel"}`, async () => {
    await open(); await action("remember"); await action(method); await action("startRemembered");
    const state = await settled(0);
    expect(state.results).toEqual([false]); expect(state.requests).toEqual([]); expect(state.publishes).toEqual([]);
    await action("start"); const current = await granted(0, 1);
    expect(current.results).toEqual([false, true]); live(current.requests[0]);
    expect(current.publishes).toEqual([{ id: method === "replace" ? "B" : "A", channel: method === "channel" ? "wing" : "crew", stream: current.requests[0].id }]);
  });
}

test("a newest request receiving an already retired shared native stream is rejected without publication", async () => {
  await open(); await action("start"); await action("reuse", 0); await action("start");
  await action("grant", 0); const first = await settled(0);
  expect(first.results[0]).toBe(false); ended(first.requests[0]);
  await action("grant", 1); const state = await settled(1);
  expect(state.results).toEqual([false, false]); ended(state.requests[0]); ended(state.requests[1]);
  expect(state.micId).toBeNull(); expect(state.publishes).toEqual([]);
  expect(state.error).toBe("microphone capture has no live audio tracks");
});

for (const query of ["?layout", "?strict&layout"]) {
  test(`committed layout callbacks retain capture ownership across setup and transport replacement${query.includes("strict") ? " in StrictMode" : ""}`, async () => {
    await open(query);
    const index = query.includes("strict") ? 1 : 0;
    if (index === 1) {
      await action("grant", 0); const stale = await settled(0);
      expect(stale.results[0]).toBe(false); ended(stale.requests[0]);
    }
    await granted(index); await action("replace"); const state = await granted(index + 1);
    expect(state.results[index + 1]).toBe(true); live(state.requests[index + 1]); ended(state.requests[index]);
    expect(state.publishes.at(-1)).toEqual({ id: "B", channel: "crew", stream: state.requests[index + 1].id });
  });
}


async function captured(index: number) {
  await action("grant", index);
  await page.waitForFunction((index) => {
    const state = (window as any).fixture.snapshot();
    return state.micId === state.requests[index].id;
  }, index, { timeout: 1000 });
}
async function noUnhandled() {
  // Native unhandledrejection is dispatched after the promise microtask checkpoint.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  expect((await snapshot()).unhandled).toEqual([]);
}

test("current asynchronous publication rejection returns false and surfaces its error while retaining capture", async () => {
  await open(); await action("publication", "reject"); await action("start");
  const state = await granted(0);
  expect(state.results).toEqual([false]); expect(state.error).toBe("publish-denied-A"); live(state.requests[0]);
  await noUnhandled(); await action("unmount"); ended((await snapshot()).requests[0]);
});

test("publication rejection after unmount is handled without updating retired mic state", async () => {
  await open(); await action("publication", "defer"); await action("start"); await captured(0);
  await action("unmount"); await action("publishReject", 0); const state = await settled(0);
  expect(state.results).toEqual([false]); expect(state.error).toBeNull(); ended(state.requests[0]);
  await noUnhandled();
});

test("successful publication for a retired transport cannot report current success", async () => {
  await open(); await action("publication", "defer"); await action("start"); await captured(0);
  await action("replace"); await action("publishResolve", 0); const state = await settled(0);
  expect(state.results).toEqual([false]); expect(state.error).toBeNull(); live(state.requests[0]);
  expect(state.joins.at(-1)).toEqual({ id: "B", channel: "crew", stream: state.requests[0].id });
  await noUnhandled();
});

test("a retired publication failure cannot overwrite a newer successful capture", async () => {
  await open(); await action("publication", "defer"); await action("start"); await captured(0);
  await action("publication", "normal"); await action("start"); await granted(1);
  await action("publishReject", 0); const state = await settled(0);
  expect(state.results).toEqual([false, true]); expect(state.error).toBeNull();
  ended(state.requests[0]); live(state.requests[1]); expect(state.micId).toBe(state.requests[1].id);
  await noUnhandled();
});
