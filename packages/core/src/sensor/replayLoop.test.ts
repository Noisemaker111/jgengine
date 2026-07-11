import { describe, expect, test } from "bun:test";

import { createRecordingBuffer } from "@jgengine/core/sensor/recordingBuffer";
import {
  createReplayLoop,
  interpolateRecordedPose,
  syncReplayEntity,
  type ReplayEntityDeps,
} from "@jgengine/core/sensor/replayLoop";

interface LinePose {
  position: readonly [number, number, number];
}

function lineBuffer() {
  const buffer = createRecordingBuffer<LinePose>();
  buffer.append(10, { position: [0, 0, 0] });
  buffer.append(11, { position: [1, 0, 0] });
  buffer.append(12, { position: [2, 0, 0] });
  return buffer;
}

describe("createReplayLoop", () => {
  test("sample(0) returns the first frame's data without an interpolate callback", () => {
    const loop = createReplayLoop(lineBuffer());
    expect(loop.duration()).toBe(2);
    expect(loop.sample(0)).toEqual({ position: [0, 0, 0] });
  });

  test("with an interpolate callback, returns blended data at half-steps", () => {
    const loop = createReplayLoop(lineBuffer(), {
      interpolate: (before, after, alpha) => interpolateRecordedPose(before, after, alpha),
    });
    expect(loop.sample(0.5)).toEqual({ position: [0.5, 0, 0] });
    expect(loop.sample(1.5)).toEqual({ position: [1.5, 0, 0] });
  });

  test("seek time wraps modulo the recording's duration", () => {
    const loop = createReplayLoop(lineBuffer(), {
      interpolate: (before, after, alpha) => interpolateRecordedPose(before, after, alpha),
    });
    expect(loop.sample(2.5)).toEqual(loop.sample(0.5));
  });

  test("spawnGraceSeconds returns null inside the grace window on every pass", () => {
    const loop = createReplayLoop(lineBuffer(), { spawnGraceSeconds: 0.5 });
    expect(loop.sample(0.2)).toBeNull();
    expect(loop.sample(0.6)).toEqual({ position: [0, 0, 0] });
    expect(loop.sample(2.2)).toBeNull();
  });

  test("an empty buffer always samples null", () => {
    const loop = createReplayLoop(createRecordingBuffer<LinePose>());
    expect(loop.sample(0)).toBeNull();
  });
});

describe("interpolateRecordedPose", () => {
  test("lerps position", () => {
    const before = { position: [0, 0, 0] as const };
    const after = { position: [2, 4, 6] as const };
    expect(interpolateRecordedPose(before, after, 0.25)).toEqual({ position: [0.5, 1, 1.5] });
  });

  test("blends rotationY along the shortest arc across the +-PI seam", () => {
    const before = { position: [0, 0, 0] as const, rotationY: 3.0 };
    const after = { position: [2, 0, 0] as const, rotationY: -3.0 };
    const mid = interpolateRecordedPose(before, after, 0.5);
    expect(mid.rotationY).toBeCloseTo(Math.PI, 5);
    const end = interpolateRecordedPose(before, after, 1);
    expect(end.rotationY).toBeCloseTo(3.0 + (Math.PI * 2 - 6.0), 5);
  });
});

describe("syncReplayEntity", () => {
  function fakeDeps(): { deps: ReplayEntityDeps; calls: string[] } {
    const calls: string[] = [];
    const present = new Set<string>();
    return {
      calls,
      deps: {
        has: (id) => present.has(id),
        spawn: (id) => {
          present.add(id);
          calls.push(`spawn:${id}`);
        },
        setPose: (id, pose) => {
          calls.push(`setPose:${id}:${pose.position.join(",")}`);
        },
        despawn: (id) => {
          present.delete(id);
          calls.push(`despawn:${id}`);
        },
      },
    };
  }

  test("spawns the entity on the first non-null sample, then poses it", () => {
    const { deps, calls } = fakeDeps();
    syncReplayEntity(deps, "ghost", { position: [1, 2, 3], rotationY: 0.5 }, 0.1);
    expect(calls).toEqual(["spawn:ghost", "setPose:ghost:1,2,3"]);
  });

  test("setPose only (no spawn) once the entity is already present", () => {
    const { deps, calls } = fakeDeps();
    syncReplayEntity(deps, "ghost", { position: [0, 0, 0] });
    calls.length = 0;
    syncReplayEntity(deps, "ghost", { position: [4, 5, 6] });
    expect(calls).toEqual(["setPose:ghost:4,5,6"]);
  });

  test("despawns a present entity on a null pose", () => {
    const { deps, calls } = fakeDeps();
    syncReplayEntity(deps, "ghost", { position: [0, 0, 0] });
    calls.length = 0;
    syncReplayEntity(deps, "ghost", null);
    expect(calls).toEqual(["despawn:ghost"]);
  });

  test("a null pose is a no-op when the entity was never spawned", () => {
    const { deps, calls } = fakeDeps();
    syncReplayEntity(deps, "ghost", null);
    expect(calls).toEqual([]);
  });
});
