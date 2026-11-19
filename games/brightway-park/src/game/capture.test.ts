import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { game } from "../game.config";
import { guestCap } from "./catalog";
import { sessionOf } from "./session";
import { stagePark } from "./capture";
import { park } from "./park";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let records: Map<string, string>;

beforeEach(() => {
  records = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => records.set(key, value),
      removeItem: (key: string) => records.delete(key),
    },
  });
});

afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

function boot(): HeadlessRunner {
  // A fresh boot has no park save to restore; a replayed state must not depend on the last run's.
  records.clear();
  const runner = createHeadlessRunner({ game, maxStepSeconds: 1 });
  runner.ui.invoke("park.start");
  return runner;
}

function phases(ctx: GameContext): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const guest of sessionOf(ctx).guests.values()) counts[guest.phase] = (counts[guest.phase] ?? 0) + 1;
  return counts;
}

describe("staged full-park capture", () => {
  test("fills the turnstiles and puts guests in a line", () => {
    const runner = boot();
    stagePark(runner.ctx, "full");
    const w = park.of(runner.ctx);
    expect(w.fact("park.open")).toBe(true);
    // The seeded crowd is the cap a new park's rating allows, still inside.
    expect(sessionOf(runner.ctx).guests.size).toBeGreaterThanOrEqual(guestCap(0));
    const counted = phases(runner.ctx);
    expect(counted.queued ?? 0).toBeGreaterThan(0);
  }, 30_000);

  test("reproduces from a fresh boot", () => {
    const first = boot();
    stagePark(first.ctx, "full");
    const guests = [...sessionOf(first.ctx).guests.values()]
      .map((guest) => `${guest.id}:${guest.kind}:${guest.phase}`)
      .sort()
      .join("|");
    const fingerprint = `${sessionOf(first.ctx).guests.size}/${phases(first.ctx).queued ?? 0}/${guests}`;

    const second = boot();
    stagePark(second.ctx, "full");
    expect(`${sessionOf(second.ctx).guests.size}/${phases(second.ctx).queued ?? 0}/${[...sessionOf(second.ctx).guests.values()]
      .map((guest) => `${guest.id}:${guest.kind}:${guest.phase}`)
      .sort()
      .join("|")}`).toBe(fingerprint);
  }, 30_000);
});
