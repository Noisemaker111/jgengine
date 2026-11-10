import { describe, expect, test } from "bun:test";

import { createAbilityKit } from "@jgengine/core/combat/abilityKit";
import { createEventMeter } from "@jgengine/core/stats/eventMeter";

import {
  abilityKitNeedsHeartbeat,
  createHeldKeyTracker,
  eventMeterNeedsHeartbeat,
  type EventMeterView,
} from "./hooks";

function fakeWindow() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners.get(type)?.delete(listener);
    },
    dispatch: (type: string, event: unknown) => {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

describe("createHeldKeyTracker", () => {
  test("tracks a key as down between keydown and keyup", () => {
    const target = fakeWindow();
    const tracker = createHeldKeyTracker(target as unknown as Window);
    expect(tracker.isDown("KeyW")).toBe(false);
    target.dispatch("keydown", { code: "KeyW" });
    expect(tracker.isDown("KeyW")).toBe(true);
    target.dispatch("keyup", { code: "KeyW" });
    expect(tracker.isDown("KeyW")).toBe(false);
  });

  test("clears all held keys on blur", () => {
    const target = fakeWindow();
    const tracker = createHeldKeyTracker(target as unknown as Window);
    target.dispatch("keydown", { code: "KeyW" });
    target.dispatch("keydown", { code: "KeyA" });
    target.dispatch("blur", {});
    expect(tracker.isDown("KeyW")).toBe(false);
    expect(tracker.isDown("KeyA")).toBe(false);
  });

  test("installs exactly one listener per event on construction", () => {
    const target = fakeWindow();
    createHeldKeyTracker(target as unknown as Window);
    expect(target.listenerCount("keydown")).toBe(1);
    expect(target.listenerCount("keyup")).toBe(1);
    expect(target.listenerCount("blur")).toBe(1);
  });

  test("dispose removes all listeners and stops tracking further events", () => {
    const target = fakeWindow();
    const tracker = createHeldKeyTracker(target as unknown as Window);
    tracker.dispose();
    expect(target.listenerCount("keydown")).toBe(0);
    expect(target.listenerCount("keyup")).toBe(0);
    expect(target.listenerCount("blur")).toBe(0);
    target.dispatch("keydown", { code: "KeyW" });
    expect(tracker.isDown("KeyW")).toBe(false);
  });
});

describe("ability/meter heartbeat idle bailout", () => {
  test("idle ready kit does not need heartbeat ticks", () => {
    const kit = createAbilityKit([{ id: "bolt", cooldownMs: 1000, flashMs: 0 }]);
    expect(abilityKitNeedsHeartbeat(kit)).toBe(false);
  });

  test("kit on cooldown needs heartbeat ticks", () => {
    const kit = createAbilityKit([{ id: "bolt", cooldownMs: 1000, flashMs: 0 }]);
    kit.cast("bolt");
    expect(abilityKitNeedsHeartbeat(kit)).toBe(true);
  });

  test("event meter heartbeat is idle when values are unchanged", () => {
    const meter = createEventMeter({ max: 100, gains: { hit: 10 } });
    const view: EventMeterView = {
      value: meter.value(),
      fraction: meter.fraction(),
      tier: meter.tier(),
      ready: meter.ready(),
    };
    expect(eventMeterNeedsHeartbeat(meter, view)).toBe(false);
    meter.feed("hit");
    expect(eventMeterNeedsHeartbeat(meter, view)).toBe(true);
  });
});
