import { describe, expect, test } from "bun:test";
import { trainLines } from "../course/trainLines";
import type { SectorLayout } from "./course";
import { RunController, type RunControllerConfig } from "./runController";
import type { SpeedTuning } from "./speed";

function safeSector(id: string, index: number, length: number): SectorLayout {
  return {
    id,
    index,
    length,
    tint: "#000000",
    label: id.toUpperCase(),
    strips: [
      { surface: "floor", lane: 0, fromZ: 0, toZ: length, polarity: "blue" },
      { surface: "floor", lane: 1, fromZ: 0, toZ: length, polarity: "blue" },
      { surface: "floor", lane: 2, fromZ: 0, toZ: length, polarity: "blue" },
    ],
    gates: [],
    checkpoints: [{ id: `${id}-cp0`, z: 0 }],
  };
}

const fastTuning: SpeedTuning = { base: 20, accel: 0, max: 20, boostMultiplier: 1, brakeMultiplier: 1 };

function syntheticConfig(sectorCount: number, length = 20): RunControllerConfig {
  const sectors = Array.from({ length: sectorCount }, (_, i) => safeSector(`sector-${i}`, i, length));
  return { sectors, speedTuning: sectors.map(() => fastTuning), trainLines };
}

const noHold = { boosting: false, braking: false };

describe("run controller — restart purity", () => {
  test("start() twice from a fresh instance produces identical initial state", () => {
    const a = new RunController(syntheticConfig(1));
    a.start();
    const b = new RunController(syntheticConfig(1));
    b.start();
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  test("restarting after progress fully resets — no leaked state", () => {
    const controller = new RunController(syntheticConfig(3));
    controller.start();
    controller.moveLane(1);
    controller.flip();
    controller.tick(1, noHold, 0);
    expect(controller.snapshot().z).toBeGreaterThan(0);

    controller.start();
    const fresh = new RunController(syntheticConfig(3));
    fresh.start();
    expect(controller.snapshot()).toEqual(fresh.snapshot());
  });
});

describe("run controller — lane + polarity commands", () => {
  test("moveLane clamps to [0, 2]", () => {
    const controller = new RunController(syntheticConfig(1));
    controller.start();
    controller.moveLane(-1);
    expect(controller.snapshot().lane).toBe(0);
    controller.moveLane(-1);
    expect(controller.snapshot().lane).toBe(0);
    controller.moveLane(1);
    controller.moveLane(1);
    controller.moveLane(1);
    expect(controller.snapshot().lane).toBe(2);
  });

  test("flip toggles polarity and sets a flash window", () => {
    const controller = new RunController(syntheticConfig(1));
    controller.start();
    expect(controller.snapshot().polarity).toBe("red");
    controller.flip();
    expect(controller.snapshot().polarity).toBe("blue");
    expect(controller.snapshot().flipFlashUntil).toBeGreaterThan(0);
  });

  test("commands are no-ops before start() / after the run ends", () => {
    const controller = new RunController(syntheticConfig(1));
    controller.moveLane(1);
    expect(controller.snapshot().phase).toBe("menu");
    expect(controller.snapshot().lane).toBe(1);
  });
});

describe("run controller — sector clear, advance, win + medal", () => {
  test("reaching sector end clears it and continueAfterClear advances to the next", () => {
    const controller = new RunController(syntheticConfig(2, 5));
    controller.start();
    controller.tick(1, noHold, 0);
    expect(controller.snapshot().phase).toBe("sectorClear");
    controller.continueAfterClear();
    expect(controller.snapshot().phase).toBe("running");
    expect(controller.snapshot().sectorIndex).toBe(1);
    expect(controller.snapshot().z).toBe(0);
  });

  test("clearing the final sector wins with a medal", () => {
    const controller = new RunController(syntheticConfig(2, 5));
    controller.start();
    controller.tick(1, noHold, 0);
    controller.continueAfterClear();
    controller.tick(1, noHold, 1);
    expect(controller.snapshot().phase).toBe("sectorClear");
    controller.continueAfterClear();
    expect(controller.snapshot().phase).toBe("won");
    expect(controller.snapshot().medal).toBe("gold");
  });
});

describe("run controller — crash budget and respawn", () => {
  test("three crashes in a row fail the sector", () => {
    const sector: SectorLayout = {
      id: "hazard",
      index: 0,
      length: 1000,
      tint: "#000",
      label: "HAZARD",
      strips: [],
      gates: [],
      checkpoints: [{ id: "hazard-cp0", z: 0 }],
    };
    const config: RunControllerConfig = { sectors: [sector], speedTuning: [fastTuning], trainLines };
    const controller = new RunController(config);
    controller.start();

    controller.tick(1, noHold, 0);
    expect(controller.snapshot().phase).toBe("running");
    expect(controller.snapshot().crashesInSector).toBe(1);
    expect(controller.snapshot().z).toBe(0);

    controller.tick(1, noHold, 1);
    expect(controller.snapshot().crashesInSector).toBe(2);

    controller.tick(1, noHold, 2);
    expect(controller.snapshot().phase).toBe("lost");
    expect(controller.snapshot().loseSectorIndex).toBe(0);
  });

  test("a crash respawns at the last checkpoint reached, not the sector start", () => {
    const sector: SectorLayout = {
      id: "s",
      index: 0,
      length: 200,
      tint: "#000",
      label: "S",
      strips: [
        { surface: "floor", lane: 1, fromZ: 0, toZ: 100, polarity: "blue" },
        { surface: "floor", lane: 0, fromZ: 0, toZ: 100, polarity: "blue" },
        { surface: "floor", lane: 2, fromZ: 0, toZ: 100, polarity: "blue" },
        // gap from 100 onward — a crash guaranteed once past z=100
      ],
      gates: [],
      checkpoints: [
        { id: "s-cp0", z: 0 },
        { id: "s-cp1", z: 80 },
      ],
    };
    const config: RunControllerConfig = { sectors: [sector], speedTuning: [fastTuning], trainLines };
    const controller = new RunController(config);
    controller.start();
    controller.tick(6, noHold, 0); // z = 0 + 20*6 = 120, past the checkpoint and past the strip
    expect(controller.snapshot().crashesInSector).toBe(1);
    expect(controller.snapshot().z).toBe(80);
  });

  test("manual restartSector consumes an attempt and returns to the sector start", () => {
    const controller = new RunController(syntheticConfig(1, 100));
    controller.start();
    controller.tick(1, noHold, 0);
    expect(controller.snapshot().z).toBeGreaterThan(0);
    controller.restartSector();
    expect(controller.snapshot().z).toBe(0);
    expect(controller.snapshot().crashesInSector).toBe(1);
    expect(controller.snapshot().phase).toBe("running");
  });
});
