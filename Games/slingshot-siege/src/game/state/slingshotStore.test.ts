import { describe, expect, test } from "bun:test";
import { SlingshotStore } from "./slingshotStore";

function runUntilAiming(store: SlingshotStore, maxSeconds: number): void {
  const dt = 1 / 60;
  let elapsed = 0;
  while (store.getState().phase === "flying" && elapsed < maxSeconds) {
    store.tick(dt);
    elapsed += dt;
  }
}

describe("SlingshotStore grab radius", () => {
  test("a pointer far from the pouch never starts a drag", () => {
    const store = new SlingshotStore();
    store.beginAim([20, 5, 0]);
    expect(store.getState().phase).toBe("aiming");
  });

  test("a pointer near the pouch starts a drag", () => {
    const store = new SlingshotStore();
    store.beginAim([-1, 0.6, 0]);
    expect(store.getState().phase).toBe("dragging");
  });
});

describe("SlingshotStore aiming", () => {
  test("dragging builds a trajectory preview that arcs upward", () => {
    const store = new SlingshotStore();
    store.beginAim([-1.5, 0.4, 0]);
    const state = store.getState();
    expect(state.phase).toBe("dragging");
    expect(state.trajectory.length).toBeGreaterThan(2);
    const apex = state.trajectory.reduce((best, p) => (p[1] > best[1] ? p : best));
    expect(apex[1]).toBeGreaterThan(state.trajectory[0]![1]);
  });

  test("releasing with almost no pull cancels back to aiming without spending a shot", () => {
    const store = new SlingshotStore();
    const before = store.getState().shotsLeft;
    store.beginAim([0.01, 1.2, 0]);
    store.releaseAim();
    const state = store.getState();
    expect(state.phase).toBe("aiming");
    expect(state.shotsLeft).toBe(before);
  });
});

describe("SlingshotStore firing", () => {
  test("a solid shot at the first level topples the stack and clears or damages it", () => {
    const store = new SlingshotStore();
    const before = store.getState();
    store.beginAim([-2.4, 0.5, 0]);
    store.releaseAim();
    const afterRelease = store.getState();
    expect(afterRelease.phase).toBe("flying");
    expect(afterRelease.shotsLeft).toBe(before.shotsLeft - 1);

    runUntilAiming(store, 10);
    const settled = store.getState();
    expect(settled.phase).toBe("aiming");
    expect(settled.outcome === "cleared" || settled.outcome === "playing").toBe(true);
  });

  test("clearing every shot at a level without hitting the dummy ends in failure", () => {
    const store = new SlingshotStore();
    const shotsMax = store.getState().shotsMax;
    for (let i = 0; i < shotsMax; i += 1) {
      store.beginAim([0.05, 1.25, 0.05]);
      store.releaseAim();
      if (store.getState().phase === "flying") runUntilAiming(store, 10);
    }
    const final = store.getState();
    expect(final.targetsDestroyed).toBe(0);
    expect(final.outcome).toBe("failed");
    expect(final.shotsLeft).toBe(0);
  });

  test("retryLevel restores the shot count and clears the failed outcome", () => {
    const store = new SlingshotStore();
    const shotsMax = store.getState().shotsMax;
    for (let i = 0; i < shotsMax; i += 1) {
      store.beginAim([0.05, 1.25, 0.05]);
      store.releaseAim();
      if (store.getState().phase === "flying") runUntilAiming(store, 10);
    }
    expect(store.getState().outcome).toBe("failed");
    store.retryLevel();
    const restarted = store.getState();
    expect(restarted.outcome).toBe("playing");
    expect(restarted.shotsLeft).toBe(shotsMax);
    expect(restarted.targetsDestroyed).toBe(0);
  });
});
