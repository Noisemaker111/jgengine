import { describe, expect, test } from "bun:test";

import { createLevelSequence } from "./levelSequence";

function levels() {
  return [
    { id: "l1", config: { name: "Level 1" } },
    { id: "l2", config: { name: "Level 2" } },
    { id: "l3", config: { name: "Level 3" } },
  ];
}

describe("createLevelSequence", () => {
  test("idle before start; current() is null and status is idle", () => {
    const sequence = createLevelSequence({ levels: levels() });
    expect(sequence.status()).toBe("idle");
    expect(sequence.current()).toBeNull();
    expect(sequence.progress()).toEqual({ index: 0, total: 3, cleared: [] });
  });

  test("full campaign walkthrough clears every level and completes", () => {
    const sequence = createLevelSequence({ levels: levels() });
    sequence.start();
    expect(sequence.status()).toBe("playing");
    expect(sequence.current()).toEqual({ id: "l1", index: 0, config: { name: "Level 1" }, attempt: 1 });

    sequence.clear();
    expect(sequence.status()).toBe("cleared");
    expect(sequence.current()?.id).toBe("l1");

    expect(sequence.advance()).toBe(true);
    expect(sequence.status()).toBe("playing");
    expect(sequence.current()).toEqual({ id: "l2", index: 1, config: { name: "Level 2" }, attempt: 1 });

    sequence.clear();
    expect(sequence.advance()).toBe(true);
    expect(sequence.current()?.id).toBe("l3");

    sequence.clear();
    expect(sequence.status()).toBe("cleared");
    expect(sequence.advance()).toBe(true);
    expect(sequence.status()).toBe("complete");
    expect(sequence.current()).toBeNull();

    expect(sequence.progress()).toEqual({ index: 3, total: 3, cleared: ["l1", "l2", "l3"] });
  });

  test("retries: fail() returns retry while attempts remain, then failed once exhausted", () => {
    const sequence = createLevelSequence({ levels: levels(), retriesPerLevel: 1 });
    sequence.start();

    expect(sequence.fail()).toBe("retry");
    expect(sequence.status()).toBe("failed");
    expect(sequence.current()?.attempt).toBe(1);

    expect(sequence.retry()).toBe(true);
    expect(sequence.status()).toBe("playing");
    expect(sequence.current()?.attempt).toBe(2);

    expect(sequence.fail()).toBe("failed");
    expect(sequence.status()).toBe("failed");

    expect(sequence.retry()).toBe(false);
    expect(sequence.status()).toBe("failed");
    expect(sequence.progress().cleared).toEqual([]);
  });

  test("fail() with no configured retries is immediately terminal", () => {
    const sequence = createLevelSequence({ levels: levels() });
    sequence.start();
    expect(sequence.fail()).toBe("failed");
    expect(sequence.retry()).toBe(false);
  });

  test("reset mid-run returns to idle and forgets progress", () => {
    const sequence = createLevelSequence({ levels: levels() });
    sequence.start();
    sequence.clear();
    sequence.advance();
    sequence.fail();

    sequence.reset();
    expect(sequence.status()).toBe("idle");
    expect(sequence.current()).toBeNull();
    expect(sequence.progress()).toEqual({ index: 0, total: 3, cleared: [] });

    sequence.start();
    expect(sequence.current()?.id).toBe("l1");
  });

  test("single-level list completes after one clear + advance", () => {
    const sequence = createLevelSequence({ levels: [{ id: "only", config: {} }] });
    sequence.start();
    sequence.clear();
    expect(sequence.advance()).toBe(true);
    expect(sequence.status()).toBe("complete");
    expect(sequence.progress()).toEqual({ index: 1, total: 1, cleared: ["only"] });
  });

  test("empty level list: start() is a no-op and status stays idle forever", () => {
    const sequence = createLevelSequence({ levels: [] });
    sequence.start();
    expect(sequence.status()).toBe("idle");
    expect(sequence.current()).toBeNull();
    expect(sequence.clear()).toBeUndefined();
    expect(sequence.status()).toBe("idle");
    expect(sequence.advance()).toBe(false);
    expect(sequence.fail()).toBe("failed");
    expect(sequence.progress()).toEqual({ index: 0, total: 0, cleared: [] });
  });

  test("clear()/fail() are no-ops outside the playing status", () => {
    const sequence = createLevelSequence({ levels: levels() });
    sequence.clear();
    expect(sequence.status()).toBe("idle");

    sequence.start();
    sequence.clear();
    sequence.clear();
    expect(sequence.status()).toBe("cleared");
    expect(sequence.progress().cleared).toEqual(["l1"]);

    expect(sequence.fail()).toBe("failed");
    expect(sequence.status()).toBe("cleared");
  });

  test("only the first level is unlocked until its predecessor is cleared", () => {
    const sequence = createLevelSequence({ levels: levels() });
    expect(sequence.isUnlocked("l1")).toBe(true);
    expect(sequence.isUnlocked("l2")).toBe(false);
    expect(sequence.isUnlocked("nope")).toBe(false);
    sequence.start();
    sequence.clear();
    expect(sequence.isUnlocked("l2")).toBe(true);
    expect(sequence.isUnlocked("l3")).toBe(false);
  });

  test("select jumps to an unlocked level and refuses a locked one", () => {
    const sequence = createLevelSequence({ levels: levels() });
    expect(sequence.select("l2")).toBe(false);
    sequence.start();
    sequence.clear();
    sequence.advance();
    sequence.clear();
    expect(sequence.select("l1")).toBe(true);
    expect(sequence.current()).toEqual({ id: "l1", index: 0, config: { name: "Level 1" }, attempt: 1 });
    expect(sequence.status()).toBe("playing");
    expect(sequence.select("missing")).toBe(false);
  });

  test("clear records the best star rating, never regressing", () => {
    const sequence = createLevelSequence({ levels: levels() });
    sequence.start();
    sequence.clear(2);
    expect(sequence.record("l1")).toEqual({ cleared: true, stars: 2 });
    sequence.select("l1");
    sequence.clear(1);
    expect(sequence.record("l1")).toEqual({ cleared: true, stars: 2 });
    sequence.select("l1");
    sequence.clear(3);
    expect(sequence.record("l1")).toEqual({ cleared: true, stars: 3 });
    expect(sequence.record("l2")).toBeNull();
  });

  test("records persist across instances through a shared storage backend", () => {
    const data: Record<string, string> = {};
    const storage = {
      getItem: (key: string) => data[key] ?? null,
      setItem: (key: string, value: string) => {
        data[key] = value;
      },
      removeItem: (key: string) => {
        delete data[key];
      },
    };
    const first = createLevelSequence({ levels: levels(), key: "campaign", storage });
    first.start();
    first.clear(3);
    const second = createLevelSequence({ levels: levels(), key: "campaign", storage });
    expect(second.record("l1")).toEqual({ cleared: true, stars: 3 });
    expect(second.isUnlocked("l2")).toBe(true);
    second.clearRecords();
    const third = createLevelSequence({ levels: levels(), key: "campaign", storage });
    expect(third.record("l1")).toBeNull();
    expect(third.isUnlocked("l2")).toBe(false);
  });
});
