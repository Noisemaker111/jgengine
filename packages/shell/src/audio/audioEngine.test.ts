import { afterEach, describe, expect, test } from "bun:test";

import { createVoiceAllocator } from "@jgengine/core/audio/voiceAllocator";
import type { SoundDef } from "@jgengine/core/audio/audioFalloff";

import { createAudioEngine } from "./audioEngine";
import { attachAudioEventWire, type AudioEventBus } from "./audioWire";

type Param = {
  value: number;
  target: number | null;
  setValueAtTime: () => void;
  setTargetAtTime: (value: number) => void;
  linearRampToValueAtTime: () => void;
  exponentialRampToValueAtTime: () => void;
};

function param(value = 0): Param {
  const result: Param = {
    value,
    target: null,
    setValueAtTime: () => undefined,
    setTargetAtTime: (next) => {
      result.target = next;
    },
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  };
  return result;
}

function graphContext() {
  const nodes: any[] = [];
  const node = (kind: string) => {
    const result = {
      kind,
      connections: [] as any[],
      disconnectCount: 0,
      connect: (target: any) => { result.connections.push(target); return target; },
      disconnect: () => { result.disconnectCount += 1; result.connections.length = 0; },
      gain: param(1),
      frequency: param(440),
      playbackRate: param(1),
      startCount: 0,
      stopCount: 0,
      start: () => { result.startCount += 1; },
      stop: () => { result.stopCount += 1; },
      onended: null,
      end: () => { result.onended?.(); },
      type: "sine",
      buffer: null,
      loop: false,
      positionX: param(),
      positionY: param(),
      positionZ: param(),
      get position() { return [this.positionX.value, this.positionY.value, this.positionZ.value] as [number, number, number]; },
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
  const listener = {
    positionX: param(), positionY: param(), positionZ: param(),
    forwardX: param(), forwardY: param(), forwardZ: param(),
    upX: param(), upY: param(), upZ: param(),
  };
  const context = {
    currentTime: 0, sampleRate: 8000, destination: node("destination"), listener,
    createGain: () => node("gain"), createPanner: () => node("panner"), createOscillator: () => node("oscillator"),
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => node("bufferSource"), createBiquadFilter: () => node("filter"),
    decodeAudioData: async () => ({ duration: 1 }),
    closeCount: 0,
    resume: async () => undefined, close: async () => { context.closeCount += 1; },
  };
  return { context, nodes, listener };
}

afterEach(() => {
  delete (globalThis as any).window;
});

describe("createAudioEngine spatial graph", () => {
  test("sets listener orientation and places a spatial sound panner", () => {
    const mock = graphContext();
    class MockAudioContext { constructor() { return mock.context as any; } }
    (globalThis as any).window = { AudioContext: MockAudioContext };
    const engine = createAudioEngine({ sounds: {
      ping: { id: "ping", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 440, duration: 0.05 }] }, spatial: { panning: "equalpower" } },
    } });

    engine.setListenerPose({ position: { x: 1, y: 2, z: 3 }, forward: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } });
    engine.playOneShot("ping", { x: -2, y: 0, z: -4 });

    expect([mock.listener.positionX.value, mock.listener.positionY.value, mock.listener.positionZ.value]).toEqual([1, 2, 3]);
    expect([mock.listener.forwardX.value, mock.listener.forwardY.value, mock.listener.forwardZ.value]).toEqual([-1, 0, 0]);
    expect([mock.listener.upX.value, mock.listener.upY.value, mock.listener.upZ.value]).toEqual([0, 0, 1]);
    const panner = mock.nodes.find((entry) => entry.kind === "panner");
    expect(panner).toBeDefined();
    expect((panner as any).position).toEqual([-2, 0, -4]);
    engine.dispose();
  });
});

describe("createAudioEngine retained loop filter and doppler", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  async function loopHarness(doppler?: number) {
    const mock = graphContext();
    class MockAudioContext { constructor() { return mock.context as any; } }
    (globalThis as any).window = { AudioContext: MockAudioContext };
    globalThis.fetch = (async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })) as any;
    const engine = createAudioEngine({ sounds: {
      engine: { id: "engine", bus: "sfx", url: "engine.ogg", loop: true, ...(doppler === undefined ? {} : { doppler }) },
    } });
    engine.setListenerPose({ position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } });
    const handle = engine.playLoop("engine", { x: 0, y: 0, z: -100 })!;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const source = mock.nodes.find((n) => n.kind === "bufferSource") as any;
    const filters = mock.nodes.filter((n) => n.kind === "filter") as any[];
    return { engine, handle, source, filters };
  }

  test("routes a loop through lowpass then highpass and ramps live cutoffs, clamped to Nyquist", async () => {
    const { engine, handle, filters } = await loopHarness();
    expect(filters.map((f) => f.type)).toEqual(["lowpass", "highpass"]);
    expect(filters[0].frequency.value).toBe(4000);
    expect(filters[1].frequency.value).toBe(10);
    handle.setLowpass(900);
    handle.setHighpass(120);
    expect(filters[0].frequency.target).toBe(900);
    expect(filters[1].frequency.target).toBe(120);
    engine.dispose();
  });

  test("pitches a doppler loop by the emitter's closing speed and leaves others alone", async () => {
    const shifted = await loopHarness(1);
    shifted.handle.setRate(1.5);
    shifted.handle.setVelocity({ x: 0, y: 0, z: 34.3 });
    expect(shifted.source.playbackRate.target).toBeCloseTo(1.5 * (343 / (343 - 34.3)), 6);
    shifted.engine.dispose();

    const plain = await loopHarness();
    plain.handle.setRate(1.5);
    plain.handle.setVelocity({ x: 0, y: 0, z: 34.3 });
    expect(plain.source.playbackRate.target).toBe(1.5);
    plain.engine.dispose();
  });

  test("listener velocity toward the emitter pitches a doppler loop up", async () => {
    const { engine, source } = await loopHarness(1);
    engine.setListenerPose({
      position: { x: 0, y: 0, z: 0 },
      forward: { x: 0, y: 0, z: -1 },
      up: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: -34.3 },
    });
    expect(source.playbackRate.target).toBeCloseTo(1.1, 6);
    engine.dispose();
  });
});


const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function installGraph() {
  const mock = graphContext();
  class MockAudioContext { constructor() { return mock.context as any; } }
  (globalThis as any).window = { AudioContext: MockAudioContext };
  globalThis.fetch = (async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })) as any;
  return mock;
}

const sample = (id: string, extra: Partial<SoundDef> = {}): SoundDef => ({ id, bus: "sfx", url: `${id}.ogg`, ...extra });

describe("bounded audio graph lifecycle", () => {
  test("the event wire restarts a stolen loop on a new start request while cancelled pending sources stay absent", async () => {
    const mock = installGraph();
    const pending = new Map<string, (value: any) => void>();
    globalThis.fetch = ((url: string) => new Promise((resolve) => pending.set(url, resolve))) as any;
    const allocator = createVoiceAllocator({ maxTotal: 1 });
    const engine = createAudioEngine({ voiceAllocator: allocator, sounds: { a: sample("a"), b: sample("b", { priority: 10 }) } });
    const handlers = new Map<string, (payload: any) => void>();
    const events: AudioEventBus = { on(event, handler) { handlers.set(event, handler); return () => { handlers.delete(event); }; } };
    const detach = attachAudioEventWire(events, engine);
    const emit = (event: string, payload: any) => handlers.get(event)!(payload);
    emit("audio.loopStart", { id: "a", sound: "a" });
    emit("audio.loopStart", { id: "a", sound: "a" });
    expect(allocator.snapshot().voices.map((voice) => voice.id)).toEqual([1]);
    emit("audio.loopStart", { id: "b", sound: "b" });
    pending.get("a.ogg")!({ arrayBuffer: async () => new ArrayBuffer(8) });
    await flush();
    expect(mock.nodes.filter((node) => node.kind === "bufferSource")).toHaveLength(0);
    emit("audio.loopStop", { id: "b" });
    emit("audio.loopStart", { id: "a", sound: "a" });
    await flush();
    expect(allocator.snapshot().voices.map((voice) => voice.soundId)).toEqual(["a"]);
    expect(mock.nodes.filter((node) => node.kind === "bufferSource")).toHaveLength(1);
    pending.get("b.ogg")!({ arrayBuffer: async () => new ArrayBuffer(8) });
    await flush();
    expect(mock.nodes.filter((node) => node.kind === "bufferSource")).toHaveLength(1);
    detach();
    expect(allocator.snapshot().voices).toHaveLength(0);
    engine.dispose();
  });

  for (const failure of ["construction", "start"] as const) {
    test(`procedural ${failure} failure stops earlier voices and releases partial graphs and reservations`, () => {
      const mock = installGraph();
      if (failure === "construction") {
        mock.context.createBiquadFilter = () => { throw new Error("cannot allocate filter"); };
      } else {
        const createSource = mock.context.createBufferSource;
        mock.context.createBufferSource = () => {
          const source = createSource();
          source.start = () => { throw new Error("cannot start source"); };
          return source;
        };
      }
      const allocator = createVoiceAllocator({ maxTotal: 1 });
      const engine = createAudioEngine({ voiceAllocator: allocator, sounds: { ping: {
        id: "ping", bus: "sfx", spatial: { panning: "equalpower" },
        synth: { voices: [{ kind: "tone", freq: 440, duration: 1 }, { kind: "noise", filterFreq: 1000, duration: 1 }] },
      } } });
      expect(() => engine.playOneShot("ping")).not.toThrow();
      expect(allocator.snapshot().voices).toHaveLength(0);
      const oscillator = mock.nodes.find((node) => node.kind === "oscillator");
      expect(oscillator.stopCount).toBe(2);
      expect(mock.nodes.slice(3).every((node) => node.disconnectCount === 1)).toBe(true);
      engine.dispose();
    });
  }

  test("empty procedural patches release their reservation and output graph immediately", () => {
    const mock = installGraph();
    const allocator = createVoiceAllocator({ maxTotal: 1 });
    const engine = createAudioEngine({ voiceAllocator: allocator, sounds: { empty: {
      id: "empty", bus: "sfx", synth: { voices: [] }, spatial: { panning: "equalpower" },
    } } });
    engine.playOneShot("empty");
    expect(allocator.snapshot().voices).toHaveLength(0);
    expect(mock.nodes.slice(3).map((node) => node.disconnectCount)).toEqual([1, 1]);
    engine.dispose();
  });

  test("sample graph construction failure releases partial nodes and reservations", async () => {
    const mock = installGraph();
    mock.context.createBiquadFilter = () => { throw new Error("cannot allocate filter"); };
    const allocator = createVoiceAllocator({ maxTotal: 1 });
    const engine = createAudioEngine({ voiceAllocator: allocator, sounds: { loop: sample("loop") } });
    engine.playLoop("loop");
    await flush();
    expect(allocator.snapshot().voices).toHaveLength(0);
    expect(mock.nodes.slice(3).every((node) => node.disconnectCount === 1)).toBe(true);
    engine.dispose();
  });

  test("reject policy and per-sound limits apply before loading or constructing sources", async () => {
    const mock = installGraph();
    let fetchCount = 0;
    globalThis.fetch = (async () => { fetchCount += 1; return { arrayBuffer: async () => new ArrayBuffer(8) }; }) as any;
    const engine = createAudioEngine({ maxVoices: 2, voiceOverflow: "reject", sounds: {
      a: sample("a", { maxVoices: 1 }), b: sample("b"), c: sample("c", { priority: 100 }),
    } });
    engine.playLoop("a");
    expect(engine.playLoop("a")).toBeNull();
    engine.playLoop("b");
    expect(engine.playLoop("c")).toBeNull();
    expect(fetchCount).toBe(2);
    await flush();
    expect(mock.nodes.filter((node) => node.kind === "bufferSource")).toHaveLength(2);
    engine.setVoiceLimit(2, "steal-lowest");
    engine.playLoop("c");
    await flush();
    expect(mock.nodes.filter((node) => node.kind === "bufferSource")[0].stopCount).toBe(1);
    engine.dispose();
  });

  test("reserves pending loads, rejects lower priority, and cancels stolen sources before creation", async () => {
    const mock = installGraph();
    let resolveFetch!: (value: any) => void;
    globalThis.fetch = (() => new Promise((resolve) => { resolveFetch = resolve; })) as any;
    const allocator = createVoiceAllocator({ maxTotal: 1 });
    const engine = createAudioEngine({ voiceAllocator: allocator, sounds: {
      low: sample("low"), high: sample("high", { priority: 10 }),
    } });
    const low = engine.playLoop("low")!;
    expect(allocator.snapshot().voices.map((voice) => voice.soundId)).toEqual(["low"]);
    const lowFetch = resolveFetch;
    const high = engine.playLoop("high")!;
    expect(engine.playLoop("low")).toBeNull();
    lowFetch({ arrayBuffer: async () => new ArrayBuffer(8) });
    await flush();
    expect(mock.nodes.filter((node) => node.kind === "bufferSource")).toHaveLength(0);
    resolveFetch({ arrayBuffer: async () => new ArrayBuffer(8) });
    await flush();
    expect(mock.nodes.filter((node) => node.kind === "bufferSource")).toHaveLength(1);
    low.stop();
    expect(allocator.snapshot().voices).toHaveLength(1);
    high.stop();
    expect(allocator.snapshot().voices).toHaveLength(0);
    engine.dispose();
  });

  test("retunes live voices by priority and disconnects every per-voice stage exactly once", async () => {
    const mock = installGraph();
    const allocator = createVoiceAllocator({ maxTotal: 3 });
    const engine = createAudioEngine({ voiceAllocator: allocator, sounds: {
      low: sample("low", { spatial: { panning: "hrtf" } }), high: sample("high", { priority: 10 }),
    } });
    const low = engine.playLoop("low")!;
    engine.playLoop("high");
    await flush();
    const sources = mock.nodes.filter((node) => node.kind === "bufferSource");
    const lowGraph = [sources[0]];
    let next = sources[0].connections[0];
    const bus = mock.nodes[2];
    while (next && next !== bus) {
      lowGraph.push(next);
      next = next.connections[0];
    }
    engine.setVoiceLimit(1);
    expect(allocator.snapshot().voices.map((voice) => voice.soundId)).toEqual(["high"]);
    expect(sources[0].stopCount).toBe(1);
    expect(lowGraph.every((node) => node.disconnectCount === 1)).toBe(true);
    low.stop();
    expect(sources[0].stopCount).toBe(1);
    engine.setVoiceLimit(0);
    expect(sources[1].stopCount).toBe(1);
    expect(engine.playLoop("high")).toBeNull();
    engine.dispose();
    engine.dispose();
    expect(mock.context.closeCount).toBe(1);
  });

  test("natural sample end releases the budget and detaches source, gain, and panner", async () => {
    const mock = installGraph();
    const allocator = createVoiceAllocator({ maxTotal: 1 });
    const engine = createAudioEngine({ voiceAllocator: allocator, buses: { sfx: { id: "sfx", gain: 0.7 } }, sounds: { ping: sample("ping", { gain: 0.3, spatial: { panning: "hrtf" } }) } });
    engine.setMasterGain(0.5);
    engine.playOneShot("ping", { x: -3, y: 2, z: -4 });
    await flush();
    const source = mock.nodes.find((node) => node.kind === "bufferSource");
    const userGain = source.connections[0];
    const baseGain = userGain.connections[0];
    const panner = baseGain.connections[0];
    expect(baseGain.gain.value).toBe(0.3);
    expect(panner.kind).toBe("panner");
    expect(panner.position).toEqual([-3, 2, -4]);
    expect(panner.panningModel).toBe("HRTF");
    const bus = panner.connections[0];
    const master = bus.connections[0];
    expect(bus.gain.value).toBe(0.7);
    expect(master.gain.value).toBe(0.5);
    expect(master.connections[0]).toBe(mock.context.destination);
    source.end();
    expect(allocator.snapshot().voices).toHaveLength(0);
    expect([source, userGain, baseGain, panner].map((node) => node.disconnectCount)).toEqual([1, 1, 1, 1]);
    engine.dispose();
    expect(source.disconnectCount).toBe(1);
    expect([bus.disconnectCount, master.disconnectCount]).toEqual([1, 1]);
  });

  test("copies caller positions and applies pending loop updates without double attenuation", async () => {
    const mock = installGraph();
    const engine = createAudioEngine({ sounds: { loop: sample("loop", { gain: 0.4, spatial: { panning: "equalpower", rolloff: 2, refDistance: 5, maxDistance: 90 } }) } });
    const listener = { x: 0, y: 0, z: 0 };
    engine.setListenerPose(listener);
    listener.x = 100;
    const position = { x: -1, y: 2, z: -3 };
    const handle = engine.playLoop("loop", position)!;
    position.x = 50;
    const next = { x: -8, y: 1, z: -9 };
    handle.setPosition(next);
    next.x = 70;
    handle.setGain(0.6);
    await flush();
    const source = mock.nodes.find((node) => node.kind === "bufferSource");
    const userGain = source.connections[0].connections[0].connections[0];
    const baseGain = userGain.connections[0];
    const panner = baseGain.connections[0];
    expect(panner.position).toEqual([-8, 1, -9]);
    expect(userGain.gain.value).toBe(0.6);
    expect(baseGain.gain.value).toBe(0.4);
    expect(panner.rolloffFactor).toBe(2);
    expect(panner.refDistance).toBe(5);
    expect(panner.maxDistance).toBe(90);
    handle.setPosition({ x: 3, y: 4, z: 5 });
    expect(panner.position).toEqual([3, 4, 5]);
    engine.setListenerPose({ x: 5, y: 0, z: 0 });
    expect(baseGain.gain.value).toBe(0.4);
    expect(mock.listener.forwardZ.value).toBe(-1);
    expect(mock.listener.upY.value).toBe(1);
    engine.dispose();
  });

  test("keeps nonspatial UI flat and retains scalar falloff for legacy positional sounds", async () => {
    const mock = installGraph();
    const engine = createAudioEngine({ sounds: {
      ui: sample("ui", { positional: false, gain: 0.25, spatial: { panning: "hrtf" } }),
      legacy: sample("legacy", { gain: 0.5, falloff: { minDistance: 0, maxDistance: 10 } }),
    } });
    engine.playOneShot("ui", { x: 100, y: 0, z: 0 });
    engine.playOneShot("legacy", { x: 5, y: 0, z: 0 });
    await flush();
    const sources = mock.nodes.filter((node) => node.kind === "bufferSource");
    const gains = sources.map((source) => source.connections[0].connections[0]);
    expect(gains.map((node) => node.gain.value)).toEqual([0.25, 0.25]);
    expect(mock.nodes.filter((node) => node.kind === "panner")).toHaveLength(0);
    engine.setListenerPose({ x: 5, y: 0, z: 0 });
    expect(gains.map((node) => node.gain.value)).toEqual([0.25, 0.5]);
    engine.dispose();
  });

  test("stopped pending loops and disposed engines never start late sources", async () => {
    const mock = installGraph();
    let resolveFetch!: (value: any) => void;
    globalThis.fetch = (() => new Promise((resolve) => { resolveFetch = resolve; })) as any;
    const allocator = createVoiceAllocator();
    const engine = createAudioEngine({ voiceAllocator: allocator, sounds: { loop: sample("loop") } });
    engine.playLoop("loop")!.stop();
    engine.playOneShot("loop");
    engine.dispose();
    const nodeCount = mock.nodes.length;
    engine.playOneShot("loop");
    engine.setBusGain("new", 1);
    expect(engine.playLoop("loop")).toBeNull();
    resolveFetch({ arrayBuffer: async () => new ArrayBuffer(8) });
    await flush();
    expect(mock.nodes).toHaveLength(nodeCount);
    expect(allocator.snapshot().voices).toHaveLength(0);
  });

  test("failed loads release their reservation for the next cue", async () => {
    installGraph();
    globalThis.fetch = (async () => { throw new Error("missing sample"); }) as any;
    const allocator = createVoiceAllocator({ maxTotal: 1 });
    const engine = createAudioEngine({ voiceAllocator: allocator, sounds: { loop: sample("loop") } });
    engine.playLoop("loop");
    await flush();
    expect(allocator.snapshot().voices).toHaveLength(0);
    engine.dispose();
  });

  test("procedural cue keeps its reservation until all voices end and releases the whole graph", () => {
    const mock = installGraph();
    const allocator = createVoiceAllocator({ maxTotal: 1 });
    const engine = createAudioEngine({ voiceAllocator: allocator, sounds: { ping: {
      id: "ping", bus: "sfx", gain: 0.2, spatial: { panning: "equalpower" },
      synth: { voices: [{ kind: "tone", freq: 440, duration: 0.1 }, { kind: "noise", filterFreq: 1000, duration: 0.2 }] },
    } } });
    engine.playOneShot("ping");
    const oscillator = mock.nodes.find((node) => node.kind === "oscillator");
    const noise = mock.nodes.find((node) => node.kind === "bufferSource");
    oscillator.end();
    expect(allocator.snapshot().voices).toHaveLength(1);
    noise.end();
    expect(allocator.snapshot().voices).toHaveLength(0);
    expect(mock.nodes.filter((node) => !["destination"].includes(node.kind)).slice(2).every((node) => node.disconnectCount === 1)).toBe(true);
    engine.dispose();
  });

  test("stealing a procedural cue stops scheduled sources and releases its panner", () => {
    const mock = installGraph();
    const engine = createAudioEngine({ maxVoices: 1, sounds: { ping: {
      id: "ping", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 440, duration: 1 }] }, spatial: { panning: "equalpower" },
    } } });
    engine.playOneShot("ping");
    const first = mock.nodes.find((node) => node.kind === "oscillator");
    const panner = mock.nodes.find((node) => node.kind === "panner");
    engine.playOneShot("ping");
    expect(first.stopCount).toBe(2);
    expect(first.disconnectCount).toBe(1);
    expect(panner.disconnectCount).toBe(1);
    engine.dispose();
  });
});
