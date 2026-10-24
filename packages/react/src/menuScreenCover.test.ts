import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";

/**
 * A menu only stops the world drawing when it says it paints over the whole canvas. The default
 * scrim keeps a live scene visible behind the menu, so it must leave the canvas drawing; a menu
 * marked `coversCanvas` holds one cover, and unmounting it must lift that cover.
 */

setDefaultTimeout(30_000);

const scratch = resolve(import.meta.dir, "../../../.scratch/menu-screen-cover-test");
let browser: Browser;
let page: Page;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  await mkdir(scratch, { recursive: true });
  await symlink(resolve(import.meta.dir, "../node_modules"), `${scratch}/node_modules`, "dir");
  const entry = `${scratch}/fixture.tsx`;
  await Bun.write(entry, `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { MenuScreen } from '../../packages/react/src/menuScreen';
    import { canvasCover } from '../../packages/react/src/canvasCover';

    const root = createRoot(document.getElementById('root'));

    function Fixture() {
      const [screen, setScreen] = useState({ open: true, coversCanvas: false, scrim: 'dim' });
      window.fixture = {
        set(next) { flushSync(() => setScreen((current) => ({ ...current, ...next }))); },
        covered: () => canvasCover.covered(),
        holders: () => canvasCover.holders(),
        unmount: () => { flushSync(() => root.unmount()); },
      };
      return <MenuScreen open={screen.open} scrim={screen.scrim} coversCanvas={screen.coversCanvas} label="cover test">
        <p>cover test</p>
      </MenuScreen>;
    }

    root.render(<Fixture/>);
  `);
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
  page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => typeof (window as unknown as { fixture?: unknown }).fixture !== "undefined");
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  await rm(scratch, { recursive: true, force: true });
});

interface FixtureWindow {
  fixture: {
    set(next: { open?: boolean; coversCanvas?: boolean; scrim?: string }): void;
    covered(): boolean;
    holders(): number;
    unmount(): void;
  };
}

async function covered(): Promise<boolean> {
  return page.evaluate(() => (window as unknown as FixtureWindow).fixture.covered());
}

async function holders(): Promise<number> {
  return page.evaluate(() => (window as unknown as FixtureWindow).fixture.holders());
}

async function set(next: { open?: boolean; coversCanvas?: boolean; scrim?: string }): Promise<void> {
  await page.evaluate((value) => (window as unknown as FixtureWindow).fixture.set(value), next);
}

describe("MenuScreen canvas cover", () => {
  test("a scrim over a live scene covers nothing", async () => {
    expect(await covered()).toBe(false);
    expect(await holders()).toBe(0);
  });

  test("a menu that declares it paints the whole canvas holds the cover", async () => {
    await set({ coversCanvas: true });
    expect(await covered()).toBe(true);
    expect(await holders()).toBe(1);
  });

  test("a closed menu holds nothing, and reopening holds it again", async () => {
    await set({ open: false });
    expect(await covered()).toBe(false);
    await set({ open: true });
    expect(await covered()).toBe(true);
  });

  test("a menu that stops declaring it releases the canvas", async () => {
    await set({ coversCanvas: false });
    expect(await covered()).toBe(false);
    expect(await holders()).toBe(0);
  });

  test("unmounting a covering menu lifts the cover", async () => {
    await set({ coversCanvas: true });
    expect(await covered()).toBe(true);
    await page.evaluate(() => (window as unknown as FixtureWindow).fixture.unmount());
    expect(await covered()).toBe(false);
    expect(await holders()).toBe(0);
  });
});
