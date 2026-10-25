import { afterEach, describe, expect, test } from "bun:test";
import { ambienceWeights } from "@jgengine/core/audio/ambience";
import { createAudioEngine } from "@jgengine/shell/audio/audioEngine";

import { ZONES } from "../world/zones";
import { ambienceZones, audio, occlusion } from "./catalog";

const forward = { x: 0, y: 0, z: -1 };
const up = { x: 0, y: 1, z: 0 };

function param(value = 1) {
  const result = {
    value,
    ramps: [] as number[],
    setValueAtTime: (next: number) => { result.value = next; },
    setTargetAtTime: (next: number) => { result.value = next; result.ramps.push(next); },
    linearRampToValueAtTime: (next: number) => { result.value = next; },
    exponentialRampToValueAtTime: () => undefined,
  };
  return result;
}

function audioContext() {
  const nodes: any[] = [];
  const node = (kind: string) => {
    const result = {
      kind,
      connect: (target: any) => target,
      disconnect: () => undefined,
      gain: param(1),
      frequency: param(22050),
      playbackRate: param(1),
      start: () => undefined,
      stop: () => undefined,
      onended: null,
      type: "sine",
      buffer: null,
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

async function flush(): Promise<void> {
  for (let index = 0; index < 4; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).fetch;
});

describe("scrap-signal ambience zones", () => {
  test("a zone bed crossfades across its boundary instead of cutting at the line", () => {
    const zone = ambienceZones[0]!;
    const center = (zone.shape as { center: [number, number, number] }).center;
    const radius = (zone.shape as { radius: number }).radius;
    const fade = zone.crossfade ?? 4;

    const levelAt = (distance: number) => {
      const weights = ambienceWeights(ambienceZones, center[0] + distance, 0, center[2]);
      return (weights.find((entry) => entry.id === zone.id)?.weight ?? 0) * (zone.gain ?? 1);
    };

    const deep = levelAt(radius - fade);
    const line = levelAt(radius);
    const edge = levelAt(radius + fade);
    expect(deep).toBeCloseTo(zone.gain ?? 1, 5);
    expect(line).toBeCloseTo((zone.gain ?? 1) / 2, 5);
    expect(edge).toBeCloseTo(0, 5);

    // Walking out, the bed loses level in small steps: no frame drops it by more than a fade step.
    const stepSize = 0.5;
    let previous = levelAt(radius - fade - 2);
    for (let distance = radius - fade - 2 + stepSize; distance <= radius + fade + 2; distance += stepSize) {
      const next = levelAt(distance);
      expect(previous - next).toBeLessThan(0.02);
      previous = next;
    }
  });

  test("two zones that share a boundary hand the bed over with no gap", () => {
    const left = { id: "left", sound: "amb_industry", shape: { kind: "sphere" as const, center: [0, 0, 0] as [number, number, number], radius: 60 }, crossfade: 24, gain: 0.5 };
    const right = { id: "right", sound: "amb_industry", shape: { kind: "sphere" as const, center: [120, 0, 0] as [number, number, number], radius: 60 }, crossfade: 24, gain: 0.5 };
    for (let x = 50; x <= 70; x += 1) {
      const weights = ambienceWeights([left, right], x, 0, 0);
      const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
      expect(total).toBeGreaterThan(0.999);
    }
  });
});

describe("scrap-signal occlusion", () => {
  // The engine owns the line test and its per-tick budget (shell audioEngine tests cover the gain);
  // Scrap's part is the policy it hands over, so that is what is asserted here.
  test("scrap keeps occlusion on, budgeted, and darker behind a wall", () => {
    expect(audio.occlusion).not.toBe(false);
    expect(occlusion.maxTestsPerTick).toBe(6);
    expect(occlusion.attenuation).toBeCloseTo(0.5, 5);
    expect(occlusion.lowpassHz!).toBeLessThan(4000);
    expect(occlusion.maxDistance!).toBeGreaterThan(50);
  });

  test("the machine emitters occlusion acts on are retained positional loops", () => {
    for (const id of ["mach_hum", "gate_drone", "lamp_buzz", "elec_crackle"]) {
      expect(audio.sounds[id]?.loop).toBe(true);
      expect(audio.sounds[id]?.positional).toBe(true);
    }
  });
});