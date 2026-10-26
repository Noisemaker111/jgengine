import { describe, expect, test } from "bun:test";

import { appendFeedEntry, recentFeedEntries, type FeedEntry } from "./feed";

function entry(at: number): FeedEntry<number> {
  return { at, data: at };
}

describe("pure feed tier", () => {
  test("appendFeedEntry adds to the end without mutating the input", () => {
    const before: readonly FeedEntry<number>[] = [entry(1)];
    const after = appendFeedEntry(before, entry(2), 10);
    expect(after.map((e) => e.at)).toEqual([1, 2]);
    expect(before.map((e) => e.at)).toEqual([1]);
  });

  test("appendFeedEntry trims from the front to respect the limit", () => {
    let buffer: FeedEntry<number>[] = [];
    for (let at = 1; at <= 5; at++) buffer = appendFeedEntry(buffer, entry(at), 3);
    expect(buffer.map((e) => e.at)).toEqual([3, 4, 5]);
  });

  test("recentFeedEntries returns the tail bounded by the limit", () => {
    const buffer = [entry(1), entry(2), entry(3)];
    expect(recentFeedEntries(buffer, 2).map((e) => e.at)).toEqual([2, 3]);
    expect(recentFeedEntries(buffer).map((e) => e.at)).toEqual([1, 2, 3]);
    expect(recentFeedEntries(buffer, 10).map((e) => e.at)).toEqual([1, 2, 3]);
  });
});
