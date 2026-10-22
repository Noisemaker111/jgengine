import { describe, expect, test } from "bun:test";

import { gateTimingMs } from "../../../../scripts/timing-budget";
import { devtools } from "../devtools/devtools";
import { createWaitQueue } from "./queue";

describe("createWaitQueue", () => {
  test("is a first-in first-out line with live positions", () => {
    const line = createWaitQueue();
    expect(line.enqueue("a", 0)).toBe(true);
    expect(line.enqueue("b", 1)).toBe(true);
    expect(line.enqueue("c", 2)).toBe(true);
    expect(line.enqueue("a", 3)).toBe(false);
    expect(line.size()).toBe(3);
    expect(line.has("b")).toBe(true);
    expect(line.has("z")).toBe(false);
    expect(line.positionOf("c")).toBe(2);
    expect(line.positionOf("z")).toBe(-1);
    expect(line.headId()).toBe("a");
    expect(line.at(1)).toBe("b");
    expect(line.at(-1)).toBeNull();
    expect(line.at(9)).toBeNull();
    expect(line.joinedAt("b")).toBe(1);
    expect(line.joinedAt("z")).toBeNull();

    expect(line.dequeue()).toBe("a");
    expect(line.dequeue()).toBe("b");
    expect(line.dequeue()).toBe("c");
    expect(line.dequeue()).toBeNull();
    expect(line.size()).toBe(0);
  });

  test("a guest leaves from the middle without disturbing the order", () => {
    const line = createWaitQueue();
    for (const id of ["a", "b", "c", "d"]) line.enqueue(id, 0);
    expect(line.remove("c")).toBe(true);
    expect(line.remove("c")).toBe(false);
    expect(line.ids()).toEqual(["a", "b", "d"]);
    expect(line.dequeue()).toBe("a");
    expect(line.dequeue()).toBe("b");
    expect(line.dequeue()).toBe("d");
    expect(line.dequeue()).toBeNull();
  });

  test("the wait comes from the queue's own throughput, not a constant", () => {
    const line = createWaitQueue({ seedServiceSeconds: 8 });
    for (let i = 0; i < 6; i += 1) line.enqueue(`g${i}`, 0);

    const seeded = line.wait();
    expect(seeded).toMatchObject({ ahead: 6, seeded: true, throughput: 0 });
    expect(seeded.seconds).toBe(48);

    // A ride boarding 2 guests every 10 s: 0.2 guests per second.
    line.recordBoard(20, 2);
    line.recordBoard(30, 2);

    const measured = line.wait();
    expect(measured.seeded).toBe(false);
    expect(measured.throughput).toBeCloseTo(0.2, 6);
    expect(measured.perGuestSeconds).toBeCloseTo(5, 6);
    expect(measured.seconds).toBeCloseTo(30, 6);
    expect(measured.seconds).not.toBe(seeded.seconds);

    // A guest third in line waits for the two in front, not for the whole line.
    expect(line.wait("g2")).toMatchObject({ ahead: 2, seeded: false });
    expect(line.wait("g2").seconds).toBeCloseTo(10, 6);
    // A guest who has not joined reads the whole line.
    expect(line.wait("stranger").ahead).toBe(6);
  });

  test("a slower cycle raises the estimate without the queue being told a cycle time", () => {
    const fast = createWaitQueue();
    const slow = createWaitQueue();
    for (let i = 0; i < 4; i += 1) {
      fast.enqueue(`f${i}`, 0);
      slow.enqueue(`s${i}`, 0);
    }
    fast.recordBoard(10, 2);
    fast.recordBoard(20, 2);
    slow.recordBoard(40, 2);
    slow.recordBoard(80, 2);

    expect(fast.wait().seconds).toBeCloseTo(20, 6);
    expect(slow.wait().seconds).toBeCloseTo(80, 6);
    expect(slow.wait().seconds).toBeGreaterThan(fast.wait().seconds);
  });

  test("the throughput window keeps only the boardings it was told to", () => {
    const line = createWaitQueue({ window: 2 });
    line.enqueue("a", 0);
    line.recordBoard(0, 100);
    line.recordBoard(10, 2);
    line.recordBoard(20, 2);
    expect(line.snapshot().boards).toEqual([
      { at: 10, count: 2 },
      { at: 20, count: 2 },
    ]);
    expect(line.wait().perGuestSeconds).toBeCloseTo(5, 6);
  });

  test("snapshot/restore round-trips the line, the board window and the seed", () => {
    const line = createWaitQueue({ seedServiceSeconds: 3, window: 4 });
    line.enqueue("a", 5);
    line.enqueue("b", 7);
    line.enqueue("c", 9);
    line.dequeue();
    line.recordBoard(10, 1);
    line.recordBoard(20, 1);
    line.recordBoard(30, 1);

    const saved = line.snapshot();
    const replay = createWaitQueue();
    replay.restore(saved);

    expect(replay.ids()).toEqual(["b", "c"]);
    expect(replay.joinedAt("b")).toBe(7);
    expect(replay.snapshot()).toEqual(saved);
    expect(replay.wait().seconds).toBeCloseTo(line.wait().seconds, 6);
    expect(replay.enqueue("b", 0)).toBe(false);
  });

  test("restore ignores entries and boardings it cannot use", () => {
    const line = createWaitQueue();
    line.enqueue("keep", 1);
    line.restore({
      entries: [{ id: "", joinedAt: 0 }, { id: "keep", joinedAt: Number.NaN }],
      boards: [{ at: Number.NaN, count: 2 }, { at: 4, count: -1 }, { at: 5, count: 3 }],
      seedServiceSeconds: Number.NaN,
      window: 0,
    });
    expect(line.ids()).toEqual(["keep"]);
    expect(line.joinedAt("keep")).toBe(0);
    expect(line.snapshot().boards).toEqual([{ at: 5, count: 3 }]);
  });

  test("the devtools probe shows the live line and unregisters on dispose", () => {
    const line = createWaitQueue({ devtoolsName: "queue:coaster" });
    line.enqueue("a", 0);
    expect(String(devtools.probes.read()["queue:coaster"])).toContain("1 in line");
    line.dispose();
    expect(devtools.probes.read()["queue:coaster"]).toBeUndefined();
  });
});

describe("wait queue cost", () => {
  test("10,000 joins, estimates and departures stay bounded per tick", () => {
    const line = createWaitQueue();
    const tick = (): void => {
      for (let i = 0; i < 100; i += 1) line.enqueue(`g${i}`, 0);
      line.recordBoard(0, 1);
      line.recordBoard(1, 1);
      for (let i = 0; i < 100; i += 1) {
        line.wait(`g${i}`);
        line.dequeue();
      }
    };
    for (let warmup = 0; warmup < 5; warmup += 1) tick();

    const samples: number[] = [];
    for (let sample = 0; sample < 5; sample += 1) {
      const start = performance.now();
      for (let run = 0; run < 100; run += 1) tick();
      samples.push((performance.now() - start) / 100);
    }
    // 100 joins, 100 estimates and 100 departures per tick; fastest 0.02 ms idle (this machine, 2026-10-22).
    gateTimingMs("wait queue tick for 100 guests", samples, 0.5);
  });
});
