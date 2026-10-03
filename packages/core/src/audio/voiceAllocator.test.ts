import { describe, expect, test } from "bun:test";

import { createVoiceAllocator, type VoiceAllocatorSnapshot } from "./voiceAllocator";

describe("voice allocator", () => {
  test("protects priority and steals the oldest equal-priority reservation", () => {
    const allocator = createVoiceAllocator({ maxTotal: 2 });
    expect(allocator.request("a", 5)).toEqual({ ok: true, voiceId: 1, stolen: [] });
    expect(allocator.request("b", 10)).toEqual({ ok: true, voiceId: 2, stolen: [] });
    expect(allocator.request("c", 4)).toEqual({ ok: false });
    expect(allocator.request("c", 5)).toEqual({ ok: true, voiceId: 3, stolen: [1] });
    allocator.release(2);
    allocator.release(2);
    expect(allocator.snapshot().voices.map((voice) => voice.id)).toEqual([3]);
  });

  test("enforces a sound cap without interrupting another sound", () => {
    const allocator = createVoiceAllocator({ maxTotal: 4 });
    allocator.request("a", 2, 1);
    allocator.request("b", -1);
    expect(allocator.request("a", 1, 1)).toEqual({ ok: false });
    expect(allocator.request("a", 2, 1)).toEqual({ ok: true, voiceId: 3, stolen: [1] });
    expect(allocator.snapshot().voices.map((voice) => voice.soundId)).toEqual(["b", "a"]);
    expect(allocator.request("muted", 20, 0)).toEqual({ ok: false });
  });

  test("retunes immediately and supports a zero playback budget", () => {
    const allocator = createVoiceAllocator({ maxTotal: 4 });
    allocator.request("a", 2);
    allocator.request("b", 1);
    allocator.request("c", 1);
    expect(allocator.retune({ maxTotal: 1 })).toEqual([2, 3]);
    expect(allocator.snapshot().voices.map((voice) => voice.id)).toEqual([1]);
    expect(allocator.retune({ maxTotal: 0 })).toEqual([1]);
    expect(allocator.request("a", 99)).toEqual({ ok: false });
  });

  test("reject policy keeps existing voices even when a higher-priority cue arrives", () => {
    const allocator = createVoiceAllocator({ maxTotal: 1, overflow: "reject" });
    allocator.request("a", 0);
    expect(allocator.request("b", 100)).toEqual({ ok: false });
    allocator.retune({ overflow: "steal-lowest" });
    expect(allocator.request("b", 100)).toEqual({ ok: true, voiceId: 2, stolen: [1] });
  });

  test("injects storage and detaches snapshots and restores", () => {
    let stored: VoiceAllocatorSnapshot = { nextId: 1, voices: [] };
    const allocator = createVoiceAllocator({ maxTotal: 2, storage: { read: () => stored, write: (next) => { stored = next; } } });
    allocator.request("a", 3);
    const snapshot = allocator.snapshot();
    snapshot.voices[0]!.priority = 100;
    expect(stored.voices[0]!.priority).toBe(3);
    allocator.restore(snapshot);
    snapshot.voices.length = 0;
    expect(allocator.snapshot().voices).toHaveLength(1);
    const replay = createVoiceAllocator({ maxTotal: 2 });
    replay.restore(allocator.snapshot());
    expect(replay.request("b")).toEqual(allocator.request("b"));
  });

  test("rejects invalid policies and invalid restored identities atomically", () => {
    const allocator = createVoiceAllocator({ maxTotal: 1 });
    allocator.request("a");
    const before = allocator.snapshot();
    expect(() => allocator.restore({ nextId: 2, voices: [{ id: 2, soundId: "b", priority: 0 }] })).toThrow();
    expect(() => allocator.retune({ maxTotal: Infinity })).toThrow();
    expect(() => allocator.request("a", NaN)).toThrow();
    expect(() => allocator.request("a", 1, -1)).toThrow();
    expect(allocator.snapshot()).toEqual(before);
  });
});
