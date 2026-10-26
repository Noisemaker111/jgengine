import { describe, expect, test } from "bun:test";

import type { SceneRaycastInput } from "@jgengine/core/scene/sceneRaycast";

import { createReverbRack, sampleEnclosure } from "./reverbRack.view";

describe("sampleEnclosure", () => {
  test("casts one ceiling ray and six wall rays, world geometry only, and reports their distances", () => {
    const seen: SceneRaycastInput[] = [];
    const source = {
      raycast(input: SceneRaycastInput) {
        seen.push(input);
        return input.direction[1] === 1 ? ({ distance: 3 } as never) : input.direction[0] > 0.9 ? ({ distance: 4 } as never) : null;
      },
    };
    const sample = sampleEnclosure(source, { x: 0, y: 1.5, z: 0 });
    expect(seen).toHaveLength(7);
    expect(seen.every((input) => input.filter?.entities === false && input.filter?.terrain === false)).toBe(true);
    expect(sample.ceiling).toBe(3);
    expect(sample.walls.filter((distance) => distance !== null)).toEqual([4]);
  });
});

describe("createReverbRack", () => {
  function fakeContext() {
    const made: { kind: string; gain?: { value: number; target?: number } }[] = [];
    const node = (kind: string) => {
      const entry = {
        kind,
        connect: () => undefined,
        disconnect: () => undefined,
        buffer: null as unknown,
        type: "",
        frequency: { value: 0 },
        gain: { value: 1, target: undefined as number | undefined, setTargetAtTime(value: number) { entry.gain.target = value; }, cancelScheduledValues() { entry.gain.target = undefined; } },
      };
      made.push(entry);
      return entry;
    };
    const context = {
      currentTime: 0,
      sampleRate: 8000,
      createGain: () => node("gain"),
      createConvolver: () => node("convolver"),
      createBiquadFilter: () => node("filter"),
      createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    };
    return { context: context as unknown as BaseAudioContext, made };
  }

  test("builds a space only when it is first used and fades the old one out as the new one comes in", () => {
    const { context, made } = fakeContext();
    const rack = createReverbRack(context, {} as AudioNode);
    expect(made.filter((entry) => entry.kind === "convolver")).toHaveLength(0);
    rack.select("room");
    rack.select("hall");
    expect(made.filter((entry) => entry.kind === "convolver")).toHaveLength(2);
    const wets = made.filter((entry) => entry.kind === "gain").slice(1);
    expect(wets[0]!.gain!.target).toBe(0);
    expect(wets[1]!.gain!.target).toBeGreaterThan(0);
    expect(rack.state()).toBe("hall");
    rack.select("none");
    expect(wets.every((entry) => entry.gain!.target === 0)).toBe(true);
  });

  test("restore opens straight in the saved space, with no blend from the old one", () => {
    const { context, made } = fakeContext();
    const rack = createReverbRack(context, {} as AudioNode);
    rack.select("room");
    rack.restore(rack.state() === "room" ? "hall" : "room");
    const wets = made.filter((entry) => entry.kind === "gain").slice(1);
    expect(rack.state()).toBe("hall");
    expect(wets[0]!.gain!.value).toBe(0);
    expect(wets[1]!.gain!.value).toBeGreaterThan(0);
    expect(wets.every((entry) => entry.gain!.target === undefined)).toBe(true);
  });
});
