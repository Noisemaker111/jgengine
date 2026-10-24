import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../../scripts/browser-lib";

/**
 * A save thumbnail must survive the canvas binding arriving after the save screen: the shared
 * request waits for the mount and a painted frame instead of each game polling and sleeping.
 */

setDefaultTimeout(45_000);

const scratch = resolve(import.meta.dir, "../../../../.scratch/scene-thumbnail-test");
let browser: Browser;
let page: Page;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  await mkdir(scratch, { recursive: true });
  await Bun.write(
    `${scratch}/tsconfig.json`,
    JSON.stringify({ extends: resolve(import.meta.dir, "../../../../tsconfig.base.json") }),
  );
  const entry = `${scratch}/fixture.tsx`;
  await Bun.write(
    entry,
    `
    import { registerSceneCapture, requestSceneThumbnail } from '@jgengine/shell/render/sceneCaptureRequest';

    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 54;
    const context = canvas.getContext('2d');
    if (context !== null) {
      const sky = context.createLinearGradient(0, 0, 96, 54);
      sky.addColorStop(0, '#0b1622');
      sky.addColorStop(1, '#7dd3fc');
      context.fillStyle = sky;
      context.fillRect(0, 0, 96, 54);
    }

    const requested = { beforeBinding: true };
    const latched = requestSceneThumbnail({ width: 320, height: 180 });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      requested.beforeBinding = false;
      registerSceneCapture(() => canvas.toDataURL('image/png'));
    }));

    window.fixture = {
      requested,
      late: latched.then(async (result) => {
        if (!result.ok) return result;
        const image = new Image();
        const decoded = await new Promise((decoded) => {
          image.onload = () => decoded(true);
          image.onerror = () => decoded(false);
          image.src = result.thumbnail;
        });
        return { ...result, decoded, width: image.naturalWidth, height: image.naturalHeight };
      }),
    };
  `,
  );
  const script = buildBrowserFixture(entry);
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) =>
      new URL(request.url).pathname === "/fixture.js"
        ? new Response(script, { headers: { "Content-Type": "text/javascript" } })
        : new Response('<div id="root"></div><script src="/fixture.js"></script>', {
            headers: { "Content-Type": "text/html" },
          }),
  });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => typeof (window as unknown as { fixture?: unknown }).fixture !== "undefined");
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  await rm(scratch, { recursive: true, force: true });
});

interface ThumbnailResult {
  ok: boolean;
  reason?: string;
  thumbnail?: string;
  decoded?: boolean;
  width?: number;
  height?: number;
}

test("a canvas that binds late still yields a usable save thumbnail", async () => {
  const result = await page.evaluate(() => (window as unknown as { fixture: { late: Promise<ThumbnailResult> } }).fixture.late);
  expect(result).toMatchObject({ ok: true, decoded: true, width: 320, height: 180 });
  expect(result.thumbnail!.startsWith("data:image/jpeg")).toBe(true);
  expect(result.thumbnail!.length).toBeGreaterThan(1000);
});
