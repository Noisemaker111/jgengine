import { describe, expect, test } from "bun:test";

import { createBubbleStore, type BubbleStore } from "./store";

function settleShot(store: BubbleStore): void {
  store.fire();
  for (let i = 0; i < 800 && store.getState().projectile !== null; i += 1) {
    store.tick(1 / 60);
  }
}

describe("bubble store", () => {
  test("boots into a playable first level", () => {
    const store = createBubbleStore("boot");
    store.reset();
    const s = store.getState();
    expect(s.status).toBe("playing");
    expect(s.level).toBe(1);
    expect(s.score).toBe(0);
    expect(s.descent).toBe(0);
    expect(s.shotsUntilDrop).toBe(6);
    expect(s.bubblesLeft).toBeGreaterThan(0);
    expect(s.bubbles.some((b) => b.color === s.current)).toBe(true);
  });

  test("a fired bubble settles and counts a shot", () => {
    const store = createBubbleStore("one-shot");
    store.reset();
    settleShot(store);
    const s = store.getState();
    expect(s.projectile).toBeNull();
    expect(s.level).toBe(1);
    expect(s.shotsUntilDrop).toBe(5);
  });

  test("the ceiling descends after six settled shots", () => {
    const store = createBubbleStore("cadence");
    store.reset();
    for (let i = 0; i < 5; i += 1) settleShot(store);
    expect(store.getState().level).toBe(1);
    expect(store.getState().descent).toBe(0);
    settleShot(store);
    expect(store.getState().level).toBe(1);
    expect(store.getState().descent).toBe(1);
  });

  test("aim stays inside the cannon arc", () => {
    const store = createBubbleStore("aim");
    store.reset();
    for (let i = 0; i < 200; i += 1) store.nudgeAim(1);
    expect(store.getState().aimAngle).toBeCloseTo(1.361);
    for (let i = 0; i < 400; i += 1) store.nudgeAim(-1);
    expect(store.getState().aimAngle).toBeCloseTo(-1.361);
  });
});
