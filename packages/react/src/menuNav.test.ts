import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";

setDefaultTimeout(30_000);

const scratch = resolve(import.meta.dir, "../../../.scratch/menu-nav-test");
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
    import { TitleMenu } from '../../packages/react/src/titleMenu';

    const pad = { buttons: new Set(), axes: [0, 0] };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [{
        id: 'fake', index: 0, connected: true, mapping: 'standard', timestamp: 0,
        axes: pad.axes,
        buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: pad.buttons.has(index), value: pad.buttons.has(index) ? 1 : 0, touched: pad.buttons.has(index) })),
      }],
    });

    function Fixture() {
      const [picked, setPicked] = useState([]);
      const [backs, setBacks] = useState(0);
      return <>
        <TitleMenu
          title="Beacon Bastion"
          items={[
            { id: 'continue', label: 'Continue', primary: true },
            { id: 'new', label: 'New Game' },
            { id: 'settings', label: 'Settings' },
            { id: 'credits', label: 'Credits', disabled: true },
          ]}
          onSelect={(id) => flushSync(() => setPicked((list) => [...list, id]))}
          onBack={() => flushSync(() => setBacks((value) => value + 1))}
        />
        <input id="typing" aria-label="typing" />
        <button id="outside" type="button">Outside</button>
        <output id="picked">{picked.join(',')}</output>
        <output id="backs">{backs}</output>
      </>;
    }

    window.fixture = {
      press: (buttons) => { pad.buttons = new Set(buttons); },
      axes: (values) => { pad.axes = values; },
    };
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `);
  const script = buildBrowserFixture(entry);
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) =>
      new URL(request.url).pathname === "/fixture.js"
        ? new Response(script, { headers: { "Content-Type": "text/javascript" } })
        : new Response('<div id="root"></div><input id="before" /><script src="/fixture.js"></script>', {
            headers: { "Content-Type": "text/html" },
          }),
  });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
}, 30000);

beforeEach(async () => {
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => typeof (window as any).fixture !== "undefined");
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-jg-menu-item") === "continue");
});

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  await rm(scratch, { recursive: true, force: true });
});

async function focused(): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("data-jg-menu-item") ?? null);
}

async function picked(): Promise<string> {
  return page.evaluate(() => document.getElementById("picked")?.textContent ?? "");
}

describe("menu keyboard navigation", () => {
  test("opens with the first item focused and moves with arrows, wrapping past the ends", async () => {
    expect(await focused()).toBe("continue");
    await page.keyboard.press("ArrowDown");
    expect(await focused()).toBe("new");
    await page.keyboard.press("ArrowDown");
    expect(await focused()).toBe("settings");
    await page.keyboard.press("ArrowDown");
    expect(await focused()).toBe("continue");
    await page.keyboard.press("ArrowUp");
    expect(await focused()).toBe("settings");
  });

  test("WASD moves, Home and End jump, and disabled items are skipped", async () => {
    await page.keyboard.press("KeyS");
    expect(await focused()).toBe("new");
    await page.keyboard.press("KeyW");
    expect(await focused()).toBe("continue");
    await page.keyboard.press("End");
    expect(await focused()).toBe("settings");
    await page.keyboard.press("Home");
    expect(await focused()).toBe("continue");
  });

  test("Enter selects the focused verb exactly once", async () => {
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    expect(await picked()).toBe("new");
    await page.keyboard.press("Space");
    expect(await picked()).toBe("new,new");
  });

  test("Escape goes back without moving focus", async () => {
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => document.getElementById("backs")?.textContent)).toBe("1");
    expect(await focused()).toBe("continue");
  });

  test("Tab leaves the menu instead of trapping focus", async () => {
    await page.keyboard.press("Tab");
    expect(await focused()).toBeNull();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("typing");
    await page.keyboard.press("ArrowDown");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("typing");
  });

  test("keys work when focus starts outside the menu", async () => {
    await page.locator("#outside").focus();
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-jg-menu-item") === "new");
    expect(await focused()).toBe("new");
  });
});

describe("menu gamepad navigation", () => {
  test("d-pad moves focus and A confirms", async () => {
    await page.evaluate(() => (window as any).fixture.press([13]));
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-jg-menu-item") === "new");
    await page.evaluate(() => (window as any).fixture.press([]));
    await page.waitForTimeout(60);
    await page.evaluate(() => (window as any).fixture.press([0]));
    await page.waitForFunction(() => document.getElementById("picked")?.textContent === "new");
    expect(await picked()).toBe("new");
  });

  test("a held A confirms once, not once per frame", async () => {
    await page.evaluate(() => (window as any).fixture.press([0]));
    await page.waitForFunction(() => document.getElementById("picked")?.textContent === "continue");
    await page.waitForTimeout(600);
    expect(await picked()).toBe("continue");
    await page.evaluate(() => (window as any).fixture.press([]));
  });

  test("B goes back", async () => {
    await page.evaluate(() => (window as any).fixture.press([1]));
    await page.waitForFunction(() => document.getElementById("backs")?.textContent === "1");
    expect(await page.evaluate(() => document.getElementById("backs")?.textContent)).toBe("1");
  });

  test("a held direction repeats after the initial press", async () => {
    await page.evaluate(() => (window as any).fixture.press([13]));
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-jg-menu-item") === "new");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("data-jg-menu-item") === "settings",
      undefined,
      { timeout: 3000 },
    );
    expect(await focused()).toBe("settings");
    await page.evaluate(() => (window as any).fixture.press([]));
  });
});
