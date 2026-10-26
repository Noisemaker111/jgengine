import { describe, expect, test } from "bun:test";

import {
  createSequenceDirector,
  type EmittedCue,
  type SequenceCue,
} from "./sequenceDirector";

const CUES: readonly SequenceCue[] = [
  { atMs: 0, kind: "camera", payload: { to: "wide" }, id: "open" },
  { atMs: 1000, kind: "dialogue", payload: { text: "It begins." }, id: "line-1" },
  { atMs: 2500, kind: "dialogue", payload: { text: "Hold the line." }, id: "line-2" },
  { atMs: 4000, kind: "event", payload: { flag: "gate-open" }, id: "finale" },
];

/** A mutable fake clock. */
function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, set: (v: number) => { t = v; }, advance: (d: number) => { t += d; } };
}

function collect(director: ReturnType<typeof createSequenceDirector>): EmittedCue[] {
  const out: EmittedCue[] = [];
  director.onCue((e) => out.push(e));
  return out;
}

describe("createSequenceDirector", () => {
  test("cues fire once, in order, as the clock advances", () => {
    const clock = fakeClock();
    const d = createSequenceDirector({ cues: CUES, now: clock.now });
    const fired = collect(d);
    d.play();
    // The atMs:0 cue fires as soon as play advances the playhead.
    clock.advance(1);
    d.tick();
    expect(fired.map((e) => e.cue.id)).toEqual(["open"]);

    clock.advance(1000); // t = 1001
    d.tick();
    expect(fired.map((e) => e.cue.id)).toEqual(["open", "line-1"]);

    clock.advance(3000); // t = 4001 — jumps past line-2 AND finale in one tick
    d.tick();
    expect(fired.map((e) => e.cue.id)).toEqual(["open", "line-1", "line-2", "finale"]);
    // No double-fire on further ticks.
    clock.advance(1000);
    d.tick();
    expect(fired).toHaveLength(4);
    expect(d.state().done).toBe(true);
  });

  test("a large seek fires every skipped cue exactly once, in order", () => {
    const clock = fakeClock();
    const d = createSequenceDirector({ cues: CUES, now: clock.now });
    const fired = collect(d);
    d.seek(3000); // jumps forward past open, line-1, line-2 (but not finale at 4000)
    expect(fired.map((e) => e.cue.id)).toEqual(["open", "line-1", "line-2"]);
    expect(d.state().firedCount).toBe(3);
  });

  test("backward seek re-arms future cues without re-emitting", () => {
    const clock = fakeClock();
    const d = createSequenceDirector({ cues: CUES, now: clock.now });
    const fired = collect(d);
    d.seek(4000);
    expect(fired).toHaveLength(4);
    d.seek(500); // rewind past line-1/line-2/finale — no emissions
    expect(fired).toHaveLength(4);
    // Playing forward again re-fires the re-armed cues.
    d.seek(2000);
    expect(fired.map((e) => e.cue.id)).toEqual(["open", "line-1", "line-2", "finale", "line-1"]);
  });

  test("pause freezes the playhead; resume continues from there", () => {
    const clock = fakeClock();
    const d = createSequenceDirector({ cues: CUES, now: clock.now });
    d.play();
    clock.advance(1500);
    d.tick();
    d.pause();
    const at = d.state().playheadMs;
    expect(at).toBe(1500);
    // Clock moves while paused — playhead must not.
    clock.advance(5000);
    d.tick();
    expect(d.state().playheadMs).toBe(1500);
    d.play();
    clock.advance(1000);
    d.tick();
    expect(d.state().playheadMs).toBe(2500);
  });

  test("skip fast-forwards, emitting all remaining cues, then marks done", () => {
    const clock = fakeClock();
    const d = createSequenceDirector({ cues: CUES, now: clock.now });
    const fired = collect(d);
    d.play();
    clock.advance(1200);
    d.tick(); // open + line-1
    expect(fired).toHaveLength(2);
    d.skip();
    expect(fired.map((e) => e.cue.id)).toEqual(["open", "line-1", "line-2", "finale"]);
    expect(d.state().done).toBe(true);
    expect(d.state().playing).toBe(false);
  });

  test("stop rewinds to 0 and re-arms every cue", () => {
    const clock = fakeClock();
    const d = createSequenceDirector({ cues: CUES, now: clock.now });
    const fired = collect(d);
    d.seek(4000);
    expect(fired).toHaveLength(4);
    d.stop();
    expect(d.state().playheadMs).toBe(0);
    expect(d.state().firedCount).toBe(0);
    d.seek(1000);
    expect(fired.map((e) => e.cue.id)).toEqual(["open", "line-1", "line-2", "finale", "open", "line-1"]);
  });

  test("snapshot/restore round-trips the playhead and fired set without re-emitting", () => {
    const clock = fakeClock();
    const d = createSequenceDirector({ cues: CUES, now: clock.now });
    collect(d);
    d.seek(2000);
    const snap = d.snapshot();
    expect(snap).toEqual({ playheadMs: 2000, nextIndex: 2, playing: false });

    const clock2 = fakeClock();
    const d2 = createSequenceDirector({ cues: CUES, now: clock2.now });
    const fired2 = collect(d2);
    d2.restore(snap);
    expect(fired2).toHaveLength(0); // restore does not replay
    expect(d2.state().playheadMs).toBe(2000);
    expect(d2.state().firedCount).toBe(2);
    // Continuing from the restored point fires only the remaining cues.
    d2.seek(5000);
    expect(fired2.map((e) => e.cue.id)).toEqual(["line-2", "finale"]);
  });

  test("cues are sorted by atMs regardless of input order; kind is never interpreted", () => {
    const clock = fakeClock();
    const d = createSequenceDirector({
      cues: [
        { atMs: 2000, kind: "🎬-whatever-freeform", payload: 42 },
        { atMs: 500, kind: "camera" },
      ],
      now: clock.now,
    });
    expect(d.cues.map((c) => c.atMs)).toEqual([500, 2000]);
    const fired = collect(d);
    d.seek(2000);
    expect(fired.map((e) => e.cue.kind)).toEqual(["camera", "🎬-whatever-freeform"]);
    expect(fired[1]?.cue.payload).toBe(42);
  });

  test("progress and state reflect the playhead", () => {
    const clock = fakeClock();
    const d = createSequenceDirector({ cues: CUES, now: clock.now });
    expect(d.state().durationMs).toBe(4000);
    expect(d.state().progress).toBe(0);
    d.seek(2000);
    expect(d.state().progress).toBe(0.5);
    d.seek(4000);
    expect(d.state().progress).toBe(1);
    expect(d.state().done).toBe(true);
  });

  test("an empty timeline is immediately done and safe to drive", () => {
    const clock = fakeClock();
    const d = createSequenceDirector({ cues: [], now: clock.now });
    expect(d.state().durationMs).toBe(0);
    expect(d.state().done).toBe(true);
    d.play();
    clock.advance(1000);
    d.tick();
    expect(d.state().done).toBe(true);
  });

  test("rejects a cue with a negative atMs", () => {
    expect(() => createSequenceDirector({ cues: [{ atMs: -1, kind: "bad" }] })).toThrow();
  });
});
