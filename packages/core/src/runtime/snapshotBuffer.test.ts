import { describe, expect, test } from "bun:test";
import { createSnapshotBuffer } from "./snapshotBuffer";

describe("snapshot buffer", () => {
  test("samples alpha between two delayed samples", () => {
    const buffer = createSnapshotBuffer<number>({ delayMs: 100, capacity: 4 });
    buffer.push(0, 0);
    buffer.push(100, 10);
    expect(buffer.sampleAt(150)).toEqual({ before: 0, after: 10, alpha: 0.5 });
  });

  test("clamps at either end and drops old entries", () => {
    const buffer = createSnapshotBuffer<number>({ delayMs: 0, capacity: 2 });
    buffer.push(0, 0);
    buffer.push(10, 10);
    buffer.push(20, 20);
    expect(buffer.sampleAt(0)).toEqual({ before: 10, after: 10, alpha: 0 });
    expect(buffer.sampleAt(100)).toEqual({ before: 20, after: 20, alpha: 1 });
    expect(buffer.snapshot().entries).toHaveLength(2);
  });
});
