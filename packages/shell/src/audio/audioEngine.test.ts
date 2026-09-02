import { afterEach, describe, expect, test } from "bun:test";

import { createAudioEngine } from "./audioEngine";

type Param = { value: number; setValueAtTime: () => void; linearRampToValueAtTime: () => void; exponentialRampToValueAtTime: () => void };

function param(value = 0): Param {
  return { value, setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined };
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
