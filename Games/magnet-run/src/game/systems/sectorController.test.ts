import { describe, expect, test } from "bun:test";
import { sectors } from "../course/sectors";
import {
  consumeSectorAttempt,
  createCourseCheckpoints,
  createSectorSequence,
  lastCheckpointFor,
  retriesRemaining,
  sectorStartCheckpoint,
} from "./sectorController";

describe("checkpoint/retry/sector state machine", () => {
  test("checkpoints are seeded for every sector", () => {
    const points = createCourseCheckpoints(sectors);
    for (const sector of sectors) {
      for (const checkpoint of sector.checkpoints) {
        expect(points.get(checkpoint.id)?.z).toBe(checkpoint.z);
      }
    }
  });

  test("lastCheckpointFor picks the nearest checkpoint at or before z", () => {
    const sector = sectors[0]!;
    const cp = lastCheckpointFor(sector, 150);
    expect(cp.z).toBeLessThanOrEqual(150);
    expect(sector.checkpoints.some((c) => c.z > cp.z && c.z <= 150)).toBe(false);
  });

  test("lastCheckpointFor before any checkpoint falls back to the sector start", () => {
    const sector = sectors[0]!;
    expect(lastCheckpointFor(sector, -5)).toEqual(sectorStartCheckpoint(sector));
  });

  test("three crashes are allowed before a sector fails (first attempt + 2 retries)", () => {
    const levels = createSectorSequence(sectors);
    levels.start();
    expect(retriesRemaining(levels)).toBe(2);
    expect(consumeSectorAttempt(levels)).toBe("retry");
    expect(levels.status()).toBe("playing");
    expect(retriesRemaining(levels)).toBe(1);
    expect(consumeSectorAttempt(levels)).toBe("retry");
    expect(retriesRemaining(levels)).toBe(0);
    expect(consumeSectorAttempt(levels)).toBe("failed");
    expect(levels.status()).toBe("failed");
  });

  test("clearing a sector and advancing moves to the next one", () => {
    const levels = createSectorSequence(sectors);
    levels.start();
    levels.clear();
    expect(levels.advance()).toBe(true);
    expect(levels.current()?.id).toBe(sectors[1]!.id);
  });

  test("clearing and advancing past the last sector completes the run", () => {
    const levels = createSectorSequence(sectors);
    levels.start();
    for (let i = 0; i < sectors.length; i += 1) {
      levels.clear();
      levels.advance();
    }
    expect(levels.status()).toBe("complete");
  });
});
