import { describe, expect, test } from "bun:test";

import { createObjectiveBanner } from "./objectiveBanner";

/** A controller driven by a mutable clock so tests advance time deterministically. */
function clocked() {
  let t = 0;
  const banners = createObjectiveBanner({ now: () => t });
  return {
    banners,
    set(next: number) {
      t = next;
    },
  };
}

describe("createObjectiveBanner", () => {
  test("starts idle", () => {
    const { banners } = clocked();
    expect(banners.current()).toBeNull();
    expect(banners.isActive()).toBe(false);
    expect(banners.pending()).toBe(0);
  });

  test("announce activates immediately in the fly-in phase at progress 0", () => {
    const { banners } = clocked();
    banners.announce({ title: "WAVE 3", subtitle: "Defend the core", kind: "wave", inMs: 300, holdMs: 2000, outMs: 500 });
    const view = banners.current();
    expect(view).not.toBeNull();
    expect(view!.title).toBe("WAVE 3");
    expect(view!.subtitle).toBe("Defend the core");
    expect(view!.kind).toBe("wave");
    expect(view!.phase).toBe("in");
    expect(view!.progress).toBeCloseTo(0, 5);
    expect(banners.isActive()).toBe(true);
  });

  test("advances through in -> hold -> out with progress 0..1 in each phase", () => {
    const { banners, set } = clocked();
    banners.announce({ title: "VICTORY", inMs: 400, holdMs: 1000, outMs: 400 });

    set(200);
    banners.advance();
    expect(banners.current()!.phase).toBe("in");
    expect(banners.current()!.progress).toBeCloseTo(0.5, 5);

    set(400 + 500); // 500ms into the 1000ms hold
    banners.advance();
    expect(banners.current()!.phase).toBe("hold");
    expect(banners.current()!.progress).toBeCloseTo(0.5, 5);

    set(400 + 1000 + 200); // 200ms into the 400ms fade-out
    banners.advance();
    expect(banners.current()!.phase).toBe("out");
    expect(banners.current()!.progress).toBeCloseTo(0.5, 5);
  });

  test("reaps a banner once its full life ends", () => {
    const { banners, set } = clocked();
    banners.announce({ title: "DONE", inMs: 100, holdMs: 100, outMs: 100 });
    set(300);
    banners.advance();
    expect(banners.current()).toBeNull();
    expect(banners.isActive()).toBe(false);
  });

  test("shows one banner at a time and chains the next deterministically", () => {
    const { banners, set } = clocked();
    banners.announce({ title: "FIRST", inMs: 100, holdMs: 100, outMs: 100 }); // life 300
    banners.announce({ title: "SECOND", inMs: 100, holdMs: 100, outMs: 100 });
    expect(banners.current()!.title).toBe("FIRST");
    expect(banners.pending()).toBe(1);

    set(150);
    banners.advance();
    expect(banners.current()!.title).toBe("FIRST"); // still holding

    set(300); // FIRST life ends -> SECOND starts at 300
    banners.advance();
    expect(banners.current()!.title).toBe("SECOND");
    expect(banners.current()!.phase).toBe("in");
    expect(banners.current()!.progress).toBeCloseTo(0, 5);
    expect(banners.pending()).toBe(0);
  });

  test("chaining is independent of advance frequency", () => {
    const { banners, set } = clocked();
    banners.announce({ title: "A", inMs: 100, holdMs: 100, outMs: 100 }); // life 300
    banners.announce({ title: "B", inMs: 100, holdMs: 100, outMs: 100 });
    // Never advance during A's life; jump straight past its end.
    set(350); // 50ms into B (which is scheduled to start at 300)
    banners.advance();
    expect(banners.current()!.title).toBe("B");
    expect(banners.current()!.phase).toBe("in");
    expect(banners.current()!.progress).toBeCloseTo(0.5, 5);
  });

  test("skip dismisses the active banner and starts the next", () => {
    const { banners } = clocked();
    banners.announce({ title: "A" });
    banners.announce({ title: "B" });
    banners.skip();
    expect(banners.current()!.title).toBe("B");
    banners.skip();
    expect(banners.current()).toBeNull();
  });

  test("clear drops everything", () => {
    const { banners } = clocked();
    banners.announce({ title: "A" });
    banners.announce({ title: "B" });
    banners.clear();
    expect(banners.current()).toBeNull();
    expect(banners.pending()).toBe(0);
  });

  test("kind defaults to 'default' and is never interpreted", () => {
    const { banners } = clocked();
    banners.announce({ title: "X" });
    expect(banners.current()!.kind).toBe("default");
    banners.clear();
    banners.announce({ title: "Y", kind: "custom-boss-phase" });
    expect(banners.current()!.kind).toBe("custom-boss-phase");
  });

  test("subscribe fires on announce/advance/skip/clear and unsubscribe stops it", () => {
    const { banners, set } = clocked();
    let count = 0;
    const off = banners.subscribe(() => {
      count += 1;
    });
    banners.announce({ title: "A", inMs: 10, holdMs: 10, outMs: 10 });
    expect(count).toBe(1);
    set(5);
    banners.advance();
    expect(count).toBe(2);
    off();
    banners.advance();
    expect(count).toBe(2);
  });

  test("snapshot/restore round-trips the queue and re-anchors elapsed time", () => {
    const { banners, set } = clocked();
    banners.announce({ title: "WAVE 3", subtitle: "Hold", kind: "wave", inMs: 400, holdMs: 1000, outMs: 400 });
    set(400 + 500); // mid-hold
    banners.advance();
    const snap = banners.snapshot();

    // Restore into a fresh controller whose clock is far ahead — elapsed re-anchors.
    let t2 = 10_000;
    const restored = createObjectiveBanner({ now: () => t2 });
    restored.restore(snap);
    const view = restored.current();
    expect(view!.title).toBe("WAVE 3");
    expect(view!.subtitle).toBe("Hold");
    expect(view!.phase).toBe("hold");
    expect(view!.progress).toBeCloseTo(0.5, 5);

    // The banner continues from where it was, not from scratch.
    t2 = 10_000 + 500; // another 500ms of hold consumed -> into fade-out
    restored.advance();
    expect(restored.current()!.phase).toBe("out");
  });

  test("zero-duration phases are handled without dividing by zero", () => {
    const { banners, set } = clocked();
    banners.announce({ title: "INSTANT", inMs: 0, holdMs: 100, outMs: 0 });
    expect(banners.current()!.phase).toBe("hold");
    expect(banners.current()!.progress).toBeCloseTo(0, 5);
    set(50);
    banners.advance();
    expect(banners.current()!.phase).toBe("hold");
    set(100);
    banners.advance();
    expect(banners.current()).toBeNull();
  });
});
