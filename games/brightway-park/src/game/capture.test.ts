import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { game } from "../game.config";
import { content } from "./content";
import { guestCap } from "./catalog";
import { session } from "./session";
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
  const runner = createHeadlessRunner({ definition: game.game, content, loop: game.game.loop, maxStepSeconds: 1 });
  runner.ui.invoke("park.start");
  return runner;
}

function phases(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const guest of session.guests.values()) counts[guest.phase] = (counts[guest.phase] ?? 0) + 1;
  return counts;
}

describe("staged full-park capture", () => {
  test("fills the turnstiles and puts guests in a line", () => {
    const runner = boot();
    stagePark(runner.ctx, "full");
    const w = park.of(runner.ctx);
    expect(w.fact("park.open")).toBe(true);
    expect(session.guests.size).toBeGreaterThanOrEqual(guestCap(w.num("park.rating")));
    const counted = phases();
    expect(counted.queued ?? 0).toBeGreaterThan(0);
  }, 30_000);

  test("reproduces from a fresh boot", () => {
    const first = boot();
    stagePark(first.ctx, "full");
    const guests = [...session.guests.values()]
      .map((guest) => `${guest.id}:${guest.kind}:${guest.phase}`)
      .sort()
      .join("|");
    const fingerprint = `${session.guests.size}/${phases().queued ?? 0}/${guests}`;

    const second = boot();
    stagePark(second.ctx, "full");
    expect(`${session.guests.size}/${phases().queued ?? 0}/${[...session.guests.values()]
      .map((guest) => `${guest.id}:${guest.kind}:${guest.phase}`)
      .sort()
      .join("|")}`).toBe(fingerprint);
  }, 30_000);
});
