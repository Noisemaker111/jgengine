import { describe, expect, test } from "bun:test";

import { CANNON_Y, COLS, ROWS, SHOT_H, START_LIVES } from "./constants";
import { createStarInvadersStore } from "./store";

function fresh() {
  const store = createStarInvadersStore("test-seed");
  store.reset("test-seed");
  return store;
}

function playing() {
  const store = fresh();
  store.fire(); // start screen: first fire begins the run
  return store;
}

describe("new game state", () => {
  test("reset seeds a full grid, three lives, wave one, on the start screen", () => {
    const s = fresh().getState();
    expect(s.status).toBe("start");
    expect(s.lives).toBe(START_LIVES);
    expect(s.wave).toBe(1);
    expect(s.score).toBe(0);
    expect(s.aliensLeft).toBe(ROWS * COLS);
    expect(s.shot).toBeNull();
  });

  test("first fire leaves the start screen without spawning a shot", () => {
    const store = fresh();
    store.fire();
    const s = store.getState();
    expect(s.status).toBe("playing");
    expect(s.shot).toBeNull();
  });
});

describe("one-shot constraint", () => {
  test("only one player shot exists at a time", () => {
    const store = playing();
    store.fire();
    expect(store.getState().shot).not.toBeNull();
    const spawnY = CANNON_Y - SHOT_H;

    store.tick(0.05); // shot climbs
    const climbed = store.getState().shot;
    expect(climbed).not.toBeNull();
    expect(climbed!.y).toBeLessThan(spawnY);

    store.fire(); // refire is ignored while a shot is airborne
    const after = store.getState().shot;
    expect(after!.y).toBe(climbed!.y);
    expect(after!.y).toBeLessThan(spawnY);
  });

  test("a fresh shot is available once the previous one clears", () => {
    const store = playing();
    store.fire();
    for (let i = 0; i < 60 && store.getState().shot !== null; i += 1) store.tick(0.05);
    expect(store.getState().shot).toBeNull();
    store.fire();
    expect(store.getState().shot).not.toBeNull();
  });
});

describe("shot vs alien collision and scoring", () => {
  test("a shot fired up a clear column kills the bottom alien and scores", () => {
    const store = playing();
    const columnCenterX = 112; // column 5 sits in the gap between bunkers
    store.setPointerX(columnCenterX);
    store.tick(0.05); // move the cannon under the column
    store.fire();
    expect(store.getState().shot).not.toBeNull();

    for (let i = 0; i < 60 && store.getState().shot !== null; i += 1) store.tick(0.05);

    const s = store.getState();
    expect(s.shot).toBeNull();
    expect(s.score).toBeGreaterThan(0);
    expect(s.aliensLeft).toBe(ROWS * COLS - 1);
  });
});

describe("pause", () => {
  test("pause toggles only while playing", () => {
    const store = playing();
    store.togglePause();
    expect(store.getState().paused).toBe(true);
    store.togglePause();
    expect(store.getState().paused).toBe(false);
  });
});
