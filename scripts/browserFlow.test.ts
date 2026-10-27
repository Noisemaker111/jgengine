import { describe, expect, test } from "bun:test";

import type { ProbeReadings } from "../packages/core/src/game/playableGame";
import { FLOW_AIM_TOLERANCE_PX } from "../packages/core/src/play/flow";
import { createFlowStepper, describeFlowReport, runFlowReport } from "../packages/core/src/play/flowSteps";
import { createBrowserFlow, type BrowserFlowDriver } from "./browserFlow";

/** A page with fixed answers: `page` maps an expression's body to its value (or a thrower). */
function fakeDriver(options: { probe?: ProbeReadings; page?: Record<string, unknown | (() => never)> } = {}) {
  const calls: string[] = [];
  let clock = 0;
  const evaluate = async (expression: string): Promise<unknown> => {
    for (const [body, value] of Object.entries(options.page ?? {})) {
      if (!expression.includes(body)) continue;
      if (typeof value === "function") return value();
      return value;
    }
    return undefined;
  };
  const driver: BrowserFlowDriver = {
    async hold(chord) {
      calls.push(`hold ${chord}`);
    },
    async click(text) {
      calls.push(`click ${text}`);
    },
    async clickAt(x, y) {
      calls.push(`clickAt ${x},${y}`);
    },
    async moveMouse(x, y) {
      calls.push(`moveMouse ${x},${y}`);
    },
    async look(dx, dy) {
      calls.push(`look ${dx},${dy}`);
      return { x: dx, y: dy };
    },
    async aimAt(expression, tolerancePx) {
      calls.push(`aimAt ${expression} ${tolerancePx}`);
      return { point: { x: 800, y: 450 }, moves: 3 };
    },
    async fill(label) {
      calls.push(`fill ${label}`);
    },
    evaluate,
    async bridge() {
      return { ok: true };
    },
    async readProbe() {
      return options.probe ?? null;
    },
    async reload() {
      calls.push("reload");
    },
    async shot(name) {
      calls.push(`shot ${name}`);
    },
    async sleep(ms) {
      clock += ms;
    },
    now: () => clock,
  };
  return { driver, calls };
}

function browserFlow(driver: BrowserFlowDriver) {
  const stepper = createFlowStepper(() => driver.readProbe());
  const reports: { label: string; probe: unknown }[] = [];
  return { flow: createBrowserFlow(driver, stepper, reports), stepper, reports };
}

describe("browser flow checks", () => {
  test("a failing expect stops the run: later steps never execute", async () => {
    const { driver, calls } = fakeDriver({ probe: { started: 0 } });
    const { flow, stepper, reports } = browserFlow(driver);
    const report = await runFlowReport(stepper, reports, async () => {
      await flow.click("Free skirmish");
      await flow.expect((probe) => probe["started"] === 1, "the skirmish started");
      await flow.shot("after");
    });
    expect(report.ok).toBe(false);
    expect(calls).toEqual(["click Free skirmish"]);
    const lines = describeFlowReport("proof", report);
    expect(lines[0]).toBe("proof: FAILED at step 2 (expect the skirmish started)");
    expect(lines).toContain('  probe: {"started":0}');
  });

  test("a page condition that never comes true fails at that step, before the next one", async () => {
    const { driver, calls } = fakeDriver({ page: { "hud.ready": false } });
    const { flow, stepper, reports } = browserFlow(driver);
    const report = await runFlowReport(stepper, reports, async () => {
      await flow.waitForPage("hud.ready", { timeoutMs: 500 });
      await flow.shot("after");
    });
    expect(calls).toEqual([]);
    expect(report.ok ? "" : report.failure.message).toBe("hud.ready: not true after 500 ms (last value false)");
  });

  test("expectPage passes on the expected value and fails with the actual one otherwise", async () => {
    const four = browserFlow(fakeDriver({ page: { "skirmish.units.length": 4 } }).driver).flow;
    expect(await four.expectPage("skirmish.units.length", "four units", 4)).toBe(4);
    const three = browserFlow(fakeDriver({ page: { "skirmish.units.length": 3 } }).driver).flow;
    await expect(three.expectPage("skirmish.units.length", "four units", 4)).rejects.toThrow("expected four units: skirmish.units.length is 3, wanted 4");
  });

  test("an expression that throws fails the step with the page's error", async () => {
    const thrower = (): never => {
      throw new Error("ReferenceError: skirmish is not defined");
    };
    const { flow } = browserFlow(fakeDriver({ page: { "skirmish.units.length": thrower } }).driver);
    await expect(flow.expectPage("skirmish.units.length", "four units", 4)).rejects.toThrow("ReferenceError: skirmish is not defined");
  });

  test("a value matches strictly, so a truthy value is not a pass for true", async () => {
    const two = browserFlow(fakeDriver({ page: { "menu.buttons.length": 2 } }).driver).flow;
    await expect(two.expectPage("menu.buttons.length", "menu shown", true)).rejects.toThrow("is 2, wanted true");
    const yes = browserFlow(fakeDriver({ page: { "menu.open": true } }).driver).flow;
    expect(await yes.expectPage("menu.open", "menu shown", true)).toBe(true);
    const list = browserFlow(fakeDriver({ page: { "menu.items": ["a", "b"] } }).driver).flow;
    await expect(list.expectPage("menu.items", "menu items", ["a", "c"])).rejects.toThrow('is ["a","b"], wanted ["a","c"]');
  });
});

describe("browser flow pointer steps", () => {
  test("moveMouse, look and aimAt reach the driver, with the default aim tolerance", async () => {
    const { driver, calls } = fakeDriver();
    const { flow, stepper } = browserFlow(driver);
    await flow.moveMouse(240, 180);
    expect(await flow.look(300, -20)).toEqual({ x: 300, y: -20 });
    expect(await flow.aimAt("crosshair.target()")).toEqual({ x: 800, y: 450 });
    await flow.aimAt("crosshair.target()", { tolerancePx: 2 });
    expect(calls).toEqual(["moveMouse 240,180", "look 300,-20", `aimAt crosshair.target() ${FLOW_AIM_TOLERANCE_PX}`, "aimAt crosshair.target() 2"]);
    expect(stepper.records.map((step) => step.label)).toEqual(["move mouse 240,180", "look 300,-20 px", "aim at crosshair.target()", "aim at crosshair.target()"]);
  });
});
