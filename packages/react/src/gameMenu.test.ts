import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";

/**
 * A game menu is judged on the rendered surface, not on its props: the page must never scroll, the
 * slot cards must carry real save data, Continue must resume the newest slot, delete must ask first,
 * and every verb must be reachable from the keyboard. These run in Chrome at three viewport sizes.
 */

setDefaultTimeout(45_000);

const scratch = resolve(import.meta.dir, "../../../.scratch/game-menu-test");
let browser: Browser;
let page: Page;
let server: ReturnType<typeof Bun.serve>;

const VIEWPORTS = [
  { width: 1600, height: 900 },
  { width: 1024, height: 640 },
  { width: 844, height: 390 },
];

beforeAll(async () => {
  await mkdir(scratch, { recursive: true });
  await symlink(resolve(import.meta.dir, "../node_modules"), `${scratch}/node_modules`, "dir");
  const entry = `${scratch}/fixture.tsx`;
  await Bun.write(
    entry,
    `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { createSaveSlots } from '../../packages/core/src/game/saveSlots';
    import { GameMenu } from '../../packages/react/src/gameMenu';
    import { ContinuePane, SaveSlotsPane } from '../../packages/react/src/gameMenuSaves';

    const now = 1_700_000_000_000;
    const model = createSaveSlots({
      now: () => now,
      slots: [
        { id: 'slot-1', empty: true, meta: {} },
        { id: 'slot-2', empty: true, meta: {} },
        { id: 'slot-3', empty: true, meta: {} },
      ],
    });
    model.write('slot-1', {
      name: 'Old Hand',
      savedAt: now - 90 * 60_000,
      meta: { playtime: '1h 4m', character: 'Old Hand', level: 4, thumbnail: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' },
    });
    model.write('slot-2', {
      name: 'Mara Vell',
      savedAt: now - 60_000,
      meta: { playtime: '4h 12m', character: 'Mara Vell', level: 9, thumbnail: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' },
    });

    const record = { chosen: [], continued: [], loaded: [], deleted: [] };
    const root = createRoot(document.getElementById('root'));

    function Fixture() {
      const [name, setName] = useState('');
      const [active, setActive] = useState('continue');
      window.fixture = {
        record,
        setActive(id) { flushSync(() => setActive(id)); },
        active: () => document.querySelector('[data-jg-game-menu-item][data-active]')?.getAttribute('data-jg-game-menu-item') ?? null,
      };
      const detail = (id) => {
        if (id === 'continue') return <ContinuePane slot={model.mostRecent()} now={() => now} onContinue={(slot) => record.continued.push(slot.id)} />;
        if (id === 'new') return <div data-character-pane="">name: {name}</div>;
        if (id === 'load') return <SaveSlotsPane model={model} now={() => now} onContinue={(slot) => record.continued.push(slot.id)} onLoad={(slot) => record.loaded.push(slot.id)} onNew={(slot) => record.chosen.push(slot.id)} onDelete={(slot) => record.deleted.push(slot.id)} />;
        return <div data-other-pane={id} style={{ height: 2000 }}>tall pane</div>;
      };
      return (
        <GameMenu
          items={[
            { id: 'continue', label: 'Continue' },
            { id: 'new', label: 'New defense' },
            { id: 'load', label: 'Load & save' },
            { id: 'settings', label: 'Settings' },
            { id: 'credits', label: 'Credits' },
          ]}
          logo={{ text: 'Beacon Bastion' }}
          eyebrow="Fixture"
          detail={detail}
          sound={false}
          onHighlight={(id) => { if (id !== null) setActive(id); }}
          onSelect={(id) => record.chosen.push(id)}
          onBack={() => record.chosen.push('back')}
        />
      );
    }

    root.render(<Fixture/>);
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
  page = await browser.newPage({ viewport: VIEWPORTS[0]! });
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
    record: { chosen: string[]; continued: string[]; loaded: string[]; deleted: string[] };
    setActive(id: string): void;
    active(): string | null;
  };
}

async function showSlotGrid(): Promise<void> {
  await page.click("[data-jg-game-menu-item='load']");
  await page.waitForSelector("[data-save-slots-grid]");
}

describe("GameMenu surface", () => {
  test("the document never scrolls at any viewport size", async () => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      const measured = await page.evaluate(() => {
        const root = document.querySelector("[data-jg-game-menu]") as HTMLElement;
        const rect = root.getBoundingClientRect();
        return {
          documentScrollX: document.documentElement.scrollWidth - window.innerWidth,
          documentScrollY: document.documentElement.scrollHeight - window.innerHeight,
          bodyScrollY: document.body.scrollHeight - window.innerHeight,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          position: getComputedStyle(root).position,
          overflow: getComputedStyle(root).overflow,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          documentOverflow: getComputedStyle(document.documentElement).overflow,
        };
      });
      expect({ viewport, x: measured.documentScrollX }).toEqual({ viewport, x: 0 });
      expect({ viewport, y: measured.documentScrollY }).toEqual({ viewport, y: 0 });
      expect(measured.bodyScrollY).toBeLessThanOrEqual(0);
      expect(measured.position).toBe("fixed");
      expect(measured.overflow).toBe("hidden");
      expect(measured.documentOverflow).toBe("hidden");
      expect(measured.width).toBe(measured.innerWidth);
      expect(measured.height).toBe(measured.innerHeight);
    }
    await page.setViewportSize(VIEWPORTS[0]!);
  });

  test("the title treatment is sized by the logo token, not a heading tag", async () => {
    const logo = await page.evaluate(() => {
      const node = document.querySelector("[data-jg-game-menu-logo]") as HTMLElement;
      return { tag: node.tagName, text: node.textContent, size: getComputedStyle(node).fontSize };
    });
    expect(logo.tag).not.toBe("H1");
    expect(logo.tag).not.toBe("H2");
    expect(logo.text).toContain("Beacon Bastion");
    expect(Number.parseFloat(logo.size)).toBeGreaterThan(24);
  });

  test("the highlighted verb drives the detail pane", async () => {
    await page.click("[data-jg-game-menu-item='continue']");
    await page.waitForSelector("[data-continue-pane]");
    expect(await page.getAttribute("[data-jg-game-menu-detail]", "data-detail-id")).toBe("continue");
    await page.click("[data-jg-game-menu-item='credits']");
    await page.waitForSelector("[data-other-pane='credits']");
    expect(await page.getAttribute("[data-jg-game-menu-detail]", "data-detail-id")).toBe("credits");
  });

  test("a slot card renders its character, playtime, progress, timestamp and thumbnail", async () => {
    await showSlotGrid();
    const card = await page.evaluate(() => {
      const node = document.querySelector("[data-save-slot-id='slot-2']") as HTMLElement;
      return {
        name: node.querySelector("[data-save-slot-name]")?.textContent ?? "",
        character: node.querySelector("[data-save-slot-character]")?.textContent ?? "",
        playtime: node.querySelector("[data-save-slot-playtime]")?.textContent ?? "",
        chip: node.querySelector("[data-save-slot-chip='level']")?.textContent ?? "",
        savedAt: node.querySelector("[data-save-slot-saved-at]")?.textContent ?? "",
        thumb: (node.querySelector("[data-save-slot-thumb-img]") as HTMLImageElement | null)?.src.slice(0, 20) ?? "",
        recent: node.getAttribute("data-recent"),
      };
    });
    expect(card.name).toBe("Mara Vell");
    expect(card.character).toBe("Mara Vell");
    expect(card.playtime).toContain("4h 12m");
    expect(card.chip).toBe("level 9");
    expect(card.savedAt).toBe("1m ago");
    expect(card.thumb.startsWith("data:image/")).toBe(true);
    expect(card.recent).toBe("");
  });

  test("an empty slot looks like an empty slot", async () => {
    const empty = await page.evaluate(() => {
      const node = document.querySelector("[data-save-slot-id='slot-3']") as HTMLElement;
      return { empty: node.hasAttribute("data-empty"), label: node.textContent ?? "" };
    });
    expect(empty.empty).toBe(true);
    expect(empty.label).toContain("New game");
  });

  test("Continue resumes the newest slot", async () => {
    await page.click("[data-save-slots-continue]");
    const continued = await page.evaluate(() => (window as unknown as FixtureWindow).fixture.record.continued);
    expect(continued.at(-1)).toBe("slot-2");
  });

  test("delete asks before it deletes", async () => {
    await page.click("[data-save-slot-id='slot-1'] [data-save-slot-delete]");
    expect(await page.$("[data-save-slot-id='slot-1'] [data-save-slot-confirm-delete]")).not.toBeNull();
    expect(await page.evaluate(() => (window as unknown as FixtureWindow).fixture.record.deleted)).toEqual([]);
    await page.click("[data-save-slot-id='slot-1'] [data-save-slot-cancel-delete]");
    expect(await page.evaluate(() => (window as unknown as FixtureWindow).fixture.record.deleted)).toEqual([]);
    await page.click("[data-save-slot-id='slot-1'] [data-save-slot-delete]");
    await page.click("[data-save-slot-id='slot-1'] [data-save-slot-confirm-delete]");
    expect(await page.evaluate(() => (window as unknown as FixtureWindow).fixture.record.deleted)).toEqual(["slot-1"]);
  });

  test("the keyboard reaches every verb and confirms it", async () => {
    await page.click("[data-jg-game-menu-item='continue']");
    await page.focus("[data-jg-game-menu-item][data-active]");
    const seen: (string | null)[] = [await page.evaluate(() => (window as unknown as FixtureWindow).fixture.active())];
    for (let step = 0; step < 5; step += 1) {
      await page.keyboard.press("ArrowDown");
      seen.push(await page.evaluate(() => (window as unknown as FixtureWindow).fixture.active()));
    }
    expect(new Set(seen)).toEqual(new Set(["continue", "new", "load", "settings", "credits"]));
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    const chosen = await page.evaluate(() => (window as unknown as FixtureWindow).fixture.record.chosen);
    expect(chosen.at(-1)).toBe("credits");
  });
});




