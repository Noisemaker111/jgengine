import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../../scripts/browser-lib";

/*
 * HudFade skips its parent's re-renders and reads the newest `watch` the parent passed. A game writes
 * `watch={() => [hint]}` inline, so the fade must dim after a quiet spell, wake when the parent shows a
 * new hint (a new closure the memo comparison treats as unchanged), and dim again.
 */

setDefaultTimeout(30_000);
const scratch = resolve(import.meta.dir, "../../../../.scratch/hud-fade-test");
let browser: Browser, page: Page, server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });
  await symlink(resolve(import.meta.dir, "../../node_modules"), `${scratch}/node_modules`, "dir");
  await Bun.write(`${scratch}/fixture.tsx`, `
    import React, { useState } from '@jgengine/core/ui/jsx';
    import { createRoot } from '@jgengine/core/ui/jsx/client.view';
    import { flushSync } from '@jgengine/core/ui/jsx/client.view';
    import { HudFade } from '../../packages/core/src/hud/hudLayout.view';
    let say = () => {};
    function Comms() {
      const [hint, setHint] = useState('Walk to the garage');
      say = setHint;
      return <HudFade watch={() => [hint]} idleMs={150} dimTo={0.22}><p id="hint">{hint}</p></HudFade>;
    }
    createRoot(document.getElementById('root')).render(<Comms />);
    window.fixture = {
      state: () => document.querySelector('[data-jg-hud-fade]').dataset.jgHudFade,
      say(text) { flushSync(() => say(text)); },
    };
  `);
  const script = buildBrowserFixture(`${scratch}/fixture.tsx`);
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => new URL(request.url).pathname === "/fixture.js" ? new Response(script, { headers: { "Content-Type": "text/javascript" } }) : new Response('<div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }) });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}/`, { timeout: 20_000 });
  await page.waitForFunction(() => document.getElementById("hint") !== null, undefined, { timeout: 10_000 });
}, 60_000);
afterAll(async () => { await browser?.close(); server?.stop(true); await rm(scratch, { recursive: true, force: true }); });

type Fixture = { state(): string; say(text: string): void };
const state = (): Promise<string> => page.evaluate(() => (window as unknown as { fixture: Fixture }).fixture.state());
const say = (text: string): Promise<void> => page.evaluate(t => (window as unknown as { fixture: Fixture }).fixture.say(t), text);
const idle = (): Promise<unknown> => page.waitForFunction(() => document.querySelector<HTMLElement>("[data-jg-hud-fade]")?.dataset["jgHudFade"] === "idle", undefined, { timeout: 5_000 });

test("an inline watch dims after the quiet spell, wakes on a new hint from the parent, and dims again", async () => {
  await idle();
  await say("Take the rail to Bellwether");
  expect(await state()).toBe("awake");
  await idle();
  expect(await state()).toBe("idle");
});
