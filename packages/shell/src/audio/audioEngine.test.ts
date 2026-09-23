import { afterEach, describe, expect, test } from "bun:test";

import { createAudioEngine } from "./audioEngine";

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
  const nodes: { kind: string; position?: [number, number, number] }[] = [];
  const node = (kind: string) => {
    const current = { kind };
    const result = {
      kind,
      connect: () => result,
      disconnect: () => undefined,
      gain: param(1),
      frequency: param(440),
      playbackRate: param(1),
      start: () => undefined,
      stop: () => undefined,
      type: "sine",
      buffer: null,
      loop: false,
      positionX: param(),
      positionY: param(),
      positionZ: param(),
      get position() { return [this.positionX.value, this.positionY.value, this.positionZ.value] as [number, number, number]; },
      set panningModel(_: string) { /* mock setter */ },
      set distanceModel(_: string) { /* mock setter */ },
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
    resume: async () => undefined, close: async () => undefined,
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

    engine.setListenerPose({ position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } });
    engine.playOneShot("ping", { x: -2, y: 0, z: -4 });

    expect(mock.listener.forwardZ.value).toBe(-1);
    expect(mock.listener.upY.value).toBe(1);
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
