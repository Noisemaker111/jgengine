import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../../scripts/browser-lib";

/*
 * A HUD panel whose text grows (a score gaining a digit, a longer objective) is measured again and the
 * canvas re-solves the layout. Every panel used to re-render on that, because each read the whole
 * placement table and the viewport's region list from context; now a panel redraws only when its own
 * place changes.
 */

setDefaultTimeout(30_000);
const root = resolve(import.meta.dir, "../../../..");
const scratch = `${root}/.scratch/hud-panel-renders-test`;
let browser: Browser, page: Page, server: ReturnType<typeof Bun.serve>;

interface Read { panels: number; width: number }

beforeAll(async () => {
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });
  await symlink(resolve(import.meta.dir, "../../node_modules"), `${scratch}/node_modules`, "dir");
  await Bun.write(`${scratch}/counter.ts`, `
    import { installRenderCounter } from '../../packages/core/src/devtools/renderCounter';
    installRenderCounter(globalThis);
  `);
  await Bun.write(`${scratch}/fixture.tsx`, `
    import './counter';
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { HudCanvas, HudPanel, useHudLayout } from '../../packages/core/src/hud/hudLayout.view';
    import { GameViewportProvider } from '../../packages/core/src/ui/viewport.view';

    const box = (w, h) => <div style={{ width: w, height: h, background: '#345' }} />;
    let grow = () => {};
    function Score() {
      const [width, setWidth] = useState(120);
      grow = setWidth;
      return <div id="score" style={{ width, height: 40, background: '#a53' }} />;
    }
    function Fixture() {
      const layout = useHudLayout();
      return <GameViewportProvider><HudCanvas layout={layout} editChord={false}>
        <HudPanel id="score" anchor="top-left"><Score /></HudPanel>
        <HudPanel id="map" anchor="top-right">{box(160, 160)}</HudPanel>
        <HudPanel id="vitals" anchor="bottom-left">{box(170, 80)}</HudPanel>
        <HudPanel id="bar" anchor="bottom">{box(300, 60)}</HudPanel>
        <HudPanel id="log" anchor="bottom-right">{box(190, 70)}</HudPanel>
      </HudCanvas></GameViewportProvider>;
    }
    createRoot(document.getElementById('root')).render(<Fixture />);
    const panelRenders = () => globalThis.__jgRenders.read().components.find((entry) => entry.name === 'HudPanel')?.renders ?? 0;
    window.fixture = {
      reset() { globalThis.__jgRenders.reset(); },
      grow(width) { flushSync(() => grow(width)); },
      read() { return { panels: panelRenders(), width: document.querySelector('[data-hud-panel="score"]').getBoundingClientRect().width }; },
    };
  `);
  const script = buildBrowserFixture(`${scratch}/fixture.tsx`);
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => new URL(request.url).pathname === "/fixture.js" ? new Response(script, { headers: { "Content-Type": "text/javascript" } }) : new Response('<style>body{margin:0}#root{position:fixed;inset:0}</style><div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }) });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.port}/`, { timeout: 20_000 });
  try {
    await page.waitForFunction(() => document.querySelector('[data-hud-panel="log"]')?.getAttribute("style")?.includes("visibility") === false, undefined, { timeout: 10_000 });
  } catch (cause) {
    throw new Error(`The HUD fixture did not mount: ${errors.join(" | ") || String(cause)}`);
  }
}, 60_000);
afterAll(async () => { await browser?.close(); server?.stop(true); await rm(scratch, { recursive: true, force: true }); });

const settle = (frames = 6): Promise<void> => page.evaluate((count) => new Promise<void>(done => {
  const step = (left: number) => (left === 0 ? done() : requestAnimationFrame(() => step(left - 1)));
  step(count);
}), frames);
type Fixture = { reset(): void; grow(width: number): void; read(): Read };
const call = <T>(run: (f: Fixture, arg: number) => T, arg = 0): Promise<T> => page.evaluate(([source, value]) => new Function("f", "arg", `return (${source})(f, arg)`)((window as unknown as { fixture: Fixture }).fixture, value), [run.toString(), arg] as const);

test("a panel whose content grows redraws itself, and the four panels it does not push stay as they are", async () => {
  await settle();
  await call((f) => f.reset());
  await call((f, width) => f.grow(width), 260);
  await settle();
  const after = await call((f) => f.read());
  expect(after.width).toBeGreaterThan(250);
  expect(after.panels).toBe(1);
});
