import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";

const scratch = resolve(import.meta.dir, "../../../.scratch/settings-section-test");
let browser: Browser;
let page: Page;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  await mkdir(scratch, { recursive: true });
  await symlink(resolve(import.meta.dir, "../node_modules"), `${scratch}/node_modules`, "dir");
  const entry = `${scratch}/fixture.tsx`;
  await Bun.write(entry, `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { createRebindSession } from '../../packages/core/src/input/rebindSession';
    import { createSettingsStore } from '../../packages/core/src/settings/settingsModel';
    import { SettingsSection } from '../../packages/react/src/settingsBlocks';
    import { SettingsProvider, useSettingsStore } from '../../packages/react/src/settings';
    import { useAccessibilitySettings } from '../../packages/react/src/accessibilitySettings';
    import { HudThemeRoot } from '../../packages/react/src/hudThemeRoot';

    const session = createRebindSession({
      actions: [
        { id: 'jump', label: 'Jump', defaultCodes: ['Space'] },
        { id: 'fire', label: 'Fire', defaultCodes: ['KeyF'] },
      ],
    });
    const store = createSettingsStore({
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    });

    function Scaled() {
      const accessibility = useAccessibilitySettings();
      const settingsStore = useSettingsStore();
      return (
        <HudThemeRoot accessibility={accessibility}>
          <span id="scaled" style={{ fontSize: 'var(--jg-type-md)' }}>HUD</span>
          <button id="scale-up" onClick={() => settingsStore.set('accessibility.textScale', 2)}>bigger</button>
        </HudThemeRoot>
      );
    }

    function Fixture() {
      const [, bump] = React.useReducer((value) => value + 1, 0);
      React.useEffect(() => session.subscribe(bump), []);
      const category = {
        id: 'controls',
        label: 'Controls',
        rows: [],
        keybinds: session.rows().map((row) => ({
          action: row.actionId,
          label: row.label,
          bindingLabel: row.bindingLabel,
          isDefault: row.isDefault,
          rebind: (code) => { session.beginCapture(row.actionId); session.capture(code); },
          reset: () => { session.reset(row.actionId); },
        })),
      };
      return (
        <SettingsProvider store={store}>
          <SettingsSection category={category} />
          <Scaled />
        </SettingsProvider>
      );
    }

    window.fixture = {
      bindings: () => Object.fromEntries(session.rows().map((row) => [row.actionId, row.bindingLabel])),
      overrides: () => session.overrides(),
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
        : new Response('<div id="root"></div><script src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }),
  });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
}, 30000);

beforeEach(async () => {
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => typeof (window as any).fixture !== "undefined");
});

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  await rm(scratch, { recursive: true, force: true });
});

describe("SettingsSection rebinding", () => {
  test("click-to-capture writes the pressed key into the rebind session", async () => {
    expect(await page.evaluate(() => (window as any).fixture.bindings().jump)).toBe("Space");
    await page.locator('[data-settings-keybind="jump"] [data-settings-capture]').click();
    await page.keyboard.press("KeyQ");
    await page.waitForFunction(() => (window as any).fixture.bindings().jump === "Q");
    expect(await page.evaluate(() => (window as any).fixture.overrides().jump)).toEqual(["KeyQ"]);
  });

  test("Escape cancels capture without changing the binding", async () => {
    await page.locator('[data-settings-keybind="fire"] [data-settings-capture]').click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => (window as any).fixture.bindings().fire)).toBe("F");
  });

  test("a captured key never reaches the surrounding menu", async () => {
    await page.evaluate(() => {
      (window as any).menuKeys = [];
      window.addEventListener("keydown", (event) => (window as any).menuKeys.push(event.code));
    });
    await page.locator('[data-settings-keybind="jump"] [data-settings-capture]').click();
    await page.keyboard.press("KeyR");
    await page.waitForFunction(() => (window as any).fixture.bindings().jump === "R");
    expect(await page.evaluate(() => (window as any).menuKeys)).not.toContain("KeyR");
  });
});

describe("accessibility text scale", () => {
  test("the HUD root's type scale follows the stored preference", async () => {
    const before = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById("scaled")!).fontSize));
    await page.locator("#scale-up").click();
    await page.waitForFunction(
      (start) => parseFloat(getComputedStyle(document.getElementById("scaled")!).fontSize) > start * 1.8,
      before,
    );
    const after = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById("scaled")!).fontSize));
    expect(after / before).toBeCloseTo(2, 1);
  });
});
