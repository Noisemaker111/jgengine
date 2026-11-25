import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type Browser } from "playwright-core";
import { buildBrowserFixture } from "../../../../scripts/browser-lib";
import { sharedChromium } from "../../../../scripts/sharedChromium";

setDefaultTimeout(30_000);

let scratch: string;
let browser: Browser;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "jgengine-scene-view-"));
  await mkdir(`${scratch}/node_modules`, { recursive: true });
  await symlink(resolve(import.meta.dir, "../../node_modules/three"), `${scratch}/node_modules/three`, "junction");
  await Bun.write(`${scratch}/tsconfig.json`, JSON.stringify({ extends: resolve(import.meta.dir, "../../../../tsconfig.base.json") }));
  await Bun.write(`${scratch}/fixture.ts`, `
    import { mountSceneView } from '@jgengine/core/sceneView/mount.draw';
    import { Mesh, BoxGeometry } from 'three';
    const loads = [];
    const roof = { draw: (object, context) => { const m = new Mesh(new BoxGeometry(1, 1, 1), context.surface('#ff0000')); m.position.set(object.value.center.x, object.value.center.y, object.value.center.z); m.name = 'roof'; return m; } };
    const kinds = {
      roof: async () => { loads.push('roof'); return { default: roof }; },
      tree: async () => { loads.push('tree'); return roof; },
    };
    const frames = (n) => new Promise((done) => { const tick = () => (--n <= 0 ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); });
    window.run = async () => {
      const canvas = document.querySelector('canvas');
      const wall = { id: 'wall', kind: 'wall', shape: 'box', center: { x: 0, y: 1, z: 0 }, halfExtents: { x: 2, y: 1, z: 2 }, color: '#3366cc' };
      const roofPart = { id: 'roof', kind: 'roof', shape: 'box', center: { x: 0, y: 2.5, z: 0 }, halfExtents: { x: 2, y: 0.5, z: 2 } };
      const gutter = { id: 'gutter', kind: 'gutter', points: [{ x: -2, y: 2, z: 2 }, { x: 2, y: 2, z: 2 }] };
      const doc = { volumes: [wall, roofPart], paths: [gutter], markers: [{ id: 'm', kind: 'point', position: { x: 0, y: 0, z: 0 } }] };
      const view = mountSceneView(canvas, doc, { kinds });
      await view.ready;
      const out = { firstFrames: view.frames, loadsAfterMount: [...loads], roofDrawnByKind: view.objectOf('roof')?.name };
      const gl = view.renderer.getContext();
      const pixel = new Uint8Array(4);
      gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      out.centerPixel = [...pixel];
      await frames(30);
      out.framesWhileStill = view.frames - out.firstFrames;
      const gutterBefore = view.objectOf('gutter');
      const wallBefore = view.objectOf('wall');
      await view.update({ ...doc, volumes: [{ ...wall, center: { x: 1, y: 1, z: 0 } }, roofPart] });
      out.framesAfterEdit = view.frames;
      out.gutterKept = view.objectOf('gutter') === gutterBefore;
      out.wallRedrawn = view.objectOf('wall') !== wallBefore && view.objectOf('wall').position.x === 1;
      await view.update({ volumes: [wall] });
      out.removed = view.objectOf('gutter') === undefined && view.objectOf('roof') === undefined;
      view.setCamera({ ...view.camera(), yaw: 1 });
      view.setCamera({ ...view.camera(), yaw: 1.2 });
      await frames(3);
      out.framesAfterTwoCameraMoves = view.frames - out.framesAfterEdit - 1;
      out.loadsAtEnd = [...loads];
      view.dispose();
      return out;
    };
    window.unstyled = async () => {
      const canvas = document.createElement('canvas');
      document.body.append(canvas);
      const before = [canvas.clientWidth, canvas.clientHeight];
      const view = mountSceneView(canvas, { volumes: [{ id: 'b', kind: 'box', shape: 'box', center: { x: 0, y: 0, z: 0 } }] });
      await view.ready;
      await frames(10);
      const after = [canvas.clientWidth, canvas.clientHeight];
      view.dispose();
      return { before, after, contextLost: view.renderer.getContext().isContextLost() };
    };
    window.slowKind = async () => {
      const canvas = document.querySelector('canvas');
      let release;
      const gate = new Promise((done) => { release = done; });
      const doc = { volumes: [{ id: 'far', kind: 'slow', shape: 'box', center: { x: 50, y: 0, z: 50 } }] };
      const view = mountSceneView(canvas, doc, { kinds: { slow: async () => { await gate; return roof; } } });
      // A resize while the kind loads draws a frame of the still-empty scene.
      canvas.style.width = '310px';
      await frames(5);
      release();
      await view.ready;
      const target = view.camera().target;
      view.dispose();
      return target;
    };
  `);
  const bundle = buildBrowserFixture(`${scratch}/fixture.ts`);
  server = Bun.serve({
    port: 0,
    fetch: (request) => new URL(request.url).pathname === "/fixture.js"
      ? new Response(bundle, { headers: { "content-type": "text/javascript" } })
      : new Response(`<!doctype html><style>#stage{width:300px;height:200px}</style><canvas id=stage></canvas><script type=module src="/fixture.js"></script>`, { headers: { "content-type": "text/html" } }),
  });
  browser = await sharedChromium();
});

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  await rm(scratch, { recursive: true, force: true });
});

test("draws once per change, keeps unchanged objects, and loads only the kinds a document uses", async () => {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${server.port}/`);
  await page.waitForFunction(() => "run" in window);
  const result = await page.evaluate(() => (window as unknown as { run(): Promise<Record<string, unknown>> }).run());
  expect(result["firstFrames"]).toBe(1);
  expect(result["loadsAfterMount"]).toEqual(["roof"]);
  expect(result["roofDrawnByKind"]).toBe("roof");
  expect(result["centerPixel"]).not.toEqual([244, 244, 242, 255]);
  expect(result["framesWhileStill"]).toBe(0);
  expect(result["framesAfterEdit"]).toBe(2);
  expect(result["gutterKept"]).toBe(true);
  expect(result["wallRedrawn"]).toBe(true);
  expect(result["removed"]).toBe(true);
  expect(result["framesAfterTwoCameraMoves"]).toBe(1);
  expect(result["loadsAtEnd"]).toEqual(["roof"]);
});

test("a canvas no stylesheet sizes keeps its size on a 2x screen, and dispose frees its GL context", async () => {
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.goto(`http://localhost:${server.port}/`);
  await page.waitForFunction(() => "unstyled" in window);
  const result = await page.evaluate(() => (window as unknown as { unstyled(): Promise<{ before: number[]; after: number[]; contextLost: boolean }> }).unstyled());
  expect(result.after).toEqual(result.before);
  expect(result.contextLost).toBe(true);
});

test("a frame drawn while a kind loads does not fix the camera on the empty scene", async () => {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${server.port}/`);
  await page.waitForFunction(() => "slowKind" in window);
  const target = await page.evaluate(() => (window as unknown as { slowKind(): Promise<{ x: number; z: number }> }).slowKind());
  expect(target.x).toBeCloseTo(50);
  expect(target.z).toBeCloseTo(50);
});
