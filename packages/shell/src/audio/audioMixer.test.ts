import { afterEach, describe, expect, test } from "bun:test";

import { createAudioEngine, MAX_PENDING_CUES, type AudioLevel } from "./audioEngine";

function param(value = 1) {
  return {
    value,
    setValueAtTime: () => undefined,
    setTargetAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  };
}

/** A context stub that records nodes and can hold itself suspended, like Chrome before a gesture. */
function mixerContext(options: { state?: AudioContextState; rmsSample?: number } = {}) {
  const nodes: any[] = [];
  const node = (kind: string) => {
    const result = {
      kind,
      connections: [] as any[],
      connect(target: any) { result.connections.push(target); return target; },
      disconnect() { result.connections.length = 0; },
      gain: param(),
      frequency: param(440),
      playbackRate: param(1),
      start: () => undefined,
      stop: () => undefined,
      onended: null,
      type: "sine",
      buffer: null,
      loop: false,
      setValueAtTime: () => undefined,
      linearRampToValueAtTime: () => undefined,
      exponentialRampToValueAtTime: () => undefined,
    } as any;
    nodes.push(result);
    return result;
  };
  const sample = options.rmsSample ?? 0;
  let analyserBuilds = 0;
  let gesture = options.state !== "suspended";
  const context: any = {
    currentTime: 0,
    sampleRate: 8000,
    state: options.state ?? "running",
    destination: node("destination"),
    listener: {
      positionX: param(), positionY: param(), positionZ: param(),
      forwardX: param(), forwardY: param(), forwardZ: param(),
      upX: param(), upY: param(), upZ: param(),
    },
    createGain: () => node("gain"),
    createPanner: () => node("panner"),
    createOscillator: () => node("oscillator"),
    createBiquadFilter: () => node("filter"),
    createBufferSource: () => node("bufferSource"),
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createAnalyser: () => {
      analyserBuilds += 1;
      return {
        fftSize: 1024,
        smoothingTimeConstant: 0,
        getFloatTimeDomainData(target: Float32Array) {
          target.fill(sample);
        },
        connect: () => undefined,
        disconnect: () => undefined,
      };
    },
    decodeAudioData: async () => ({ duration: 1 }),
    resume: async () => { if (gesture) context.state = "running"; },
    close: async () => undefined,
  };
  return { context, nodes, analyserBuilds: () => analyserBuilds, grantGesture: () => { gesture = true; }, masterGain: () => nodes.find((entry) => entry.kind === "gain" && entry.connections.some((target: any) => target.kind === "destination")) };
}

function install(mock: ReturnType<typeof mixerContext>) {
  class MockAudioContext {
    constructor() { return mock.context; }
  }
  (globalThis as any).window = { AudioContext: MockAudioContext };
}

const tone = { id: "tone", bus: "sfx", positional: false, synth: { voices: [{ kind: "tone" as const, freq: 440, duration: 0.05 }] } };

afterEach(() => {
  delete (globalThis as any).window;
});

describe("audio bus gain and mute", () => {
  test("a bus gain and mute compose in either order, and unmute restores the gain", () => {
    const mock = mixerContext();
    install(mock);
    const engine = createAudioEngine({ sounds: { tone }, buses: { sfx: { id: "sfx", gain: 0.7 } } });

    expect(engine.busLevel("sfx")).toBeCloseTo(0.7);
    engine.setBusGain("sfx", 0.5);
    expect(engine.busLevel("sfx")).toBe(0.5);

    engine.setBusMute("sfx", true);
    expect(engine.busLevel("sfx")).toBe(0);
    engine.setBusGain("sfx", 0.25);
    expect(engine.busLevel("sfx")).toBe(0);
    engine.setBusMute("sfx", false);
    expect(engine.busLevel("sfx")).toBe(0.25);

    const busNode = mock.nodes.find((node) => node.kind === "gain" && node.connections.length === 1);
    expect(busNode).toBeDefined();
    engine.dispose();
  });

  test("master volume and master mute compose without losing the volume", () => {
    const mock = mixerContext();
    install(mock);
    const engine = createAudioEngine();
    engine.setMasterGain(0.6);
    engine.setMasterMute(true);
    expect(engine.masterLevel()).toBe(0);
    engine.setMasterGain(0.4);
    expect(engine.masterLevel()).toBe(0);
    engine.setMasterMute(false);
    expect(engine.masterLevel()).toBe(0.4);
    expect(mock.masterGain()?.gain.value).toBeCloseTo(0.4);
    engine.dispose();
  });

  test("a muted bus still plays into its node, so unmuting mid-cue resumes it", () => {
    const mock = mixerContext();
    install(mock);
    const engine = createAudioEngine({ sounds: { tone }, buses: { sfx: { id: "sfx" } } });
    engine.setBusMute("sfx", true);
    engine.play("tone");
    expect(mock.nodes.filter((node) => node.kind === "oscillator").length).toBe(1);
    engine.setBusMute("sfx", false);
    expect(engine.busLevel("sfx")).toBe(1);
    engine.dispose();
  });
});

describe("audio autoplay queue", () => {
  test("holds a cue while the context is suspended and plays it after resume", async () => {
    const mock = mixerContext({ state: "suspended" });
    install(mock);
    const engine = createAudioEngine({ sounds: { tone } });
    engine.play("tone");
    expect(mock.nodes.filter((node) => node.kind === "oscillator")).toHaveLength(0);

    mock.grantGesture();
    engine.resume();
    await Promise.resolve();
    await Promise.resolve();
    expect(mock.context.state).toBe("running");
    expect(mock.nodes.filter((node) => node.kind === "oscillator")).toHaveLength(1);
    engine.dispose();
  });

  test("bounds the queue and drops the oldest held cue", async () => {
    const mock = mixerContext({ state: "suspended" });
    install(mock);
    const engine = createAudioEngine({ sounds: { tone } });
    for (let index = 0; index < MAX_PENDING_CUES + 3; index += 1) engine.play("tone");
    mock.grantGesture();
    engine.resume();
    await Promise.resolve();
    await Promise.resolve();
    expect(mock.nodes.filter((node) => node.kind === "oscillator")).toHaveLength(MAX_PENDING_CUES);
    engine.dispose();
  });
});

describe("master level measurement", () => {
  test("reads RMS and peak from one analyser built on first measure", () => {
    const mock = mixerContext({ rmsSample: 0.5 });
    install(mock);
    const engine = createAudioEngine({ sounds: { tone } });
    const first: AudioLevel = engine.measure();
    expect(first.rms).toBeCloseTo(0.5, 5);
    expect(first.peak).toBeCloseTo(0.5, 5);
    engine.measure();
    expect(mock.analyserBuilds()).toBe(1);
    engine.dispose();
  });

  test("a silent engine reports zero, and a disposed engine stays zero", () => {
    const mock = mixerContext({ rmsSample: 0 });
    install(mock);
    const engine = createAudioEngine();
    expect(engine.measure()).toEqual({ rms: 0, peak: 0 });
    engine.dispose();
    expect(engine.measure()).toEqual({ rms: 0, peak: 0 });
  });

  test("no AudioContext available reports zero rather than throwing", () => {
    const engine = createAudioEngine();
    expect(engine.measure().rms).toBe(0);
    expect(engine.busLevel("sfx")).toBe(0);
    engine.play("tone");
    engine.resume();
    engine.dispose();
  });
});
