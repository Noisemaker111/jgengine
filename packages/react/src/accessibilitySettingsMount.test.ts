import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";

setDefaultTimeout(30_000);

const scratch = resolve(import.meta.dir, "../../../.scratch/accessibility-mount-test");
let browser: Browser;
let page: Page;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });
  await symlink(resolve(import.meta.dir, "../node_modules"), `${scratch}/node_modules`, "dir");
  const entry = `${scratch}/fixture.tsx`;
  await Bun.write(entry, `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { createSettingsStore } from '../../packages/core/src/settings/settingsModel';
    import { SettingsProvider } from '../../packages/react/src/settings';
    import { useAccessibilitySettings } from '../../packages/react/src/accessibilitySettings';

    const store = createSettingsStore({
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    });

    function Probe() {
      const a = useAccessibilitySettings();
      window.shown = { textScale: a.textScale, captions: a.captions, reducedMotion: a.reducedMotion };
      return null;
    }

    // A passive effect that runs after Probe's own, so waiting on it means the subscription exists.
    function Mounter() {
      React.useEffect(() => { window.mounted = true; }, []);
      return null;
    }

    // Writes after Probe's first render but before its subscription: the window a saved profile
    // or the demo path writes into.
    function Racing() {
      React.useLayoutEffect(() => { store.set('accessibility.textScale', 1.75); }, []);
      return null;
    }

    const root = createRoot(document.getElementById('root'));
    window.fixture = {
      write: (id, value) => flushSync(() => store.set(id, value)),
      mount: () => root.render(<SettingsProvider store={store}><Probe/><Mounter/></SettingsProvider>),
      mountRacing: () => root.render(<SettingsProvider store={store}><Probe/><Racing/><Mounter/></SettingsProvider>),
      shown: () => window.shown,
      mounted: () => window.mounted === true,
    };
  `);
  const script = buildBrowserFixture(entry);
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) =>
      new URL(request.url).pathname === "/fixture.js"
        ? new Response(script, { headers: { "Content-Type": "text/javascript" } })
        : new Response('<div id="root"></div><script type="module" src="/fixture.js"></script>', {
            headers: { "Content-Type": "text/html" },
          }),
  });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
}, 30_000);

beforeEach(async () => {
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => typeof (window as any).fixture !== "undefined");
  await page.evaluate(() => localStorage.clear());
});

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  await rm(scratch, { recursive: true, force: true });
});

const shown = () => page.evaluate(() => (window as any).fixture.shown());
const mounted = () => page.waitForFunction(() => (window as any).fixture.mounted() === true);

describe("useAccessibilitySettings on mount", () => {
  test("shows a value written before the hook mounts, with no further change", async () => {
    await page.evaluate(() => {
      (window as any).fixture.write("accessibility.captions", true);
      (window as any).fixture.write("accessibility.textScale", 1.5);
    });
    await page.evaluate(() => (window as any).fixture.mount());
    await mounted();
    expect(await shown()).toMatchObject({ captions: true, textScale: 1.5 });
  });

  test("shows a value written between its render and its subscription", async () => {
    await page.evaluate(() => (window as any).fixture.mountRacing());
    await mounted();
    await page.waitForFunction(() => (window as any).fixture.shown()?.textScale === 1.75, undefined, {
      polling: 25,
      timeout: 4_000,
    });
    expect((await shown()).textScale).toBe(1.75);
  });

  test("still re-renders when a later change lands", async () => {
    await page.evaluate(() => (window as any).fixture.mount());
    await mounted();
    expect((await shown()).reducedMotion).toBe(false);
    await page.evaluate(() => (window as any).fixture.write("accessibility.reducedMotion", true));
    await page.waitForFunction(() => (window as any).fixture.shown()?.reducedMotion === true, undefined, {
      polling: 25,
      timeout: 4_000,
    });
    expect((await shown()).reducedMotion).toBe(true);
  });
});
