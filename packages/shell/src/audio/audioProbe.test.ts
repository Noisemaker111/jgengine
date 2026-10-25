import { afterEach, describe, expect, test } from "bun:test";

import type { AudioEngine } from "./audioEngine";
import { installAudioProbe } from "./audioProbe";

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("installAudioProbe", () => {
  test("publishes the engine's spatial mix readout and removes itself on teardown", () => {
    (globalThis as { window?: unknown }).window = {};
    const spatial = { panned: 3, reverbSends: 2, occludedOneShots: 1, reverb: "room" as const, reverbZone: null };
    const engine = { spatialStats: () => spatial } as unknown as AudioEngine;
    const off = installAudioProbe(engine);
    expect(window.__jgengineAudio?.spatial()).toEqual(spatial);
    off();
    expect(window.__jgengineAudio).toBeUndefined();
  });
});
