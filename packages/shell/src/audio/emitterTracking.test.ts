import { describe, expect, test } from "bun:test";
import { createEntityStore } from "@jgengine/core/scene/entityStore";
import { createObjectStore } from "@jgengine/core/scene/objectStore";
import type { AudioEmitterHandle, Vec3 } from "./audioEngine";
import { createEmitterTracker, type EmitterPose, type EmitterSources } from "./emitterTracking";

/** scrap-signal's catalog ids that hum or crackle (`Games/scrap-signal/src/game/audio/catalog.ts`). */
const OBJECT_SOUNDS: Record<string, string> = {
  water_tower: "mach_hum",
  rebuild_station: "mach_hum",
  fast_travel: "mach_hum",
  street_lamp: "lamp_buzz",
  wreck: "elec_crackle",
  bus_wreck: "elec_crackle",
  reactor_gate: "gate_drone",
};

/** Marker counts from `Games/scrap-signal/src/editor.scene.json`: 69 of its 560 placed props declare a sound. */
const PLACEMENTS: readonly [string, number][] = [
  ["wreck", 56],
  ["cover_crate", 94],
  ["rock_spire", 83],
  ["barricade", 70],
  ["road_marker", 57],
  ["bandit_barrel", 52],
  ["dead_tree", 45],
  ["bone_arch", 22],
  ["banner_pole", 18],
  ["tent", 14],
  ["watchtower", 10],
  ["signpost", 10],
  ["wind_turbine", 10],
  ["street_lamp", 6],
  ["bus_wreck", 4],
  ["red_chest", 3],
  ["water_tower", 2],
  ["reactor_gate", 1],
  ["captain_rusk", 1],
  ["wreck_maw", 1],
  ["foundry_heart", 1],
];

type Call = { kind: "play" | "move" | "stop"; voice: number; sound: string; x: number; y: number; z: number };

function fakeEngine() {
  const calls: Call[] = [];
  let started = 0;
  function playLoop(sound: string, position?: Vec3): AudioEmitterHandle {
    const voice = started;
    started += 1;
    calls.push({ kind: "play", voice, sound, x: position?.x ?? 0, y: position?.y ?? 0, z: position?.z ?? 0 });
    return {
      isPlaying: () => true,
      setPosition(next) {
        calls.push({ kind: "move", voice, sound, x: next.x, y: next.y, z: next.z });
      },
      setRate() {},
      setGain() {},
      setLowpass() {},
      setHighpass() {},
      setVelocity() {},
      stop() {
        calls.push({ kind: "stop", voice, sound, x: 0, y: 0, z: 0 });
      },
    };
  }
  return { calls, playLoop };
}

function placeScrapSignalObjects() {
  const store = createObjectStore();
  for (const [catalogId, count] of PLACEMENTS) {
    for (let index = 0; index < count; index += 1) {
      store.place(catalogId, index, 0, index, { instanceId: `${catalogId}_${index}` });
    }
  }
  return store;
}

function objectSources(
  store: ReturnType<typeof createObjectStore>,
  onRead?: (pose: EmitterPose) => void,
): EmitterSources {
  return {
    ids: () => store.ids(),
    read(id: string, pose: EmitterPose) {
      onRead?.(pose);
      const object = store.get(id);
      if (object === null) return false;
      pose.key = object.catalogId;
      pose.position = object.position;
      return true;
    },
  };
}

function entitySources(
  store: ReturnType<typeof createEntityStore>,
  onRead?: (pose: EmitterPose) => void,
): EmitterSources {
  return {
    ids: () => store.ids(),
    read(id: string, pose: EmitterPose) {
      onRead?.(pose);
      const entity = store.get(id);
      if (entity === null) return false;
      pose.key = entity.name;
      pose.position = entity.position;
      return true;
    },
  };
}

/** Counting stand-ins for the constructs the removed per-frame rebuild used: `new Set`, `new Map`, `Array.from` and `Array.prototype.map`. */
function countAllocations(run: () => void): { sets: number; maps: number; froms: number; mappedArrays: number } {
  const counts = { sets: 0, maps: 0, froms: 0, mappedArrays: 0 };
  const RealSet = globalThis.Set;
  const RealMap = globalThis.Map;
  const realFrom = Array.from;
  const realMap = Array.prototype.map;

  class CountingSet<T> extends RealSet<T> {
    constructor(entries?: readonly T[] | null) {
      super();
      counts.sets += 1;
      if (entries !== undefined && entries !== null) for (const entry of entries) this.add(entry);
    }
  }
  class CountingMap<K, V> extends RealMap<K, V> {
    constructor(entries?: readonly (readonly [K, V])[] | null) {
      super();
      counts.maps += 1;
      if (entries !== undefined && entries !== null) for (const [key, value] of entries) this.set(key, value);
    }
  }

  globalThis.Set = CountingSet as unknown as SetConstructor;
  globalThis.Map = CountingMap as unknown as MapConstructor;
  Array.from = ((...args: Parameters<typeof realFrom>) => {
    counts.froms += 1;
    return realFrom(...args);
  }) as typeof Array.from;
  Array.prototype.map = function countedMap(this: unknown[], ...args: Parameters<typeof realMap>) {
    counts.mappedArrays += 1;
    return realMap.apply(this, args as never);
  } as typeof Array.prototype.map;
  try {
    run();
  } finally {
    globalThis.Set = RealSet;
    globalThis.Map = RealMap;
    Array.from = realFrom;
    Array.prototype.map = realMap;
  }
  return counts;
}

describe("emitter tracking", () => {
  test("a steady frame allocates nothing, reads only the sounding emitters, and writes no parameter", () => {
    const store = placeScrapSignalObjects();
    const engine = fakeEngine();
    let reads = 0;
    let poseRef: EmitterPose | undefined;
    let poseRebuilt = 0;
    const tracker = createEmitterTracker({
      sources: objectSources(store, (pose) => {
        reads += 1;
        if (poseRef === undefined) poseRef = pose;
        else if (pose !== poseRef) poseRebuilt += 1;
      }),
      sounds: () => OBJECT_SOUNDS,
      play: engine.playLoop,
    });

    tracker.step();
    expect(tracker.count()).toBe(69);
    expect(reads).toBe(560 + 69);
    expect(engine.calls.filter((call) => call.kind === "play")).toHaveLength(69);

    const ids = store.ids();
    const callsAfterWarmup = engine.calls.length;
    // JIT the step loop before counting so compiled code is not mistaken for per-frame work.
    for (let frame = 0; frame < 600; frame += 1) tracker.step();
    const readsAfterWarmup = reads;

    const FRAMES = 600;
    const allocated = countAllocations(() => {
      for (let frame = 0; frame < FRAMES; frame += 1) tracker.step();
    });

    // The removed rebuild built a Set plus a mapped object per placed prop every frame.
    expect(allocated).toEqual({ sets: 0, maps: 0, froms: 0, mappedArrays: 0 });
    expect(reads - readsAfterWarmup).toBe(69 * FRAMES);
    expect(poseRebuilt).toBe(0);
    expect(engine.calls.length).toBe(callsAfterWarmup);
    expect(store.ids()).toBe(ids);
    expect(tracker.count()).toBe(69);
  });

  test("a moved emitter updates its loop position and pan without restarting the sound", () => {
    const store = placeScrapSignalObjects();
    const engine = fakeEngine();
    const tracker = createEmitterTracker({
      sources: objectSources(store),
      sounds: () => OBJECT_SOUNDS,
      play: engine.playLoop,
    });
    tracker.step();
    const lamp = engine.calls.find((call) => call.kind === "play" && call.sound === "lamp_buzz")!;

    store.move("street_lamp_0", 12, 4, -9);
    tracker.step();

    const moves = engine.calls.filter((call) => call.kind === "move");
    expect(moves).toEqual([{ kind: "move", voice: lamp.voice, sound: "lamp_buzz", x: 12, y: 4, z: -9 }]);
    expect(engine.calls.filter((call) => call.kind === "play")).toHaveLength(69);
    expect(engine.calls.filter((call) => call.kind === "stop")).toHaveLength(0);

    tracker.step();
    expect(engine.calls.filter((call) => call.kind === "move")).toHaveLength(1);
  });

  test("placing a sounding prop starts it and removing one stops just that loop", () => {
    const store = placeScrapSignalObjects();
    const engine = fakeEngine();
    const tracker = createEmitterTracker({
      sources: objectSources(store),
      sounds: () => OBJECT_SOUNDS,
      play: engine.playLoop,
    });
    tracker.step();

    store.place("street_lamp", 3, 0, 3, { instanceId: "street_lamp_new" });
    store.place("cover_crate", 4, 0, 4, { instanceId: "crate_new" });
    tracker.step();
    expect(tracker.count()).toBe(70);
    expect(engine.calls.filter((call) => call.kind === "play")).toHaveLength(70);

    store.remove("street_lamp_0");
    tracker.step();
    expect(tracker.count()).toBe(69);
    expect(engine.calls.filter((call) => call.kind === "stop")).toHaveLength(1);
  });

  test("entity emitters follow pose writes and retune when their sounding name changes", () => {
    const store = createEntityStore();
    store.spawn("guard", { id: "guard_1", position: [1, 0, 2] });
    store.spawn("crate", { id: "crate_1", position: [5, 0, 5] });
    const engine = fakeEngine();
    const sounds = { guard: "guard_drone", turret: "turret_hum" };
    const tracker = createEmitterTracker({
      sources: entitySources(store),
      sounds: () => sounds,
      play: engine.playLoop,
    });

    tracker.step();
    expect(tracker.count()).toBe(1);
    expect(engine.calls.filter((call) => call.kind === "play")).toHaveLength(1);

    store.setPose("guard_1", { position: [4, 0, 6], dt: 1 / 60 });
    tracker.step();
    expect(engine.calls.filter((call) => call.kind === "move")).toEqual([
      { kind: "move", voice: 0, sound: "guard_drone", x: 4, y: 0, z: 6 },
    ]);

    store.update("guard_1", { name: "turret" });
    tracker.step();
    expect(engine.calls.filter((call) => call.kind === "stop")).toHaveLength(1);
    expect(engine.calls.filter((call) => call.kind === "play").at(-1)).toEqual({
      kind: "play",
      voice: 1,
      sound: "turret_hum",
      x: 4,
      y: 0,
      z: 6,
    });

    store.despawn("guard_1");
    tracker.step();
    expect(tracker.count()).toBe(0);
    expect(engine.calls.filter((call) => call.kind === "stop")).toHaveLength(2);
  });

  test("a missing sound map stops every loop and a still frame then costs nothing", () => {
    const store = placeScrapSignalObjects();
    const engine = fakeEngine();
    let sounds: Record<string, string> | undefined = OBJECT_SOUNDS;
    const tracker = createEmitterTracker({
      sources: objectSources(store),
      sounds: () => sounds,
      play: engine.playLoop,
    });
    tracker.step();
    expect(tracker.count()).toBe(69);

    sounds = undefined;
    tracker.step();
    expect(tracker.count()).toBe(0);
    expect(engine.calls.filter((call) => call.kind === "stop")).toHaveLength(69);

    tracker.step();
    expect(engine.calls.filter((call) => call.kind === "play")).toHaveLength(69);
  });
});
