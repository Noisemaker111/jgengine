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

  function loopHarness() {
    const created: {
      sound: string;
      at?: { x: number; y: number; z: number };
      calls: ReturnType<typeof fakeHandle>["calls"];
    }[] = [];
    const bus = busStub();
    const detach = attachAudioEventWire(bus.events, {
      playOneShot: () => undefined,
      playMusic: () => undefined,
      resume: () => undefined,
      playLoop: (sound, position) => {
        const { handle, calls } = fakeHandle();
        created.push({ sound, at: position, calls });
        return handle;
      },
    });
    return { bus, created, detach };
  }

  test("retained loops: start once, live-update rate/gain/position, then stop", () => {
    const { bus, created } = loopHarness();

    bus.emit("audio.loopStart", { id: "engine", sound: "hum", at: [1, 0, 2] });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ sound: "hum", at: { x: 1, y: 0, z: 2 } });

    bus.emit("audio.loopSet", { id: "engine", rate: 2, gain: 0.5, at: [3, 4, 5] });
    expect(created[0]?.calls.rate).toEqual([2]);
    expect(created[0]?.calls.gain).toEqual([0.5]);
    expect(created[0]?.calls.pos).toEqual([{ x: 3, y: 4, z: 5 }]);

    // Only the provided params are applied.
    bus.emit("audio.loopSet", { id: "engine", rate: 3 });
    expect(created[0]?.calls.rate).toEqual([2, 3]);
    expect(created[0]?.calls.gain).toEqual([0.5]);

    bus.emit("audio.loopStop", { id: "engine" });
    expect(created[0]?.calls.stopped).toBe(1);

    // A set that races past a stop is a silent no-op — no throw, nothing applied.
    expect(() => bus.emit("audio.loopSet", { id: "engine", rate: 1 })).not.toThrow();
    expect(created[0]?.calls.rate).toEqual([2, 3]);
  });

  test("retained loops: same id + same sound is idempotent; a different sound replaces", () => {
    const { bus, created } = loopHarness();

    bus.emit("audio.loopStart", { id: "engine", sound: "hum" });
    bus.emit("audio.loopStart", { id: "engine", sound: "hum" });
    expect(created).toHaveLength(1);
    expect(created[0]?.calls.stopped).toBe(0);

    bus.emit("audio.loopStart", { id: "engine", sound: "hum2" });
    expect(created).toHaveLength(2);
    expect(created[0]?.calls.stopped).toBe(1);
    expect(created[1]?.sound).toBe("hum2");
  });

  test("setLoop on an unknown id is a silent no-op", () => {
    const { bus, created } = loopHarness();
    expect(() => bus.emit("audio.loopSet", { id: "ghost", rate: 2, gain: 0.1 })).not.toThrow();
    expect(created).toHaveLength(0);
  });

  test("detach stops every live retained loop", () => {
    const { bus, created, detach } = loopHarness();
    bus.emit("audio.loopStart", { id: "a", sound: "x" });
    bus.emit("audio.loopStart", { id: "b", sound: "y" });
    detach();
    expect(created.map((c) => c.calls.stopped)).toEqual([1, 1]);
  });
});
