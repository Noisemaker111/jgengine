import { describe, expect, test } from "bun:test";

import type { AudioEmitterHandle } from "./audioEngine";
import { attachAudioEventWire, type AudioEventBus } from "./audioWire";

function busStub() {
  const handlers = new Map<string, (payload?: unknown) => void>();
  const events: AudioEventBus = {
    on(event, handler) {
      handlers.set(event, handler as (payload?: unknown) => void);
      return () => {
        handlers.delete(event);
      };
    },
  };
  return {
    events,
    emit(event: string, payload?: unknown) {
      handlers.get(event)?.(payload);
    },
    has(event: string) {
      return handlers.has(event);
    },
  };
}

function fakeHandle() {
  const calls = {
    rate: [] as number[],
    gain: [] as number[],
    pos: [] as { x: number; y: number; z: number }[],
    stopped: 0,
  };
  const handle: AudioEmitterHandle = {
    setPosition: (p) => calls.pos.push(p),
    setRate: (r) => calls.rate.push(r),
    setGain: (g) => calls.gain.push(g),
    stop: () => {
      calls.stopped += 1;
    },
  };
  return { handle, calls };
}

describe("attachAudioEventWire", () => {
  test("routes audio.play / audio.music / audio.resume to the engine", () => {
    const played: { sound: string; pos?: { x: number; y: number; z: number } }[] = [];
    const music: { theme: string | null; transpose?: number }[] = [];
    let resumes = 0;
    const bus = busStub();
    const detach = attachAudioEventWire(bus.events, {
      playOneShot: (sound, position) => {
        played.push({ sound, pos: position });
      },
      playMusic: (theme, options) => {
        music.push({ theme, transpose: options?.transpose });
      },
      resume: () => {
        resumes += 1;
      },
      playLoop: () => null,
    });

    bus.emit("audio.play", { sound: "hit", at: [1, 2, 3] as const });
    bus.emit("audio.music", { theme: "battle", transpose: 2 });
    bus.emit("audio.resume");

    expect(played).toEqual([{ sound: "hit", pos: { x: 1, y: 2, z: 3 } }]);
    expect(music).toEqual([{ theme: "battle", transpose: 2 }]);
    expect(resumes).toBe(1);

    detach();
    expect(bus.has("audio.play")).toBe(false);
    expect(bus.has("audio.music")).toBe(false);
    expect(bus.has("audio.resume")).toBe(false);

    bus.emit("audio.play", { sound: "miss" });
    expect(played).toHaveLength(1);
  });

  test("omits position and transpose when payload fields are absent", () => {
    const played: unknown[] = [];
    const music: unknown[] = [];
    const bus = busStub();
    attachAudioEventWire(bus.events, {
      playOneShot: (sound, position) => played.push({ sound, position }),
      playMusic: (theme, options) => music.push({ theme, options }),
      resume: () => undefined,
      playLoop: () => null,
    });
    bus.emit("audio.play", { sound: "click" });
    bus.emit("audio.music", { theme: null });
    expect(played).toEqual([{ sound: "click", position: undefined }]);
    expect(music).toEqual([{ theme: null, options: undefined }]);
  });
});
