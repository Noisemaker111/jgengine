import { describe, expect, test } from "bun:test";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { canvasCover } from "@jgengine/core/ui/canvasCover.view";
import { createSettingsStore } from "@jgengine/core/settings/settingsModel";
import { withRendererBackendOverride } from "@jgengine/core/settings/rendererBackend";

import { setPlayControlsActive, suspendPlayControls } from "@jgengine/core/game/controlGate";
import { advanceSimulation, registerSimStepper } from "@jgengine/core/sim/simStepper";

import { applySetting, applyTimeScale, CAPTURE_COMMAND_INPUT, installAgentBridge, playerPoseReport, simAdvanceReport, waitForEditorHost } from "./agentBridge.draw";

/** Put `window` back exactly: absent stays absent, never an own key holding undefined (#3194). */
function restoreWindow(previous: PropertyDescriptor | undefined): void {
  if (previous === undefined) Reflect.deleteProperty(globalThis, "window");
  else Object.defineProperty(globalThis, "window", previous);
}

describe("waitForEditorHost", () => {
  test("resolves true as soon as the host goes live", async () => {
    let polls = 0;
    const live = await waitForEditorHost(() => ++polls >= 3, 1000, 10, async () => {});
    expect(live).toBe(true);
    expect(polls).toBe(3);
  });

  test("resolves false after the timeout", async () => {
    let slept = 0;
    const live = await waitForEditorHost(() => false, 50, 10, async (ms) => {
      slept += ms;
    });
    expect(live).toBe(false);
    expect(slept).toBe(50);
  });
});

describe("playerPoseReport", () => {
  const ctxWith = (entity: unknown) =>
    ({ player: { userId: "p1" }, scene: { entity: { get: (id: string) => (id === "p1" ? entity : null) } } }) as unknown as GameContext;

  test("reports the local player's rounded position and heading", () => {
    expect(playerPoseReport(ctxWith({ position: [1.23456, 0, -7.0001], rotationY: 1.5 }))).toEqual({
      userId: "p1",
      position: [1.235, 0, -7],
      rotationY: 1.5,
    });
  });

  test("is null before the context or the player entity exists", () => {
    expect(playerPoseReport(null)).toBeNull();
    expect(playerPoseReport(ctxWith(null))).toBeNull();
  });
});

describe("canvas_cover", () => {
  test("holds while on and lifts on off or dispose, so a drive can measure a covered frame", () => {
    const globals = globalThis as typeof globalThis & { window?: unknown };
    const previousWindow = Object.getOwnPropertyDescriptor(globals, "window");
    globals.window = {};
    try {
      const dispose = installAgentBridge({
        playable: { game: { name: "Cover" } } as never,
        devtoolsEnabled: true,
        isDevtoolsOpen: () => false,
        setDevtoolsOpen: () => {},
      });
      const agent = (globals.window as { __jgengineAgent: { handle(request: { method: string; covered?: boolean }): unknown } }).__jgengineAgent;
      expect(agent.handle({ method: "canvas_cover", covered: true })).toEqual({ ok: true, covered: true, holders: 1 });
      expect(canvasCover.covered()).toBe(true);
      expect(agent.handle({ method: "canvas_cover", covered: true }), "a repeated on is one hold").toEqual({ ok: true, covered: true, holders: 1 });
      expect(agent.handle({ method: "canvas_cover", covered: false })).toEqual({ ok: true, covered: false, holders: 0 });
      expect(canvasCover.covered()).toBe(false);
      agent.handle({ method: "canvas_cover", covered: true });
      dispose();
      expect(canvasCover.covered(), "disposing the shell must lift its cover").toBe(false);
    } finally {
      restoreWindow(previousWindow);
    }
  });
});

describe("capture_run", () => {
  test("runs the game's capture.play or a named state in order, so a shipped build reaches the measured scene", () => {
    const globals = globalThis as typeof globalThis & { window?: unknown };
    const previousWindow = Object.getOwnPropertyDescriptor(globals, "window");
    globals.window = {};
    const calls: [string, unknown][] = [];
    const ctx = {
      game: {
        commands: {
          has: (name: string) => name !== "missing",
          run: (name: string, input: unknown) => {
            calls.push([name, input]);
            return name === "locked" ? { status: "rejected", reason: "not yet" } : { status: "ok" };
          },
        },
      },
    } as unknown as GameContext;
    let live: GameContext | null = null;
    try {
      const dispose = installAgentBridge({
        playable: {
          game: { name: "Park" },
          capture: { play: [{ name: "park.scenario", input: { id: "first" } }, "park.start"], states: { paused: ["park.start", "locked"], broken: ["missing"] } },
        } as never,
        devtoolsEnabled: false,
        isDevtoolsOpen: () => false,
        setDevtoolsOpen: () => {},
        getContext: () => live,
      });
      const agent = (globals.window as { __jgengineAgent: { handle(request: { method: string; state?: string; skipUnregistered?: boolean }): unknown } }).__jgengineAgent;
      expect(agent.handle({ method: "capture_run" })).toEqual({ ok: false, error: "no game context yet" });
      live = ctx;
      expect(agent.handle({ method: "capture_run" })).toEqual({ ok: true, ran: [{ name: "park.scenario", status: "ok" }, { name: "park.start", status: "ok" }] });
      expect(calls).toEqual([["park.scenario", { id: "first" }], ["park.start", CAPTURE_COMMAND_INPUT]]);
      expect(agent.handle({ method: "capture_run", state: "paused" })).toEqual({ ok: true, ran: [{ name: "park.start", status: "ok" }, { name: "locked", status: "rejected", reason: "not yet" }] });
      expect(agent.handle({ method: "capture_run", state: "nope" })).toEqual({ ok: false, error: 'unknown capture state "nope"; declared: broken, paused' });
      expect(agent.handle({ method: "capture_run", state: "broken" })).toEqual({ ok: false, error: 'capture command "missing" is not registered (ran 0 before it)' });
      expect(agent.handle({ method: "capture_run", state: "broken", skipUnregistered: true }), "a dev-only helper is skipped and named").toEqual({ ok: true, ran: [{ name: "missing", status: "unregistered" }] });
      dispose();
    } finally {
      restoreWindow(previousWindow);
    }
  });
});

describe("simAdvanceReport", () => {
  const gameCtx = () => {
    const store = new Map<string, unknown>();
    return {
      game: { store: { set: (key: string, value: unknown) => store.set(key, value), get: (key: string) => store.get(key) } },
      time: { now: () => 4.5 },
    } as unknown as GameContext;
  };

  test("answers ok with the frames run when every frame advanced", () => {
    expect(simAdvanceReport(gameCtx(), { frames: 1200, gated: false })).toEqual({ ok: true, frames: 1200, now: 4.5 });
  });

  test("is not ok while play is gated, names the gate and counts no gated frame as advanced", async () => {
    const ctx = gameCtx();
    const release = suspendPlayControls(ctx);
    // The driver's step advances nothing and says so while play is gated, as FrameDriver's simulate does.
    const unregister = registerSimStepper(() => false);
    const report = simAdvanceReport(ctx, await advanceSimulation(60, 0.05, async () => {}));
    unregister();
    release();
    expect(report).toEqual({ ok: false, error: "play is gated: suspension; advanced 0 frames before the gate", gated: ["suspension"], frames: 0, now: 4.5 });
  });

  test("names a menu and play controls switched off", () => {
    const ctx = gameCtx();
    setPlayControlsActive(ctx, false);
    const report = simAdvanceReport(ctx, { frames: 7, gated: true });
    expect(report.ok).toBe(false);
    expect(report.error).toBe("play is gated: play controls off, menu; advanced 7 frames before the gate");
    expect(report.frames).toBe(7);
  });

  test("names the shell's own gate when no game context holds play, and reports a missing driver", () => {
    expect(simAdvanceReport(gameCtx(), { frames: 0, gated: true }).error).toBe("play is gated: the shell's gate (e.g. the rotate-device prompt); advanced 0 frames before the gate");
    expect(simAdvanceReport(gameCtx(), null)).toEqual({ ok: false, error: "no sim driver mounted" });
  });
});

describe("applyTimeScale", () => {
  const clock = () => {
    let scale = 1;
    return { time: { setTimescale: (value: number) => { scale = value; }, timescale: () => scale, now: () => 12.34567 } } as unknown as Pick<GameContext, "time">;
  };

  test("sets and reports the timescale with the current game time", () => {
    const ctx = clock();
    expect(applyTimeScale(ctx, 20)).toEqual({ ok: true, timescale: 20, now: 12.346 });
    expect(applyTimeScale(ctx, undefined)).toEqual({ ok: true, timescale: 20, now: 12.346 });
  });

  test("rejects non-numeric, negative or extreme scales without touching the clock", () => {
    const ctx = clock();
    for (const bad of ["2", -1, Number.NaN, 500]) expect(applyTimeScale(ctx, bad).ok).toBe(false);
    expect(ctx.time.timescale()).toBe(1);
  });
});

describe("applySetting", () => {
  test("setting_set switches the pinned renderer on a live page and setting_get reads it back", () => {
    const store = withRendererBackendOverride(createSettingsStore(null), "webgl");
    expect(applySetting(store, { method: "setting_get", id: "graphics.renderer" }, false)).toEqual({ ok: true, id: "graphics.renderer", value: "webgl" });
    expect(applySetting(store, { method: "setting_set", id: "graphics.renderer", value: "webgpu" }, true)).toEqual({ ok: true, id: "graphics.renderer", value: "webgpu" });
  });

  test("refuses a missing id or value, and a page without settings", () => {
    const store = createSettingsStore(null);
    expect(applySetting(store, { method: "setting_set", value: "x" }, true).ok).toBe(false);
    expect(applySetting(store, { method: "setting_set", id: "graphics.renderer", value: { nested: true } }, true).ok).toBe(false);
    expect(applySetting(undefined, { method: "setting_get", id: "graphics.renderer" }, false).ok).toBe(false);
  });
});
