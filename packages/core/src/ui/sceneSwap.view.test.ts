import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../../scripts/browser-lib";

/**
 * A place change must never freeze a frame: the new place (here 24 parts of 25 ms each, 600 ms in
 * all) builds in the background in slices, and the swap flag the HUD paints its card from is up
 * from the moment the place changes until the new place is in and its shaders have compiled.
 */

setDefaultTimeout(30_000);

const scratch = resolve(import.meta.dir, "../../../../.scratch/scene-swap-test");
let browser: Browser;
let page: Page;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  // A run killed mid-test (a timeout) leaves its links here; the next run must not fail on EEXIST.
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });
  await symlink(resolve(import.meta.dir, "../../node_modules"), `${scratch}/node_modules`, "dir");
  const entry = `${scratch}/fixture.tsx`;
  await Bun.write(entry, `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { useDeferredSwap, useSceneSwapping } from '../../packages/core/src/ui/sceneSwap.view';

    // The shader warmup stand-in: the test says when the new place has compiled.
    let compiled = () => {};
    const prepare = () => new Promise((resolve) => { compiled = resolve; });

    let longest = 0;
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) longest = Math.max(longest, entry.duration); }).observe({ type: 'longtask', buffered: false });

    function Part({ place }) {
      const until = performance.now() + 25;
      while (performance.now() < until) { /* building this part of the place */ }
      return <i>{place}</i>;
    }
    const PARTS = Array.from({ length: 24 }, (_, i) => i);
    const Place = React.memo(function Place({ place }) {
      return <div id="shown" data-place={place}>{PARTS.map((i) => <Part key={i} place={place} />)}</div>;
    });
    function World({ wanted }) {
      const place = useDeferredSwap(wanted, prepare);
      return <Place place={place} />;
    }
    function Card() {
      return <b id="card">{useSceneSwapping() ? 'swapping' : 'idle'}</b>;
    }
    function Fixture() {
      const [wanted, setWanted] = useState('home');
      window.fixture = {
        go(next) { longest = 0; flushSync(() => setWanted(next)); },
        longest: () => longest,
        compiled: () => compiled(),
      };
      return <><Card /><World wanted={wanted} /></>;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
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
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => document.querySelector("#shown")?.getAttribute("data-place") === "home", undefined, { timeout: 15_000 })
    .catch((error: unknown) => { throw new Error(`fixture did not mount: ${errors.join("; ") || String(error)}`); });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  await rm(scratch, { recursive: true, force: true });
});

interface FixtureWindow {
  fixture: { go(next: string): void; longest(): number; compiled(): void };
}

test("a place change builds the new place in slices behind the card, compiles it, then drops the card", async () => {
  const atChange = await page.evaluate(() => {
    const { fixture } = window as unknown as FixtureWindow;
    fixture.go("vault");
    return { shown: document.querySelector("#shown")?.getAttribute("data-place"), card: document.querySelector("#card")?.textContent };
  });
  // Right after the change the old place still shows, with the card up.
  expect(atChange).toEqual({ shown: "home", card: "swapping" });
  await page.waitForFunction(() => document.querySelector("#shown")?.getAttribute("data-place") === "vault", undefined, { timeout: 10_000 });
  // 600 ms of building never ran as one task: each slice is about one part.
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).fixture.longest())).toBeLessThan(200);
  // Built, but its shaders are not in yet: the card stays up until they are.
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => document.querySelector("#card")?.textContent)).toBe("swapping");
  await page.evaluate(() => (window as unknown as FixtureWindow).fixture.compiled());
  await page.waitForFunction(() => document.querySelector("#card")?.textContent === "idle", undefined, { timeout: 5_000 });
});
