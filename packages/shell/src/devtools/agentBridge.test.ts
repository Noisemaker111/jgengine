import { describe, expect, test } from "bun:test";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { canvasCover } from "@jgengine/react/canvasCover";

import { applyTimeScale, installAgentBridge, playerPoseReport, waitForEditorHost } from "./agentBridge";

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
    const previousWindow = globals.window;
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
      globals.window = previousWindow;
    }
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
