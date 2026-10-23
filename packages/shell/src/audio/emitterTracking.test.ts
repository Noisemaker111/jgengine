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

/** Marker counts from `Games/scrap-signal/src/editor.scene.json`: 74 of its placed props declare a sound. */
const PLACEMENTS: readonly [string, number][] = [
  ["wreck", 56],
  ["street_lamp", 8],
  ["bus_wreck", 6],
  ["water_tower", 3],
  ["reactor_gate", 1],
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

function objectSources(store: ReturnType<typeof createObjectStore>, onRead?: () => void): EmitterSources {
  return {
    ids: () => store.ids(),
    read(id: string, pose: EmitterPose) {
      onRead?.();
      const object = store.get(id);
      if (object === null) return false;
      pose.key = object.catalogId;
      pose.position = object.position;
      return true;
    },
  };
}

function entitySources(store: ReturnType<typeof createEntityStore>, onRead?: () => void): EmitterSources {
  return {
    ids: () => store.ids(),
    read(id: string, pose: EmitterPose) {
      onRead?.();
      const entity = store.get(id);
      if (entity === null) return false;
      pose.key = entity.name;
      pose.position = entity.position;
      return true;
    },
  };
}

function heapUsed(): number {
  Bun.gc(true);
  return process.memoryUsage().heapUsed;
}

describe("emitter tracking", () => {
  test("a steady frame allocates nothing, reads only the sounding emitters, and writes no parameter", () => {
    const store = placeScrapSignalObjects();
    const engine = fakeEngine();
    let reads = 0;
    const tracker = createEmitterTracker({
      sources: objectSources(store, () => { reads += 1; }),
      sounds: () => OBJECT_SOUNDS,
      play: engine.playLoop,
    });

    tracker.step();
    expect(tracker.count()).toBe(56 + 8 + 6 + 3 + 1);
    expect(reads).toBe(549 + 74);
    expect(engine.calls.filter((call) => call.kind === "play")).toHaveLength(74);

    const ids = store.ids();
    const callsAfterWarmup = engine.calls.length;
    const readsAfterWarmup = reads;
    // JIT the step loop before measuring so compiled code is not counted as per-frame allocation.
    for (let frame = 0; frame < 600; frame += 1) tracker.step();
    const readsAfterJit = reads;
    const before = heapUsed();

    const FRAMES = 600;
    for (let frame = 0; frame < FRAMES; frame += 1) tracker.step();

    const allocated = process.memoryUsage().heapUsed - before;
    // The removed rebuild allocated a Set plus a mapped object per placed prop per frame (~240 KB here).
    expect(allocated).toBeLessThan(24 * 1024);
    expect(reads - readsAfterJit).toBe(74 * FRAMES);
    expect(readsAfterJit - readsAfterWarmup).toBe(74 * 600);
    expect(engine.calls.length).toBe(callsAfterWarmup);
    expect(store.ids()).toBe(ids);
    expect(tracker.count()).toBe(74);
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
    expect(engine.calls.filter((call) => call.kind === "play")).toHaveLength(74);
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
    expect(tracker.count()).toBe(75);
    expect(engine.calls.filter((call) => call.kind === "play")).toHaveLength(75);

    const removed = engine.calls.filter((call) => call.kind === "play").length;
    store.remove("street_lamp_0");
    tracker.step();
    expect(tracker.count()).toBe(74);
    expect(engine.calls.filter((call) => call.kind === "stop")).toHaveLength(1);
    expect(removed).toBe(75);
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
    expect(tracker.count()).toBe(74);

    sounds = undefined;
    tracker.step();
    expect(tracker.count()).toBe(0);
    expect(engine.calls.filter((call) => call.kind === "stop")).toHaveLength(74);

    tracker.step();
    expect(engine.calls.filter((call) => call.kind === "play")).toHaveLength(74);
  });
});
