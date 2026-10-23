import { describe, expect, test } from "bun:test";

import { createCaptionFeed } from "./captions";

function clocked() {
  let t = 0;
  const feed = createCaptionFeed({ now: () => t });
  return { feed, set: (next: number) => { t = next; } };
}

describe("createCaptionFeed", () => {
  test("stacks identical live lines instead of repeating them", () => {
    const { feed, set } = clocked();
    feed.push("Hit 12", "hit");
    set(40);
    const stacked = feed.push("Hit 12", "hit");
    expect(stacked.count).toBe(2);
    expect(feed.list()).toHaveLength(1);
  });

  test("expires lines on the feed clock and keeps the newest cap", () => {
    const { feed, set } = clocked();
    feed.retune({ cap: 2, ttlMs: 1000 });
    feed.push("one");
    feed.push("two");
    feed.push("three");
    expect(feed.list().map((line) => line.text)).toEqual(["two", "three"]);
    set(1001);
    expect(feed.list()).toHaveLength(0);
  });

  test("notifies subscribers on push, prune and clear", () => {
    const { feed, set } = clocked();
    let changes = 0;
    feed.subscribe(() => { changes += 1; });
    feed.push("hit");
    set(5000);
    feed.prune();
    feed.push("kill");
    feed.clear();
    expect(changes).toBe(4);
    expect(feed.list()).toHaveLength(0);
  });

  test("round-trips through a snapshot and restore", () => {
    const { feed } = clocked();
    feed.push("Hit 12", "hit");
    const saved = feed.snapshot();
    feed.clear();
    expect(feed.list()).toHaveLength(0);
    feed.restore(saved);
    expect(feed.list().map((line) => line.text)).toEqual(["Hit 12"]);
  });
});
