import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { groundFieldFor } from "./terrain";
import { isPlaceWorld, resolveWorldPhysics, seedForPlace, world, type PlaceConfig } from "./place";

describe("world (place model)", () => {
  test("flat ground with infinite axes is a complete world", () => {
    const place = world({ id: "plain", ground: { mode: "flat", size: { x: Infinity, z: Infinity } } });
    expect(place.kind).toBe("place");
    expect(place.id).toBe("plain");
    expect(place.ground.mode).toBe("flat");
    if (place.ground.mode === "flat") {
      expect(place.ground.size.x).toBe(Infinity);
      expect(place.ground.size.z).toBe(Infinity);
    }
  });

  test("round ground takes radius only", () => {
    const place = world({ id: "moon", ground: { mode: "round", size: { radius: 200 } } });
    expect(place.ground.mode).toBe("round");
    if (place.ground.mode === "round") expect(place.ground.size.radius).toBe(200);
  });

  test("voxel ground carries a generator of algorithm params, never a seed", () => {
    const place = world({
      id: "mines",
      ground: {
        mode: "voxel",
        size: { x: Infinity, y: 128, z: Infinity },
        generator: { algorithm: "fbm", params: { octaves: 4, caveThreshold: 0.6 } },
      },
    });
    expect(place.ground.mode).toBe("voxel");
    expect(
      () =>
        world({
          id: "mines",
          ground: {
            mode: "voxel",
            size: { x: 64, y: 64, z: 64 },
            generator: { algorithm: "fbm", params: { seed: "nope" } },
          },
        }),
    ).toThrow(/seed/);
  });

  test("board ground sizes in cells; stage is a board alias", () => {
    const board = world({ id: "2048", ground: { mode: "board", size: { x: 4, y: 4 } } });
    expect(board.ground.mode).toBe("board");
    const stage = world({ id: "table", ground: { mode: "stage", size: { x: 7, y: 5 } } });
    expect(stage.ground.mode).toBe("board");
  });

  test("surface laws ride on ground and stay data", () => {
    const metal = world({
      id: "chamber",
      ground: { mode: "board", size: { x: 4, y: 4 }, surface: { matter: "metal", restitution: 0.9 } },
      physics: { gravity: 0 },
    });
    const slime = world({
      id: "pit",
      ground: { mode: "board", size: { x: 4, y: 4 }, surface: { matter: "slime", traits: { stuckTurns: 1 } } },
    });
    expect(metal.ground.surface?.matter).toBe("metal");
    expect(metal.physics?.gravity).toBe(0);
    expect(slime.ground.surface?.traits?.["stuckTurns"]).toBe(1);
  });

  test("rejects seed and dressing fields at runtime", () => {
    expect(() => world({ id: "x", ground: { mode: "flat", size: { x: 1, z: 1 } }, seed: "s" } as PlaceConfig)).toThrow(
      /seed/,
    );
    expect(
      () => world({ id: "x", ground: { mode: "flat", size: { x: 1, z: 1 } }, sky: {} } as PlaceConfig),
    ).toThrow(/editor/);
    expect(
      () => world({ id: "x", ground: { mode: "flat", size: { x: 1, z: 1 } }, vegetation: [] } as PlaceConfig),
    ).toThrow(/editor/);
    expect(
      () => world({ id: "x", ground: { mode: "flat", size: { x: 1, z: 1 }, seed: "s" } as never }),
    ).toThrow(/seed/);
  });

  test("validates id and per-mode size", () => {
    expect(() => world({ id: "  ", ground: { mode: "flat", size: { x: 1, z: 1 } } })).toThrow(/id/);
    expect(() => world({ id: "x", ground: { mode: "flat", size: { x: 0, z: 1 } } })).toThrow(/positive/);
    expect(() => world({ id: "x", ground: { mode: "round", size: { radius: Infinity } as never } })).toThrow(/finite/);
    expect(() => world({ id: "x", ground: { mode: "board", size: { x: Infinity, y: 4 } as never } })).toThrow(
      /finite/,
    );
  });

  test("size discriminants are enforced at the type level", () => {
    // Never invoked — these exist so the compiler proves the discriminants reject wrong sizes.
    const rejected = [
      // @ts-expect-error — radius is not a flat size
      () => world({ id: "x", ground: { mode: "flat", size: { radius: 5 } } }),
      // @ts-expect-error — x/z are not a round size
      () => world({ id: "x", ground: { mode: "round", size: { x: 5, z: 5 } } }),
      // @ts-expect-error — a board is 2D: no z axis
      () => world({ id: "x", ground: { mode: "board", size: { x: 4, y: 4, z: 4 } } }),
      // @ts-expect-error — no seed anywhere in a world definition
      () => world({ id: "x", ground: { mode: "flat", size: { x: 1, z: 1 } }, seed: "s" }),
    ];
    expect(rejected).toHaveLength(4);
  });
});

describe("place world runtime seams", () => {
  test("isPlaceWorld narrows and groundFieldFor answers a flat baseline", () => {
    const place = world({ id: "plain", ground: { mode: "flat", size: { x: Infinity, z: Infinity } } });
    expect(isPlaceWorld(place)).toBe(true);
    expect(isPlaceWorld({ kind: "flat" })).toBe(false);
    const field = groundFieldFor(place);
    expect(field.sampleHeight(12, -40)).toBe(0);
  });

  test("seedForPlace derives from world id plus run seed", () => {
    expect(seedForPlace("moon")).toBe("moon");
    expect(seedForPlace("moon", "save-7")).toBe("moon:save-7");
    expect(seedForPlace("moon", "save-7")).toBe(seedForPlace("moon", "save-7"));
    expect(seedForPlace("moon", "save-8")).not.toBe(seedForPlace("moon", "save-7"));
  });

  test("a place's physics resolves over the game-level default in defineGameDefinition", () => {
    const place = world({
      id: "moon",
      ground: { mode: "round", size: { radius: 300 } },
      physics: { gravity: -4 },
    });
    const game = defineGameDefinition({
      name: "test",
      multiplayer: undefined,
      world: place,
      physics: { gravity: -24, jumpVelocity: 9 },
    });
    expect(game.physics).toEqual({ gravity: -4, jumpVelocity: 9 });
    expect(resolveWorldPhysics({ kind: "flat" }, { gravity: -24 })).toEqual({ gravity: -24 });
  });
});
