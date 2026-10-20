import { describe, expect, test } from "bun:test";

import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { applyTimeScale, playerPoseReport, waitForEditorHost } from "./agentBridge";

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
