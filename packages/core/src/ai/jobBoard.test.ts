import { describe, expect, test } from "bun:test";
import { createJobBoard } from "@jgengine/core/ai/jobBoard";
import { createNavGrid, findPath } from "@jgengine/core/nav/navGrid";
import { advancePathFollow, createPathFollow, pathFromNav } from "@jgengine/core/nav/pathFollow";

describe("job board assignment", () => {
  test("claim pulls the highest-priority queued job", () => {
    const board = createJobBoard();
    board.post({ id: "farm", station: [1, 0], work: 5, priority: 1 });
    board.post({ id: "forge", station: [4, 0], work: 5, priority: 5 });
    expect(board.claim("pal")).toBe("forge");
    expect(board.queued().map((j) => j.id)).toEqual(["farm"]);
  });

  test("claim is idempotent while a worker holds a job", () => {
    const board = createJobBoard();
    board.post({ id: "farm", station: [1, 0], work: 5 });
    board.post({ id: "forge", station: [4, 0], work: 5 });
    expect(board.claim("pal")).toBe("farm");
    expect(board.claim("pal")).toBe("farm");
  });

  test("player-directed assign steals the job from its current worker", () => {
    const board = createJobBoard();
    board.post({ id: "chop", station: [2, 0], work: 3 });
    board.claim("kelvin");
    board.assign("player-order", "chop");
    expect(board.jobOf("kelvin")).toBeNull();
    expect(board.jobOf("player-order")).toBe("chop");
  });

  test("release requeues the job", () => {
    const board = createJobBoard();
    board.post({ id: "farm", station: [1, 0], work: 5 });
    board.claim("pal");
    board.release("pal");
    expect(board.queued().map((j) => j.id)).toEqual(["farm"]);
    expect(board.worker("pal").phase).toBe("idle");
  });
});

describe("job lifecycle state machine", () => {
  test("travels, works, then reports done", () => {
    const board = createJobBoard();
    board.post({ id: "forge", station: [10, 0], work: 2, arriveRadius: 1 });
    board.claim("pal");
    expect(board.advance("pal", 0.5, { distanceToStation: 8 })).toBeNull();
    expect(board.worker("pal").phase).toBe("travelling");
    expect(board.advance("pal", 0.5, { distanceToStation: 0.5 })?.jobId).toBeUndefined();
    expect(board.worker("pal").phase).toBe("working");
    expect(board.advance("pal", 1, { distanceToStation: 0.5 })).toBeNull();
    const report = board.advance("pal", 1, { distanceToStation: 0.5 });
    expect(report).toEqual({ jobId: "forge", workerId: "pal", cycle: 1 });
    expect(board.worker("pal").phase).toBe("done");
    expect(board.get("forge")).toBeNull();
  });

  test("leaving the station reverts working to travelling", () => {
    const board = createJobBoard();
    board.post({ id: "forge", station: [10, 0], work: 5, arriveRadius: 1 });
    board.claim("pal");
    board.advance("pal", 0.1, { distanceToStation: 0.5 });
    expect(board.worker("pal").phase).toBe("working");
    board.advance("pal", 0.1, { distanceToStation: 6 });
    expect(board.worker("pal").phase).toBe("travelling");
  });

  test("repeating job runs a production loop and reports each cycle", () => {
    const board = createJobBoard();
    board.post({ id: "power", station: [0, 0], work: 1, arriveRadius: 1, repeat: true });
    board.claim("pal");
    const first = board.advance("pal", 1, { distanceToStation: 0 });
    expect(first?.cycle).toBe(1);
    expect(board.worker("pal").phase).toBe("working");
    const second = board.advance("pal", 1, { distanceToStation: 0 });
    expect(second?.cycle).toBe(2);
    expect(board.get("power")).not.toBeNull();
  });

  test("cancelling a job idles its worker", () => {
    const board = createJobBoard();
    board.post({ id: "farm", station: [1, 0], work: 5 });
    board.claim("pal");
    board.cancel("farm");
    expect(board.advance("pal", 1, { distanceToStation: 0 })).toBeNull();
    expect(board.worker("pal").phase).toBe("idle");
  });
});

describe("job routing over the navmesh", () => {
  test("worker paths to the station via findPath then works", () => {
    const grid = createNavGrid({ bounds: { minX: 0, minZ: 0, maxX: 20, maxZ: 20 }, cellSize: 1 });
    grid.blockAabb({ minX: 5, minZ: 0, maxX: 6, maxZ: 15 });
    const board = createJobBoard();
    const station: readonly [number, number] = [15, 2];
    board.post({ id: "forge", station, work: 1, arriveRadius: 1 });
    board.claim("pal");

    const route = findPath(grid, [1, 2], station);
    expect(route).not.toBeNull();
    const follow = { config: { waypoints: pathFromNav(route!, 0), speed: 6 } };
    let state = createPathFollow(follow.config);
    let report = null;
    for (let i = 0; i < 200 && report === null; i += 1) {
      state = advancePathFollow(follow.config, state, 0.1);
      const distance = Math.hypot(station[0] - state.position[0], station[1] - state.position[2]);
      report = board.advance("pal", 0.1, { distanceToStation: distance });
    }
    expect(report).toEqual({ jobId: "forge", workerId: "pal", cycle: 1 });
  });
});
