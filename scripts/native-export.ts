// `bun run perf native export <game>`: play the game the way `bun run perf` does (same page, tier,
// 1920x1080 viewport, uncapped clock and walk path) and write what the native renderer needs to
// draw the same frames to `.scratch/native/<game>/`: the scene graph, buffers, textures, the
// environment, one frame's pass list, the per-frame camera/light/object track of the walk, and
// reference stills from three.js with and without the HUD.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyDevice, cdpField, ensureDevServer, navigateCapturePage, openPageSession, remoteObjectId, watchPageExceptions, withBrowserSession, type CdpSession } from "./browser-lib";
import { perfPageUrl } from "./perf-play";
import { provisionCapturedGame } from "./provisionCapture";
import { startPath } from "./perf-breakdown";
import { installNativeRecorder } from "./native-export.page";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface NativeExportOptions {
  game: string;
  seconds: number;
  out: string;
  width: number;
  height: number;
}

/** Start the receiver the page posts its buffers to. */
function startReceiver(out: string): { port: number; stop: () => void; received: string[] } {
  const received: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    maxRequestBodySize: 2 ** 31 - 1,
    async fetch(request) {
      const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "*" };
      if (request.method === "OPTIONS") return new Response(null, { headers: cors });
      const url = new URL(request.url);
      const name = url.searchParams.get("name");
      if (request.method !== "POST" || url.pathname !== "/put" || name === null || name.includes("..")) return new Response("bad request", { status: 400, headers: cors });
      const path = join(out, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, new Uint8Array(await request.arrayBuffer()));
      received.push(name);
      return new Response("ok", { headers: cors });
    },
  });
  return { port: server.port ?? 0, stop: () => server.stop(true), received };
}

/** Evaluate in the page and throw the page's own exception instead of returning undefined. */
async function call<T>(session: CdpSession, expression: string): Promise<T> {
  const result = await session.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  const failure = result["exceptionDetails"] as { exception?: { description?: string }; text?: string } | undefined;
  if (failure !== undefined) throw new Error(`page: ${failure.exception?.description ?? failure.text ?? "exception"}`);
  return (result["result"] as { value?: T } | undefined)?.value as T;
}

const HIDE_MULTI_DRAW = `(() => {
  for (const C of [globalThis.WebGL2RenderingContext, globalThis.WebGLRenderingContext]) {
    if (C === undefined) continue;
    const get = C.prototype.getExtension, list = C.prototype.getSupportedExtensions;
    C.prototype.getExtension = function (name) { return /multi_draw/i.test(name) ? null : get.call(this, name); };
    C.prototype.getSupportedExtensions = function () { return (list.call(this) ?? []).filter((n) => !/multi_draw/i.test(n)); };
  }
})();`;

/** Put every live WebGLRenderer into `globalThis.__jgRenderers` (three defines `render` per instance, so it is patched there). */
async function findRenderers(session: CdpSession): Promise<number> {
  const protoResult = await session.send("Runtime.evaluate", {
    expression: `(async () => {
      const urls = performance.getEntriesByType("resource").map((e) => e.name);
      const url = urls.find((n) => /\\/deps\\/three(\\.module)?\\.js(\\?|$)/.test(n)) ?? urls.find((n) => /node_modules\\/three\\//.test(n));
      if (url === undefined) throw new Error("three.js module URL not found");
      return (await import(url)).WebGLRenderer.prototype;
    })()`,
    awaitPromise: true,
  });
  const protoId = remoteObjectId(protoResult["result"]);
  if (protoId === undefined) throw new Error(`WebGLRenderer prototype unavailable: ${JSON.stringify(protoResult["exceptionDetails"] ?? null)}`);
  const found = await session.send("Runtime.queryObjects", { prototypeObjectId: protoId });
  const arrayId = remoteObjectId(found["objects"]);
  if (arrayId === undefined) throw new Error("queryObjects returned nothing");
  const counted = await session.send("Runtime.callFunctionOn", { objectId: arrayId, functionDeclaration: "function () { globalThis.__jgRenderers = Array.from(this); return this.length; }", returnByValue: true });
  return Number(cdpField(counted["result"], "value") ?? 0);
}

const HIDE_HUD =`(() => { const s = document.createElement('style'); s.id = '__jg_native_hide'; s.textContent = 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }'; document.head.appendChild(s); })()`;
const SHOW_HUD = `document.getElementById('__jg_native_hide')?.remove()`;

async function screenshot(session: CdpSession, path: string): Promise<void> {
  const shot = await session.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const data = shot["data"];
  if (typeof data !== "string") throw new Error("screenshot returned no data");
  writeFileSync(path, Buffer.from(data, "base64"));
}

/** The page with its HUD, and every visible HUD element's box, text and style, for the Rune HUD to match. */
async function hudShot(session: CdpSession, out: string, name: string): Promise<void> {
  await screenshot(session, join(out, "ref", `${name}.hud.png`));
  const hud = await call<unknown>(session, `(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.tagName === 'CANVAS') continue;
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
      const painted = own !== '' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.borderStyle !== 'none' || cs.backgroundImage !== 'none' || el.tagName === 'svg' || el.tagName === 'IMG';
      if (!painted) continue;
      out.push({ tag: el.tagName, cls: String(el.className?.baseVal ?? el.className ?? ''), x: r.x, y: r.y, w: r.width, h: r.height, text: own, color: cs.color, bg: cs.backgroundColor, bgImage: cs.backgroundImage, font: cs.font, weight: cs.fontWeight, size: cs.fontSize, family: cs.fontFamily, radius: cs.borderRadius, border: cs.border, borderColor: cs.borderColor, borderWidth: cs.borderWidth, opacity: cs.opacity, shadow: cs.boxShadow, textShadow: cs.textShadow, letterSpacing: cs.letterSpacing, textTransform: cs.textTransform, lineHeight: cs.lineHeight, align: cs.textAlign });
    }
    return out;
  })()`);
  writeFileSync(join(out, "ref", `${name}.hud.json`), `${JSON.stringify(hud, null, 1)}
`);
}

const wait = (session: CdpSession, ms: number): Promise<unknown> => call(session, `new Promise((r) => setTimeout(r, ${ms}))`);

/** `call`, failing after `ms` instead of waiting forever on a page that stopped answering. */
function callWithin<T>(session: CdpSession, expression: string, ms: number, what: string): Promise<T> {
  return Promise.race([call<T>(session, expression), new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what}: the page did not answer within ${ms} ms`)), ms))]);
}

/**
 * Stop the recorder and write its files. stop() runs on in the page and is polled, so a page that
 * dies or stalls while writing hundreds of MB fails with the stage it reached instead of hanging.
 */
async function finish(session: CdpSession): Promise<unknown> {
  await callWithin(session, `(globalThis.__jgNative.stop("").then((v) => { globalThis.__jgNativeResult = { ok: true, v }; }, (e) => { globalThis.__jgNativeResult = { ok: false, e: String(e?.stack ?? e) }; }), 0)`, 10_000, "stop");
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const result = await callWithin<{ ok: boolean; v?: unknown; e?: string } | null>(session, `globalThis.__jgNativeResult ?? null`, 30_000, "stop poll");
    if (result !== null) {
      if (!result.ok) throw new Error(`recorder stop: ${result.e}`);
      return result.v;
    }
    await Bun.sleep(1000);
  }
  throw new Error("recorder stop: still writing after 300 s");
}

export async function exportNativeScene(options: NativeExportOptions): Promise<number> {
  const { game, seconds, out } = options;
  mkdirSync(join(out, "ref"), { recursive: true });
  // The game's asset packs first, as `perf play` does: a fresh worktree otherwise records placeholders.
  await provisionCapturedGame(join(repoRoot, "games", game), (line) => console.error(`native export: ${line}`));
  const receiver = startReceiver(out);
  const server = await ensureDevServer(repoRoot);
  try {
    return await withBrowserSession(
      { keep: false, timeoutMs: 300_000, hardDeadlineMs: 900_000, frameClock: "uncapped", server: server.child, serverPid: server.pid },
      async ({ debugPort }) => {
        const session = await openPageSession(debugPort);
        try {
          await session.send("Page.enable");
          const throws = watchPageExceptions(session);
          await applyDevice(session, "desktop", "full", { width: options.width, height: options.height });
          // BatchedMesh (the static draw pool) draws through WEBGL_multi_draw, which the recorder
          // cannot see: Harbor Heat's palms, awnings and lamps were missing from its replay. Without
          // the extension three draws each batch item with drawElements and a `_gl_DrawID` uniform,
          // the same pixels, which the recorder records and the replay draws.
          await session.send("Page.addScriptToEvaluateOnNewDocument", { source: HIDE_MULTI_DRAW });
          const url = perfPageUrl({ base: server.base, game, quality: "high" });
          console.error(`native export: ${url}`);
          await navigateCapturePage(session, url.toString(), 210_000);
          console.error(`native export: ${await findRenderers(session)} WebGLRenderer instance(s)`);
          const installed = await call<{ ok: boolean; error?: string }>(session, `(${installNativeRecorder.toString()})(${receiver.port})`);
          if (!installed.ok) throw new Error(`recorder: ${installed.error}`);
          // The same warmup perf gives a game before it measures.
          await wait(session, 5000);
          console.error(`native export: main scene ${JSON.stringify(await call(session, `globalThis.__jgNative.identify()`))}`);
          await hudShot(session, out, "start");
          // Stand two seconds (readbacks along the way), walk the perf path with a readback each
          // second, then stand two seconds more.
          await call(session, `globalThis.__jgNative.start([30, 60, 90, 120])`);
          await wait(session, 2000);
          const release = await startPath(session, "walk");
          for (let s = 0; s < seconds; s += 1) { await call(session, `globalThis.__jgNative.addReadback(1)`); await wait(session, 1000); }
          await release();
          await wait(session, 1000);
          await call(session, `globalThis.__jgNative.addReadback(1)`);
          await wait(session, 1000);
          await call(session, `globalThis.__jgNative.addReadback(1)`);
          await wait(session, 300);
          const summary = await finish(session);
          console.error(`native export: ${JSON.stringify(summary)}`);
          await hudShot(session, out, "end");
          throws.stop();
          if (throws.exceptions.length > 0) console.error(`native export: page threw: ${throws.exceptions.join("; ")}`);
          writeFileSync(join(out, "export.json"), `${JSON.stringify({ game, at: new Date().toISOString(), seconds, url: url.toString(), viewport: [options.width, options.height], tier: "high", files: receiver.received.length, summary }, null, 1)}
`);
          console.log(`native export: wrote ${out}`);
          return 0;
        } finally {
          await session.close();
        }
      },
    );
  } finally {
    receiver.stop();
  }
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const game = argv.find((a) => !a.startsWith("--"));
  if (game === undefined) { console.error("usage: bun scripts/native-export.ts <game> [--seconds n]"); process.exit(2); }
  const secondsAt = argv.indexOf("--seconds");
  const seconds = secondsAt >= 0 ? Number(argv[secondsAt + 1]) : 8;
  const code = await exportNativeScene({ game, seconds, out: join(repoRoot, ".scratch", "native", game), width: 1920, height: 1080 });
  process.exit(code);
}
