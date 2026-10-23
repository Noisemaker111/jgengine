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

    const pad = { buttons: new Set(), axes: [0, 0] };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [{
        id: 'fake', index: 0, connected: true, mapping: 'standard', timestamp: 0,
        axes: pad.axes,
        buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: pad.buttons.has(index), value: pad.buttons.has(index) ? 1 : 0, touched: pad.buttons.has(index) })),
      }],
    });

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

    const valuesRef = { current: { volume: 0.5, captions: false, quality: 'high' } };

    function Fixture() {
      const [, bump] = React.useReducer((value) => value + 1, 0);
      const [values, setValues] = React.useState({ volume: 0.5, captions: false, quality: 'high' });
      React.useEffect(() => session.subscribe(bump), []);
      valuesRef.current = values;
      const category = {
        id: 'controls',
        label: 'Controls',
        rows: [
          { id: 'volume', label: 'Volume', kind: 'slider', value: values.volume, min: 0, max: 1, step: 0.1,
            set: (next) => flushSync(() => setValues((prev) => ({ ...prev, volume: Number(next) }))) },
          { id: 'captions', label: 'Captions', kind: 'toggle', value: values.captions,
            set: (next) => flushSync(() => setValues((prev) => ({ ...prev, captions: Boolean(next) }))) },
          { id: 'quality', label: 'Quality', kind: 'select', value: values.quality,
            options: [{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }, { value: 'ultra', label: 'Ultra' }],
            set: (next) => flushSync(() => setValues((prev) => ({ ...prev, quality: String(next) }))) },
        ],
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
          <output id="volume">{values.volume.toFixed(2)}</output>
          <output id="captions">{String(values.captions)}</output>
          <output id="quality">{values.quality}</output>
          <Scaled />
        </SettingsProvider>
      );
    }

    window.fixture = {
      bindings: () => Object.fromEntries(session.rows().map((row) => [row.actionId, row.bindingLabel])),
      overrides: () => session.overrides(),
      values: () => valuesRef.current,
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
        : new Response('<div id="root"></div><script src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }),
  });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
}, 30000);

beforeEach(async () => {
  await page.goto(`http://127.0.0.1:${server.port}`);
  // Park the pointer away from the rows: Playwright keeps the mouse where the last click left it, and a
  // hovered row legitimately becomes the menu's active row after a reload.
  await page.mouse.move(1270, 700);
  await page.waitForFunction(() => typeof (window as any).fixture !== "undefined");
});

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  await rm(scratch, { recursive: true, force: true });
});

async function focused(): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("data-jg-menu-item") ?? null);
}

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

describe("SettingsSection keyboard rows", () => {
  test("arrow keys edit the focused row through the same adjust path the d-pad uses", async () => {
    await page.evaluate(() => {
      (document.querySelector('[data-jg-menu-item="row:volume"]') as HTMLElement | null)?.focus();
    });
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-jg-menu-item") === "row:volume");
    await page.keyboard.press("ArrowRight");
    expect(await page.evaluate(() => document.getElementById("volume")?.textContent)).toBe("0.60");
    await page.keyboard.press("ArrowLeft");
    expect(await page.evaluate(() => document.getElementById("volume")?.textContent)).toBe("0.50");
    await page.keyboard.press("ArrowDown");
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-jg-menu-item"))).toBe("row:captions");
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => document.getElementById("captions")?.textContent)).toBe("true");
  }, 20_000);
});

describe("SettingsSection gamepad rows", () => {
  const press = (buttons: number[]) => page.evaluate((held) => (window as any).fixture.press(held), buttons);
  const release = async () => {
    await press([]);
    await page.waitForTimeout(60);
  };
  const text = (id: string) => page.evaluate((want) => document.getElementById(want)?.textContent, id);
  const focusedOn = (id: string, timeout = 4000) =>
    page.waitForFunction((want) => document.activeElement?.getAttribute("data-jg-menu-item") === want, id, {
      polling: 50,
      timeout,
    });
  // Move the nav's active row on purpose: the mouse can hover another row after a reload, which is correct behaviour.
  const focusRow = async (id: string) => {
    await page.evaluate((want) => {
      const element = document.querySelector(`[data-jg-menu-item="${want}"]`);
      (element as HTMLElement | null)?.focus();
    }, id);
    await focusedOn(id);
  };
  const armed = () =>
    page.evaluate(() => document.querySelector('[data-settings-keybind="jump"]')?.hasAttribute("data-armed") === true);

  test("opens on the first row and one d-pad press steps its value by the row's step", async () => {
    await focusRow("row:volume");
    await page.evaluate(() => {
      (window as any).steps = [];
      let last = document.getElementById("volume")?.textContent;
      (window as any).sampler = setInterval(() => {
        const now = document.getElementById("volume")?.textContent;
        if (now !== last) {
          (window as any).steps.push(now);
          last = now;
        }
      }, 20);
    });
    await press([15]);
    await page.waitForFunction(() => Number(document.getElementById("volume")?.textContent) > 0.5, undefined, {
      polling: 25,
      timeout: 4000,
    });
    const steps = await page.evaluate(() => {
      clearInterval((window as any).sampler);
      return (window as any).steps as string[];
    });
    await release();
    expect(steps[0]).toBe("0.60");
  }, 20_000);

  test("d-pad down moves to the next row and A flips a toggle", async () => {
    await focusRow("row:volume");
    await press([13]);
    await focusedOn("row:captions");
    await release();
    expect(await text("captions")).toBe("false");
    await press([0]);
    await page.waitForFunction(() => document.getElementById("captions")?.textContent === "true", undefined, {
      polling: 25,
      timeout: 4000,
    });
    await release();
    expect(await text("captions")).toBe("true");
  }, 20_000);

  test("d-pad left steps a select backwards", async () => {
    await focusRow("row:quality");
    expect(await text("quality")).toBe("high");
    await press([14]);
    await page.waitForFunction(() => document.getElementById("quality")?.textContent === "low", undefined, {
      polling: 25,
      timeout: 4000,
    });
    await release();
    expect(await text("quality")).toBe("low");
  }, 20_000);

  test("a held d-pad direction repeats instead of stepping once", async () => {
    await focusRow("row:volume");
    await page.evaluate(() => {
      (window as any).steps = [];
      let last = document.getElementById("volume")?.textContent;
      (window as any).sampler = setInterval(() => {
        const now = document.getElementById("volume")?.textContent;
        if (now !== last) {
          (window as any).steps.push(now);
          last = now;
        }
      }, 20);
    });
    await press([15]);
    await page.waitForFunction(() => Number(document.getElementById("volume")?.textContent) >= 0.8, undefined, {
      polling: 50,
      timeout: 4000,
    });
    const steps = await page.evaluate(() => {
      clearInterval((window as any).sampler);
      return (window as any).steps as string[];
    });
    await release();
    // One press steps once; a repeat shows several values in a row while the direction stays held.
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(Number(steps[steps.length - 1])).toBeGreaterThan(0.6);
  }, 20_000);

  test("a held stick repeats on hold", async () => {
    await focusRow("row:volume");
    await page.evaluate(() => (window as any).fixture.axes([1, 0]));
    await page.waitForFunction(() => Number(document.getElementById("volume")?.textContent) >= 0.8, undefined, {
      polling: 50,
      timeout: 4000,
    });
    await page.evaluate(() => (window as any).fixture.axes([0, 0]));
    // 0.5 to 0.8 is three steps, so only hold-to-repeat can get there.
    expect(await page.evaluate(() => (window as any).fixture.values().volume)).toBeGreaterThanOrEqual(0.8);
  }, 20_000);

  test("A arms the focused keybind row and Escape cancels without rebinding", async () => {
    await focusRow("row:volume");
    for (const row of ["row:captions", "row:quality", "key:jump"]) {
      await press([13]);
      await focusedOn(row);
      await release();
    }
    await press([0]);
    await page.waitForFunction(() => document.querySelector('[data-settings-keybind="jump"]')?.hasAttribute("data-armed") === true, undefined, {
      polling: 25,
      timeout: 4000,
    });
    await release();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector('[data-settings-keybind="jump"]')?.hasAttribute("data-armed") === false, undefined, {
      polling: 25,
      timeout: 4000,
    });
    expect(await page.evaluate(() => (window as any).fixture.bindings().jump)).toBe("Space");
  }, 20_000);

  test("Escape disarms before the next key arrives, so a key in the same tick cannot rebind", async () => {
    await focusRow("row:volume");
    for (const row of ["row:captions", "row:quality", "key:jump"]) {
      await press([13]);
      await focusedOn(row);
      await release();
    }
    await press([0]);
    await page.waitForFunction(() => document.querySelector('[data-settings-keybind="jump"]')?.hasAttribute("data-armed") === true);
    await release();
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ", bubbles: true }));
    });
    await page.waitForTimeout(120);
    expect(await armed()).toBe(false);
    expect(await page.evaluate(() => (window as any).fixture.bindings().jump)).toBe("Space");
  }, 20_000);
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
