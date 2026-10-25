import { describe, expect, test } from "bun:test";

import type { MusicTheme } from "@jgengine/core/audio/music";

import { MusicDirector } from "./musicDirector";

/** Every node is a stub whose params accept any automation and whose `start(when)` is recorded. */
function fakeContext() {
  const starts: number[] = [];
  const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = (): Record<string, unknown> =>
    new Proxy({} as Record<string, unknown>, {
      get(target, key: string) {
        if (key in target) return target[key];
        if (key === "start") return (when: number) => starts.push(when);
        if (key === "connect") return (next: unknown) => next;
        if (key === "buffer" || key === "type" || key === "Q") return target[key];
        if (["gain", "frequency", "detune", "playbackRate", "threshold", "knee", "ratio", "attack", "release"].includes(key)) {
          target[key] = param();
          return target[key];
        }
        return () => undefined;
      },
      set(target, key: string, value) {
        target[key] = value;
        return true;
      },
    });
  const ctx = {
    currentTime: 10,
    sampleRate: 8000,
    createGain: node,
    createOscillator: node,
    createBiquadFilter: node,
    createBufferSource: node,
    createDynamicsCompressor: node,
    createConvolver: node,
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
  };
  return { ctx: ctx as unknown as BaseAudioContext, starts };
}

// One note per beat at 60 bpm: beat n sounds n seconds after the loop starts.
const clock: MusicTheme = {
  id: "clock",
  bpm: 60,
  bars: 4,
  events: Array.from({ length: 16 }, (_, beat) => ({ beat, midi: 60, dur: 0.5, vel: 0.5, inst: "squareLead" as const })),
};

describe("MusicDirector offset", () => {
  test("a crossfade with an offset starts the theme that far into its loop", () => {
    const { ctx, starts } = fakeContext();
    const director = new MusicDirector(ctx, {} as AudioNode, { clock });
    director.crossfadeTo("clock", { offset: 5.5 });
    (ctx as unknown as { currentTime: number }).currentTime = 10.2;
    (director as unknown as { tick(): void }).tick();
    director.dispose();
    // Start lands at now + 0.15 = 10.15, which is 5.5 s into the loop: beat 6 is due 0.5 s later.
    const onsets = [...new Set(starts.map((when) => Number(when.toFixed(2))))].sort((a, b) => a - b);
    expect(onsets[0]).toBe(10.65);
    expect(onsets).toEqual([10.65]);
  });

  test("without an offset the loop starts at its first beat", () => {
    const { ctx, starts } = fakeContext();
    const director = new MusicDirector(ctx, {} as AudioNode, { clock });
    director.crossfadeTo("clock");
    (director as unknown as { tick(): void }).tick();
    director.dispose();
    const onsets = [...new Set(starts.map((when) => Number(when.toFixed(2))))].sort((a, b) => a - b);
    expect(onsets).toEqual([10.15]);
  });
});
