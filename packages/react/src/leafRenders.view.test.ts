import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";

/*
 * Jon's rule for every HUD (AGENTS.md): a changing value updates only its own leaf, never the whole
 * component, and per-frame values never go through React state. This mounts a HUD the way games
 * build one, in a real browser, and counts renders while the store ticks: the panel, its sibling and
 * the live readout's own component must not re-render for a per-tick value; a discrete change
 * re-renders only the component that shows it.
 */

setDefaultTimeout(30_000);

const scratch = resolve(import.meta.dir, "../../../.scratch/leaf-renders-test");
let browser: Browser;
let page: Page;
let server: ReturnType<typeof Bun.serve>;

interface Counts { panel: number; air: number; sibling: number; hint: number; airText: string; hintText: string }

beforeAll(async () => {
  // A run killed mid-test (a timeout) leaves its links here; the next run must not fail on EEXIST.
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });
  await symlink(resolve(import.meta.dir, "../node_modules"), `${scratch}/node_modules`, "dir");
  const entry = `${scratch}/fixture.tsx`;
  await Bun.write(entry, `
    import React from '@jgengine/core/ui/jsx';
    import { createRoot } from '@jgengine/core/ui/jsx/client.view';
    import { flushSync } from '@jgengine/core/ui/jsx/client.view';
    import { createAssetCatalog } from '../../packages/core/src/scene/assetCatalog';
    import { defineGameDefinition } from '../../packages/core/src/game/defineGame';
    import { createGameContext } from '../../packages/core/src/runtime/gameContext';
    import { defineStore } from '../../packages/core/src/store/defineStore';
    import { LiveText, flushFrameBinds } from '../../packages/core/src/ui/liveBind.view';
    import { GameProvider, useGameContext } from '../../packages/react/src/provider';
    import { useStore } from '../../packages/react/src/store';

    const hud = defineStore('leaf.hud', () => ({ air: 100, mode: 'dive', hint: 'Go', elapsed: 0 }));
    const counts = { panel: 0, air: 0, sibling: 0, hint: 0 };
    const ctx = createGameContext({
      definition: defineGameDefinition({ name: 'Leaf renders', assets: createAssetCatalog(), multiplayer: 'off', persist: false }),
      content: {},
      player: { userId: 'player', isNew: true },
    });

    function AirReadout() {
      counts.air += 1;
      const game = useGameContext();
      return <LiveText as="b" id="air" get={() => hud.read(game).air} format={(air) => String(Math.ceil(air))} />;
    }
    function Sibling() {
      counts.sibling += 1;
      return <kbd>Tab</kbd>;
    }
    function Hint() {
      counts.hint += 1;
      const hint = useStore(hud, (state) => state.hint);
      return <p id="hint">{hint}</p>;
    }
    function Panel() {
      counts.panel += 1;
      const { mode } = useStore(hud, (state) => ({ mode: state.mode }));
      return <section data-mode={mode}><AirReadout /><Sibling /><Hint /></section>;
    }

    class Catch extends React.Component {
      state = { error: null };
      static getDerivedStateFromError(error) { return { error }; }
      render() { return this.state.error ? <p id="caught">{this.state.error.name}: {this.state.error.message}</p> : this.props.children; }
    }
    /** The slow way: a whole number that changes every tick selected into React state. */
    function TickClock() {
      const elapsed = useStore(hud, (state) => state.elapsed);
      return <i id="tick-clock">{elapsed.toFixed(2)}</i>;
    }
    let showClock = () => {};
    function SlowCorner() {
      const [on, setOn] = React.useState(false);
      showClock = setOn;
      return on ? <Catch><TickClock /></Catch> : null;
    }

    createRoot(document.getElementById('root')).render(<GameProvider context={ctx}><Panel /><SlowCorner /></GameProvider>);

    const read = () => ({ ...counts, airText: document.getElementById('air')?.textContent ?? '', hintText: document.getElementById('hint')?.textContent ?? '' });
    window.fixture = {
      counts: read,
      /** One simulation tick per call: air drains and the clock runs, as a dive's tick writes them. */
      tick(times) {
        for (let i = 0; i < times; i += 1) {
          flushSync(() => hud.update(ctx, (state) => ({ ...state, air: state.air - 0.75, elapsed: state.elapsed + 1 / 60 })));
          flushFrameBinds();
        }
        return read();
      },
      /** Mount the slow clock and run simulation ticks that move it; returns what the error boundary caught. */
      slowWay(times) {
        flushSync(() => showClock(true));
        for (let i = 0; i < times; i += 1) {
          flushSync(() => ctx.sim.advance(1 / 60, () => hud.update(ctx, (state) => ({ ...state, elapsed: state.elapsed + 1 / 60 }))));
        }
        return document.getElementById('caught')?.textContent ?? '';
      },
      hint(text) {
        flushSync(() => hud.update(ctx, (state) => ({ ...state, hint: text })));
        flushFrameBinds();
        return read();
      },
    };
  `);
  const script = buildBrowserFixture(entry);
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => new URL(request.url).pathname === "/fixture.js"
    ? new Response(script, { headers: { "Content-Type": "text/javascript" } })
    : new Response('<div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }) });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.port}`, { timeout: 20_000 });
  try {
    await page.waitForFunction(() => document.getElementById("air") !== null, undefined, { timeout: 10_000 });
  } catch (cause) {
    throw new Error(`The HUD fixture did not mount: ${errors.join(" | ") || String(cause)}`);
  }
});

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  await rm(scratch, { recursive: true, force: true });
});

const counts = (): Promise<Counts> => page.evaluate(() => (window as unknown as { fixture: { counts(): Counts } }).fixture.counts());
const tick = (times: number): Promise<Counts> => page.evaluate(n => (window as unknown as { fixture: { tick(n: number): Counts } }).fixture.tick(n), times);
const slowWay = (times: number): Promise<string> => page.evaluate(n => (window as unknown as { fixture: { slowWay(n: number): string } }).fixture.slowWay(n), times);
const hint = (text: string): Promise<Counts> => page.evaluate(t => (window as unknown as { fixture: { hint(t: string): Counts } }).fixture.hint(t), text);

describe("a changing value updates only its own leaf", () => {
  test("sixty ticks of a draining meter re-render nothing, and the readout shows the last value", async () => {
    const before = await counts();
    const after = await tick(60);
    expect(after.airText).toBe("55");
    expect(after.panel - before.panel).toBe(0);
    expect(after.sibling - before.sibling).toBe(0);
    expect(after.air - before.air).toBe(0);
    expect(after.hint - before.hint).toBe(0);
  });

  test("a discrete change re-renders only the component that shows it", async () => {
    const before = await counts();
    const after = await hint("Turn back");
    expect(after.hintText).toBe("Turn back");
    expect(after.hint - before.hint).toBe(1);
    expect(after.panel - before.panel).toBe(0);
    expect(after.sibling - before.sibling).toBe(0);
    expect(after.air - before.air).toBe(0);
  });
});

describe("the slow way fails loudly", () => {
  test("a component that selects a value changing every tick throws PerFrameRenderError naming it", async () => {
    const caught = await slowWay(130);
    expect(caught).toStartWith("PerFrameRenderError: [jgengine] TickClock re-renders on nearly every tick");
    const after = await counts();
    expect(after.panel).toBe(1);
  });
});
