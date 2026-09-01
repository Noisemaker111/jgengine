import { describe, expect, test } from "bun:test";
import { createPredictionBuffer } from "./prediction";

const input = (tick: number) => ({ held: [String(tick)] });

describe("prediction buffer", () => {
  test("replays matching inputs with zero error", () => {
    const buffer = createPredictionBuffer<number>({ initial: 0, maxTicks: 8, step: (state, frame) => state + Number(frame.held[0]) });
    buffer.record(input(1));
    buffer.record(input(2));
    const result = buffer.reconcile(1, 1);
    expect(result.error).toBe(0);
    expect(result.state).toBe(3);
    expect(result.replayed).toBe(1);
  });

  test("bounds history and restores state", () => {
    const buffer = createPredictionBuffer<number>({ initial: 0, maxTicks: 2, step: (state) => state + 1 });
    buffer.record(input(1)); buffer.record(input(2)); buffer.record(input(3));
    expect(buffer.snapshot().records).toHaveLength(2);
    const saved = buffer.snapshot();
    buffer.record(input(4));
    buffer.restore(saved);
    expect(buffer.state()).toBe(saved.predicted);
  });
});
