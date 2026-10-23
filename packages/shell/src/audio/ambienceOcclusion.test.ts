import { afterEach, describe, expect, test } from "bun:test";

import type { AmbienceZoneDef } from "@jgengine/core/audio/ambience";
import type { SoundDef } from "@jgengine/core/audio/audioFalloff";

import { createAudioEngine } from "./audioEngine";
import { sceneLineBlocked } from "./occlusion";

function param(value = 1) {
  const result = {
    value,
    target: null as number | null,
    ramps: [] as { value: number; tc: number | undefined }[],
    setValueAtTime: (next: number) => { result.value = next; },
    setTargetAtTime: (next: number, _time: number, tc?: number) => {
      result.target = next;
      result.ramps.push({ value: next, tc });
    },
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  };
  return result;
}

function audioContext() {
  const nodes: any[] = [];
  const node = (kind: string) => {
    const result = {
      kind,
      connections: [] as any[],
      connect(target: any) { result.connections.push(target); return target; },
      disconnect() { result.connections.length = 0; },
      gain: param(1),
      frequency: param(22050),
      playbackRate: param(1),
      startCount: 0,
      stopCount: 0,
      start: () => { result.startCount += 1; },
      stop: () => { result.stopCount += 1; },
      onended: null as null | (() => void),
      type: "sine",
      buffer: null as any,
      loop: false,
      positionX: param(), positionY: param(), positionZ: param(),
      panningModel: "equalpower",
      distanceModel: "inverse",
      refDistance: 1,
      maxDistance: 10000,
      rolloffFactor: 1,
      coneInnerAngle: 360,
      coneOuterAngle: 360,
      coneOuterGain: 0,
      setValueAtTime: () => undefined,
      linearRampToValueAtTime: () => undefined,
      exponentialRampToValueAtTime: () => undefined,
    } as any;
    nodes.push(result);
    return result;
  };
  const context: any = {
    currentTime: 0,
    sampleRate: 8000,
    destination: node("destination"),
    listener: {
      positionX: param(), positionY: param(), positionZ: param(),
      forwardX: param(), forwardY: param(), forwardZ: param(),
      upX: param(), upY: param(), upZ: param(),
    },
    createGain: () => node("gain"),
    createPanner: () => node("panner"),
    createOscillator: () => node("oscillator"),
    createBufferSource: () => node("bufferSource"),
    createBiquadFilter: () => node("filter"),
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    decodeAudioData: async () => ({ duration: 2 }),
    resume: async () => undefined,
    close: async () => undefined,
  };
  return { context, nodes };
}

function install(mock: ReturnType<typeof audioContext>) {
  class MockAudioContext { constructor() { return mock.context; } }
  (globalThis as any).window = { AudioContext: MockAudioContext };
  (globalThis as any).fetch = async () => ({ arrayBuffer: async () => new ArrayBuffer(8) });
}

const sample = (id: string, extra: Partial<SoundDef> = {}): SoundDef => ({ id, url: `/audio/${id}.ogg`, bus: "sfx", loop: true, ...extra });

async function flush(): Promise<void> {
  for (let index = 0; index < 4; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

const forward = { x: 0, y: 0, z: -1 };
const up = { x: 0, y: 1, z: 0 };

const meadow: AmbienceZoneDef = { id: "meadow", sound: "bed_meadow", shape: { kind: "sphere", center: [0, 0, 0], radius: 5 }, crossfade: 4 };
const shaft: AmbienceZoneDef = { id: "shaft", sound: "bed_shaft", shape: { kind: "sphere", center: [10, 0, 0], radius: 5 }, crossfade: 4 };

afterEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).fetch;
});

describe("ambience zones", () => {
  test("entering, crossing and leaving a zone moves its bed level and never gaps the loop", async () => {
    const mock = audioContext();
    install(mock);
    const engine = createAudioEngine({
      sounds: { bed_meadow: sample("bed_meadow"), bed_shaft: sample("bed_shaft") },
      zones: [meadow, shaft],
    });
    engine.setListenerPose({ position: { x: 0, y: 0, z: 0 }, forward, up });
    await flush();

    expect(engine.ambience().zone).toBe("meadow");
    expect(engine.ambience().levels).toEqual([{ id: "meadow", level: 1 }]);
    const meadowBed = mock.nodes.filter((entry) => entry.kind === "bufferSource");
    expect(meadowBed).toHaveLength(1);
    expect(meadowBed[0].loop).toBe(true);
    expect(meadowBed[0].startCount).toBe(1);

    // At the shared midpoint both beds sit at half level: a crossfade, not a cut.
    engine.setListenerPose({ position: { x: 5, y: 0, z: 0 }, forward, up });
    const between = engine.ambience();
    expect(between.zone).toBe("meadow");
    expect(between.levels.find((entry) => entry.id === "meadow")!.level).toBeCloseTo(0.5);
    expect(between.levels.find((entry) => entry.id === "shaft")!.level).toBeCloseTo(0.5);

    // Deep inside the second zone the handover is complete.
    engine.setListenerPose({ position: { x: 10, y: 0, z: 0 }, forward, up });
    expect(engine.ambience().zone).toBe("shaft");
    expect(engine.ambience().levels).toEqual([{ id: "shaft", level: 1 }]);

    // Leaving every zone fades both beds to silence without stopping the retained sources.
    engine.setListenerPose({ position: { x: 60, y: 0, z: 0 }, forward, up });
    expect(engine.ambience()).toEqual({ zone: null, levels: [] });
    engine.dispose();
  });

  test("the bed gain ramps toward the zone weight instead of stepping", async () => {
    const mock = audioContext();
    install(mock);
    const engine = createAudioEngine({ sounds: { bed_meadow: sample("bed_meadow") }, zones: [meadow] });
    engine.setListenerPose({ position: { x: -4, y: 0, z: 0 }, forward, up });
    await flush();
    const bedGains = mock.nodes.filter((entry) => entry.kind === "gain" && entry.gain.ramps.some((ramp: any) => ramp.value > 0));
    expect(bedGains.length).toBeGreaterThan(0);
    const ramp = bedGains[0].gain.ramps.find((entry: any) => entry.value > 0);
    expect(ramp.tc).toBeCloseTo(0.08);
    engine.dispose();
  });
});

describe("geometry occlusion", () => {
  test("a blocked line attenuates the loop and an unblocked line does not", async () => {
    const mock = audioContext();
    install(mock);
    let blocked = true;
    const engine = createAudioEngine({
      sounds: { hum: sample("hum", { spatial: { panning: "equalpower" } }) },
      occlusion: { intervalMs: 0, maxTestsPerTick: 8 },
    });
    engine.setOcclusionSource((from, to) => blocked && from.x < 0 && to.x > 0);
    const handle = engine.playLoop("hum", { x: 10, y: 0, z: 0 })!;
    await flush();
    engine.setListenerPose({ position: { x: -10, y: 0, z: 0 }, forward, up });
    expect(engine.occlusionStats().tests).toBeGreaterThan(0);
    expect(engine.occlusionStats().blocked).toBeGreaterThan(0);
    const attenuated = mock.nodes
      .filter((entry) => entry.kind === "gain")
      .some((entry) => entry.gain.ramps.some((ramp: any) => Math.abs(ramp.value - 0.55) < 1e-9));
    expect(attenuated).toBe(true);

    blocked = false;
    mock.context.currentTime = 1;
    engine.setListenerPose({ position: { x: -11, y: 0, z: 0 }, forward, up });
    const restored = mock.nodes
      .filter((entry) => entry.kind === "gain")
      .some((entry) => entry.gain.ramps.some((ramp: any) => Math.abs(ramp.value - 1) < 1e-9));
    expect(restored).toBe(true);
    handle.stop();
    engine.dispose();
  });

  test("the per-tick test budget bounds work and leaves the rest on distance-only", async () => {
    const mock = audioContext();
    install(mock);
    const engine = createAudioEngine({
      sounds: {
        a: sample("a"), b: sample("b"), c: sample("c"),
      },
      occlusion: { intervalMs: 0, maxTestsPerTick: 1 },
    });
    let calls = 0;
    engine.setOcclusionSource(() => { calls += 1; return false; });
    const handles = [
      engine.playLoop("a", { x: 10, y: 0, z: 0 }),
      engine.playLoop("b", { x: 12, y: 0, z: 0 }),
      engine.playLoop("c", { x: 14, y: 0, z: 0 }),
    ];
    await flush();
    calls = 0;
    const testsBefore = engine.occlusionStats().tests;
    engine.setListenerPose({ position: { x: -5, y: 0, z: 0 }, forward, up });
    expect(calls).toBe(1);
    expect(engine.occlusionStats().tests - testsBefore).toBe(1);
    for (const handle of handles) handle?.stop();
    engine.dispose();
  });

  test("the scene line test asks only for blocking world geometry", () => {
    const queries: any[] = [];
    const source = {
      raycast(input: any) {
        queries.push(input);
        return { blocks: true } as any;
      },
    };
    expect(sceneLineBlocked(source, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })).toBe(true);
    expect(queries[0].filter).toEqual({ entities: false, terrain: false });
    expect(queries[0].maxDistance).toBeCloseTo(10 - 0.001);
    const clear = { raycast: () => null };
    expect(sceneLineBlocked(clear, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBe(false);
  });
});

describe("bus ducking", () => {
  test("a cue with a duck policy lowers the bus and restores the player's own gain exactly", async () => {
    const mock = audioContext();
    install(mock);
    const engine = createAudioEngine({
      sounds: { bed_meadow: sample("bed_meadow") },
      buses: { music: { id: "music", gain: 0.8 } },
    });
    engine.setBusGain("music", 0.6);
    expect(engine.busLevel("music")).toBeCloseTo(0.6);

    const release = engine.duck("music", { amount: 0.5 });
    expect(engine.busLevel("music")).toBeCloseTo(0.3);
    engine.setBusGain("music", 0.7);
    expect(engine.busLevel("music")).toBeCloseTo(0.35);
    release();
    expect(engine.busLevel("music")).toBeCloseTo(0.7);
    release();
    expect(engine.busLevel("music")).toBeCloseTo(0.7);
    engine.dispose();
  });

  test("a cue's own duck policy holds the music bus for the cue and then releases", async () => {
    const mock = audioContext();
    install(mock);
    const engine = createAudioEngine({
      sounds: {
        hit: {
          id: "hit",
          bus: "sfx",
          synth: { voices: [{ kind: "tone", freq: 220, duration: 0.02 }] },
          duck: { buses: ["music"], amount: 0.5, seconds: 0.03 },
        },
      },
      buses: { music: { id: "music", gain: 1 } },
    });
    engine.play("hit");
    expect(engine.busLevel("music")).toBeCloseTo(0.5);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(engine.busLevel("music")).toBeCloseTo(1);
    engine.dispose();
  });

  test("two overlapping ducks restore the remaining one, then the player's level", () => {
    const mock = audioContext();
    install(mock);
    const engine = createAudioEngine({ buses: { music: { id: "music", gain: 1 } } });
    const first = engine.duck("music", { amount: 0.8 });
    const second = engine.duck("music", { amount: 0.3 });
    expect(engine.busLevel("music")).toBeCloseTo(0.2);
    first();
    expect(engine.busLevel("music")).toBeCloseTo(0.7);
    second();
    expect(engine.busLevel("music")).toBeCloseTo(1);
    engine.dispose();
  });
});
