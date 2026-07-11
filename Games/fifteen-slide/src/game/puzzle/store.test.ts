import { describe, expect, test } from "bun:test";

import { arrowMove, isSolved, solvedTiles, type SlideDir } from "./logic";
import { createPuzzleStore } from "./store";

const DIRS: readonly SlideDir[] = ["up", "down", "left", "right"];

/** Breadth-first solver over real arrow moves — proves a 3x3 board is reachable
 *  to solved and yields the move sequence to drive the store through a solve. */
function solve3x3(tiles: readonly number[]): SlideDir[] {
  const goal = solvedTiles(3).join(",");
  const start = tiles.join(",");
  if (start === goal) return [];
  const seen = new Set<string>([start]);
  const queue: { tiles: readonly number[]; path: SlideDir[] }[] = [{ tiles, path: [] }];
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const dir of DIRS) {
      const moved = arrowMove({ n: 3, tiles: node.tiles }, dir);
      if (moved === null) continue;
      const key = moved.tiles.join(",");
      if (seen.has(key)) continue;
      const path = [...node.path, dir];
      if (key === goal) return path;
      seen.add(key);
      queue.push({ tiles: moved.tiles, path });
    }
  }
  throw new Error("unsolvable board reached by shuffle — should never happen");
}

describe("puzzle store", () => {
  test("a new game starts ready, zeroed, and not solved", () => {
    const store = createPuzzleStore();
    store.newGame("start-seed");
    const state = store.getState();
    expect(state.status).toBe("ready");
    expect(state.moves).toBe(0);
    expect(state.elapsedMs).toBe(0);
    expect(state.seed).toBe("start-seed");
    expect(isSolved({ n: state.size, tiles: state.tiles })).toBe(false);
  });

  test("the same seed reproduces the same shuffled board", () => {
    const a = createPuzzleStore();
    const b = createPuzzleStore();
    a.newGame("shared");
    b.newGame("shared");
    expect(a.getState().tiles).toEqual(b.getState().tiles);
  });

  test("the share url carries the seed", () => {
    const store = createPuzzleStore();
    store.newGame("linkable");
    expect(store.getState().shareUrl).toContain("seed=linkable");
  });

  test("the timer stays frozen until the first move", () => {
    const store = createPuzzleStore();
    store.newGame("timer");
    store.tick(5);
    expect(store.getState().status).toBe("ready");
    expect(store.getState().elapsedMs).toBe(0);
  });

  test("switching size resets to a fresh unsolved board of that size", () => {
    const store = createPuzzleStore();
    store.setSize(3);
    expect(store.getState().size).toBe(3);
    expect(store.getState().tiles.length).toBe(9);
    store.setSize(5);
    expect(store.getState().size).toBe(5);
    expect(store.getState().tiles.length).toBe(25);
    expect(store.getState().status).toBe("ready");
  });

  test("subscribers are notified on state changes and stop after unsubscribe", () => {
    const store = createPuzzleStore();
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });
    store.newGame("notify");
    store.move("down");
    const afterMove = notified;
    unsubscribe();
    store.newGame("after");
    expect(afterMove).toBeGreaterThanOrEqual(2);
    expect(notified).toBe(afterMove);
  });

  test("solving a 3x3 counts moves, ticks the clock, and records a best", () => {
    const store = createPuzzleStore();
    store.setSize(3);
    store.newGame("solve-me");
    const path = solve3x3(store.getState().tiles);
    expect(path.length).toBeGreaterThan(0);
    for (const dir of path) {
      store.move(dir);
      store.tick(0.5); // accrue game time between moves
    }
    const state = store.getState();
    expect(state.status).toBe("solved");
    expect(state.moves).toBe(path.length);
    expect(state.bestMoves).toBe(path.length);
    expect(state.bestTimeMs).not.toBeNull();
    expect(state.newMovesRecord).toBe(true);
    expect(state.newTimeRecord).toBe(true);
    expect(isSolved({ n: 3, tiles: state.tiles })).toBe(true);
  });

  test("preview stages a mid-solve 4x4 with a shown best", () => {
    const store = createPuzzleStore();
    store.preview();
    const state = store.getState();
    expect(state.size).toBe(4);
    expect(state.status).toBe("playing");
    expect(state.moves).toBe(23);
    expect(state.bestMoves).toBe(41);
    expect(state.bestTimeMs).toBe(58_200);
  });
});
