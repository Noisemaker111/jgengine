import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createElement } from "@jgengine/core/ui/jsx";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../../scripts/browser-lib";
import { live } from "./liveValue";
import { sameNode, samePartProps } from "./memoView.view";

/*
 * Engine UI parts skip their parent's re-renders: a game writes inline handlers and JSX children
 * around a KitButton in a component that re-renders every tick, and the button draws once. The
 * comparison must still redraw for anything the part would draw differently, including a record a
 * game mutates in place inside the children.
 */

setDefaultTimeout(30_000);

describe("samePartProps", () => {
  test("inline handlers, live values and equal children count as the same", () => {
    const previous = { onClick: () => 1, value: live(() => 1), children: createElement("b", { className: "x" }, "Buy"), style: { width: 4 } };
    const next = { onClick: () => 2, value: live(() => 2), children: createElement("b", { className: "x" }, "Buy"), style: { width: 4 } };
    expect(samePartProps(previous, next)).toBe(true);
  });

  test("a changed label, style or plain prop redraws", () => {
    expect(samePartProps({ children: "Buy" }, { children: "Sell" })).toBe(false);
    expect(samePartProps({ style: { width: 4 } }, { style: { width: 5 } })).toBe(false);
    expect(samePartProps({ tone: "good" }, { tone: "bad" })).toBe(false);
    expect(samePartProps({ steps: [{ id: "a", done: false }] }, { steps: [{ id: "a", done: false }] })).toBe(true);
    expect(samePartProps({ steps: [{ id: "a", done: false }] }, { steps: [{ id: "a", done: true }] })).toBe(false);
  });

  test("a function prop that is not a handler, like a render callback, redraws when it changes", () => {
    expect(samePartProps({ itemProps: () => ({}) }, { itemProps: () => ({}) })).toBe(false);
  });

  test("a record a game mutates in place inside the children is never taken as unchanged", () => {
    function Row(_props: { guests: Map<string, number> }) {
      return null;
    }
    const guests = new Map<string, number>();
    const element = () => createElement(Row, { guests });
    expect(sameNode(element(), element())).toBe(false);
    expect(sameNode(createElement("i", null, 3), createElement("i", null, 3))).toBe(true);
  });
});

const scratch = resolve(import.meta.dir, "../../../../.scratch/memo-view-test");
let browser: Browser;
let page: Page;
let server: ReturnType<typeof Bun.serve>;

interface Counts { button: number; meter: number; clicks: number[]; label: string; meterNow: string }

beforeAll(async () => {
  await mkdir(scratch, { recursive: true });
  await symlink(resolve(import.meta.dir, "../../node_modules"), `${scratch}/node_modules`, "dir");
  const entry = `${scratch}/fixture.tsx`;
  await Bun.write(entry, `
    import React, { useState } from '@jgengine/core/ui/jsx';
    import { createRoot } from '@jgengine/core/ui/jsx/client.view';
    import { flushSync } from '@jgengine/core/ui/jsx/client.view';
    import { KitButton, KitMeter, UiKitRoot } from '../../packages/core/src/ui/kit/uiKitRoot.view';
    import { plainKit } from '../../packages/core/src/ui/kit/uiKitPlain.view';
    import { flushFrameBinds } from '../../packages/core/src/ui/liveBind.view';
    import { live } from '../../packages/core/src/ui/liveValue';

    const counts = { button: 0, meter: 0, clicks: [] };
    const kit = { ...plainKit, components: { ...plainKit.components,
      Button: (props) => { counts.button += 1; return plainKit.components.Button(props); },
      Meter: (props) => { counts.meter += 1; return <i id="meter" data-value={props.value} />; },
    } };
    let fuel = 100;
    let setTick = () => {};
    let setLabel = () => {};

    function Hud() {
      const [tick, nextTick] = useState(0);
      const [label, nextLabel] = useState('Buy');
      setTick = nextTick;
      setLabel = nextLabel;
      return (
        <UiKitRoot kit={kit}>
          <KitButton id="buy" onClick={() => counts.clicks.push(tick)}><b className="label">{label}</b></KitButton>
          <KitMeter value={live(() => fuel)} max={100} />
        </UiKitRoot>
      );
    }
    createRoot(document.getElementById('root')).render(<Hud />);

    const read = () => ({ ...counts, clicks: [...counts.clicks], label: document.querySelector('#buy .label')?.textContent ?? '', meterNow: document.getElementById('meter')?.getAttribute('data-value') ?? '' });
    window.fixture = {
      counts: read,
      rerender(times) { for (let i = 1; i <= times; i += 1) flushSync(() => setTick((value) => value + 1)); return read(); },
      relabel(text) { flushSync(() => setLabel(text)); return read(); },
      click() { document.getElementById('buy').click(); return read(); },
      drain(step, frames) { for (let i = 0; i < frames; i += 1) { fuel -= step; flushSync(() => flushFrameBinds()); } return read(); },
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
    await page.waitForFunction(() => document.getElementById("buy") !== null, undefined, { timeout: 10_000 });
  } catch (cause) {
    throw new Error(`The kit fixture did not mount: ${errors.join(" | ") || String(cause)}`);
  }
});

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  await rm(scratch, { recursive: true, force: true });
});

type Fixture = { counts(): Counts; rerender(n: number): Counts; relabel(t: string): Counts; click(): Counts; drain(step: number, frames: number): Counts };
const fixture = <T>(run: (f: Fixture, arg: T) => Counts, arg: T): Promise<Counts> => page.evaluate(([source, value]) => new Function("f", "arg", `return (${source})(f, arg)`)((window as unknown as { fixture: Fixture }).fixture, value), [run.toString(), arg] as const);

describe("a kit part skips its parent's re-renders", () => {
  test("twenty parent renders with an inline handler and JSX children draw the button and meter zero more times", async () => {
    const before = await fixture((f) => f.counts(), null);
    const after = await fixture((f, n) => f.rerender(n), 20);
    expect(after.button - before.button).toBe(0);
    expect(after.meter - before.meter).toBe(0);
  });

  test("the skipped button still calls the newest handler", async () => {
    const after = await fixture((f) => f.click(), null);
    expect(after.clicks.at(-1)).toBe(20);
  });

  test("a changed label redraws the button once", async () => {
    const before = await fixture((f) => f.counts(), null);
    const after = await fixture((f, t) => f.relabel(t), "Sell");
    expect(after.label).toBe("Sell");
    expect(after.button - before.button).toBe(1);
  });

  test("a live meter redraws only when its drawn value moves, and shows the newest value", async () => {
    const before = await fixture((f) => f.counts(), null);
    const still = await fixture((f, frames) => f.drain(0.00001, frames), 30);
    expect(still.meter - before.meter).toBe(0);
    const moved = await fixture((f, frames) => f.drain(1, frames), 5);
    expect(moved.meter - still.meter).toBe(5);
    expect(Number(moved.meterNow)).toBeCloseTo(95, 0);
  });
});
