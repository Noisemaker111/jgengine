import { describe, expect, test } from "bun:test";
import { createVoxelField } from "./voxelField";

type Block = "grass" | "stone" | "sand";

describe("voxel field storage", () => {
  test("set, get, has, remove round-trip", () => {
    const field = createVoxelField<Block>();
    expect(field.set(1, 2, 3, "grass")).toBe(true);
    expect(field.get(1, 2, 3)).toBe("grass");
    expect(field.has(1, 2, 3)).toBe(true);
    expect(field.get(0, 0, 0)).toBeNull();
    expect(field.remove(1, 2, 3)).toBe(true);
    expect(field.has(1, 2, 3)).toBe(false);
    expect(field.remove(1, 2, 3)).toBe(false);
  });

  test("set returns false only when the identical type is already there", () => {
    const field = createVoxelField<Block>();
    field.set(0, 0, 0, "grass");
    expect(field.set(0, 0, 0, "grass")).toBe(false);
    expect(field.set(0, 0, 0, "stone")).toBe(true);
    expect(field.get(0, 0, 0)).toBe("stone");
    expect(field.count()).toBe(1);
  });

  test("fill sets an inclusive box and returns the changed count", () => {
    const field = createVoxelField<Block>();
    expect(field.fill([0, 0, 0], [2, 1, 2], "stone")).toBe(18);
    expect(field.count()).toBe(18);
    expect(field.fill([0, 0, 0], [2, 1, 2], "stone")).toBe(0);
    expect(field.fill([0, 0, 0], [0, 0, 0], "grass")).toBe(1);
  });

  test("bounds track occupied extremes and clear empties everything", () => {
    const field = createVoxelField<Block>();
    expect(field.bounds()).toBeNull();
    field.set(-3, 0, 5, "grass");
    field.set(4, -2, -1, "stone");
    expect(field.bounds()).toEqual({ min: [-3, -2, -1], max: [4, 0, 5] });
    field.clear();
    expect(field.count()).toBe(0);
    expect(field.bounds()).toBeNull();
  });

  test("cells iterates every occupied voxel with its type", () => {
    const field = createVoxelField<Block>();
    field.set(0, 0, 0, "grass");
    field.set(1, 0, 0, "sand");
    const seen = Array.from(field.cells()).sort((a, b) => a.x - b.x);
    expect(seen).toEqual([
      { x: 0, y: 0, z: 0, type: "grass" },
      { x: 1, y: 0, z: 0, type: "sand" },
    ]);
  });
});

describe("voxel field adjacency", () => {
  test("neighbors returns only 6-adjacent occupied cells", () => {
    const field = createVoxelField<Block>();
    field.set(0, 0, 0, "grass");
    field.set(1, 0, 0, "stone");
    field.set(1, 1, 1, "sand");
    expect(field.neighbors(0, 0, 0)).toEqual([{ x: 1, y: 0, z: 0, type: "stone" }]);
    expect(field.neighbors(5, 5, 5)).toEqual([]);
  });

  test("exposedFaces omits faces touching another voxel", () => {
    const field = createVoxelField<Block>();
    field.set(0, 0, 0, "grass");
    field.set(1, 0, 0, "stone");
    expect(field.exposedFaces(0, 0, 0)).toEqual(["nx", "py", "ny", "pz", "nz"]);
    expect(field.exposedFaces(1, 0, 0)).toEqual(["px", "py", "ny", "pz", "nz"]);
    expect(field.exposedFaces(9, 9, 9)).toEqual([]);
  });
});

describe("voxel field raycast", () => {
  test("looking straight down hits the top face with the empty cell above", () => {
    const field = createVoxelField<Block>();
    field.set(0, 0, 0, "grass");
    const hit = field.raycast([0.5, 5, 0.5], [0, -1, 0], 10);
    expect(hit).not.toBeNull();
    expect([hit!.x, hit!.y, hit!.z]).toEqual([0, 0, 0]);
    expect(hit!.type).toBe("grass");
    expect(hit!.face).toBe("py");
    expect(hit!.adjacent).toEqual([0, 1, 0]);
    expect(hit!.distance).toBeCloseTo(4);
  });

  test("horizontal rays report the entered side face from each direction", () => {
    const field = createVoxelField<Block>();
    field.set(0, 0, 0, "stone");
    const fromWest = field.raycast([-2.5, 0.5, 0.5], [1, 0, 0], 10);
    expect(fromWest!.face).toBe("nx");
    expect(fromWest!.adjacent).toEqual([-1, 0, 0]);
    const fromEast = field.raycast([3.5, 0.5, 0.5], [-1, 0, 0], 10);
    expect(fromEast!.face).toBe("px");
    expect(fromEast!.adjacent).toEqual([1, 0, 0]);
    const fromNorth = field.raycast([0.5, 0.5, -2.5], [0, 0, 1], 10);
    expect(fromNorth!.face).toBe("nz");
    expect(fromNorth!.adjacent).toEqual([0, 0, -1]);
  });

  test("misses return null past range or off target", () => {
    const field = createVoxelField<Block>();
    field.set(0, 0, 0, "stone");
    expect(field.raycast([0.5, 5, 0.5], [0, 1, 0], 10)).toBeNull();
    expect(field.raycast([0.5, 5, 0.5], [0, -1, 0], 2)).toBeNull();
  });

  test("a ray starting inside a voxel reports that cell at distance zero", () => {
    const field = createVoxelField<Block>();
    field.set(3, 3, 3, "sand");
    const hit = field.raycast([3.5, 3.5, 3.5], [0, -1, 0], 4);
    expect([hit!.x, hit!.y, hit!.z]).toEqual([3, 3, 3]);
    expect(hit!.distance).toBe(0);
    expect(hit!.adjacent).toEqual([3, 3, 3]);
  });
});

describe("voxel field chunks and observation", () => {
  test("chunkOf floors into chunk coordinates", () => {
    const field = createVoxelField({ chunkSize: 16 });
    expect(field.chunkOf(0, 0, 0)).toEqual({ cx: 0, cy: 0, cz: 0 });
    expect(field.chunkOf(15, 16, 31)).toEqual({ cx: 0, cy: 1, cz: 1 });
    expect(field.chunkOf(-1, -16, -17)).toEqual({ cx: -1, cy: -1, cz: -2 });
  });

  test("chunkVersion bumps only for the touched chunk", () => {
    const field = createVoxelField({ chunkSize: 16 });
    expect(field.chunkVersion(0, 0, 0)).toBe(0);
    field.set(0, 0, 0, "a");
    expect(field.chunkVersion(0, 0, 0)).toBe(1);
    expect(field.chunkVersion(1, 0, 0)).toBe(0);
    field.set(16, 0, 0, "a");
    expect(field.chunkVersion(0, 0, 0)).toBe(1);
    expect(field.chunkVersion(1, 0, 0)).toBe(1);
    field.remove(0, 0, 0);
    expect(field.chunkVersion(0, 0, 0)).toBe(2);
    expect(field.chunkVersion(1, 0, 0)).toBe(1);
  });

  test("no-op mutations do not bump chunk versions or notify", () => {
    const field = createVoxelField({ chunkSize: 16 });
    field.set(0, 0, 0, "a");
    let fired = 0;
    field.subscribe(() => {
      fired += 1;
    });
    field.set(0, 0, 0, "a");
    field.remove(9, 9, 9);
    expect(fired).toBe(0);
    expect(field.chunkVersion(0, 0, 0)).toBe(1);
  });

  test("subscribe fires per mutation and unsubscribes cleanly", () => {
    const field = createVoxelField();
    let fired = 0;
    const unsubscribe = field.subscribe(() => {
      fired += 1;
    });
    field.set(0, 0, 0, "a");
    field.fill([0, 0, 0], [1, 0, 0], "b");
    field.remove(0, 0, 0);
    expect(fired).toBe(3);
    unsubscribe();
    field.set(5, 5, 5, "a");
    expect(fired).toBe(3);
  });

  test("summary counts blocks by type with bounds", () => {
    const field = createVoxelField<Block>();
    field.fill([0, -1, 0], [1, -1, 1], "grass");
    field.set(0, 0, 0, "stone");
    expect(field.summary()).toEqual({
      blocks: 5,
      types: { grass: 4, stone: 1 },
      bounds: { min: [0, -1, 0], max: [1, 0, 1] },
    });
    expect(createVoxelField().summary()).toEqual({ blocks: 0, types: {}, bounds: null });
  });
});
