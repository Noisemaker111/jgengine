import { describe, expect, test } from "bun:test";
import { createRecordingBuffer } from "@jgengine/core/sensor/recordingBuffer";

describe("recordingBuffer", () => {
  test("append then seek returns the nearest frame at or before t", () => {
    const buffer = createRecordingBuffer<{ x: number }>();
    buffer.append(0, { x: 0 });
    buffer.append(1, { x: 10 });
    buffer.append(2, { x: 20 });
    expect(buffer.seek(1.5)?.data).toEqual({ x: 10 });
    expect(buffer.seek(2)?.data).toEqual({ x: 20 });
    expect(buffer.seek(0)?.data).toEqual({ x: 0 });
  });

  test("seek before the first frame or on an empty buffer returns null", () => {
    const buffer = createRecordingBuffer<number>();
    expect(buffer.seek(0)).toBeNull();
    buffer.append(5, 1);
    expect(buffer.seek(1)).toBeNull();
  });

  test("range returns frames within the inclusive window", () => {
    const buffer = createRecordingBuffer<number>();
    for (let t = 0; t <= 5; t += 1) buffer.append(t, t);
    expect(buffer.range(2, 4).map((f) => f.data)).toEqual([2, 3, 4]);
  });

  test("duration is the span between first and last frame", () => {
    const buffer = createRecordingBuffer<number>();
    expect(buffer.duration()).toBe(0);
    buffer.append(0, 1);
    buffer.append(4, 2);
    expect(buffer.duration()).toBe(4);
  });

  test("maxDurationSeconds evicts frames older than the trailing window", () => {
    const buffer = createRecordingBuffer<number>({ maxDurationSeconds: 2 });
    buffer.append(0, 0);
    buffer.append(1, 1);
    buffer.append(3, 3);
    expect(buffer.frames().map((f) => f.t)).toEqual([1, 3]);
  });

  test("maxFrames caps the buffer, evicting oldest first", () => {
    const buffer = createRecordingBuffer<number>({ maxFrames: 2 });
    buffer.append(0, 0);
    buffer.append(1, 1);
    buffer.append(2, 2);
    expect(buffer.frames().map((f) => f.data)).toEqual([1, 2]);
  });

  test("clear empties the buffer", () => {
    const buffer = createRecordingBuffer<number>();
    buffer.append(0, 1);
    buffer.clear();
    expect(buffer.frames()).toEqual([]);
    expect(buffer.seek(0)).toBeNull();
  });

  test("replay: seek reconstructs a past frame for scrubbing", () => {
    const buffer = createRecordingBuffer<{ position: readonly [number, number, number] }>();
    buffer.append(0, { position: [0, 0, 0] });
    buffer.append(1, { position: [1, 0, 0] });
    buffer.append(2, { position: [2, 0, 0] });
    const scrub = buffer.seek(1.9);
    expect(scrub?.data.position).toEqual([1, 0, 0]);
  });

  test("seekPair brackets a mid-recording time for interpolation", () => {
    const buffer = createRecordingBuffer<number>();
    buffer.append(0, 10);
    buffer.append(1, 20);
    buffer.append(2, 30);
    const pair = buffer.seekPair(1.4);
    expect(pair.before?.data).toBe(20);
    expect(pair.after?.data).toBe(30);
  });

  test("seekPair before the first frame has no before, past the end has no after", () => {
    const buffer = createRecordingBuffer<number>();
    buffer.append(1, 10);
    buffer.append(2, 20);
    expect(buffer.seekPair(0.5)).toEqual({ before: null, after: { t: 1, data: 10 } });
    expect(buffer.seekPair(9)).toEqual({ before: { t: 2, data: 20 }, after: null });
    expect(createRecordingBuffer<number>().seekPair(0)).toEqual({ before: null, after: null });
  });
});
