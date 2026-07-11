import { describe, expect, test } from "bun:test";

import { createWindZones } from "@jgengine/core/world/windZones";
import { windField } from "@jgengine/core/world/wind";

const zones = () =>
  createWindZones({
    zones: [
      {
        id: "canyon",
        center: [100, 0],
        radius: 30,
        phases: [
          { state: { direction: [1, 0], speed: 8, label: "gale" }, durationSeconds: 20 },
          { state: { direction: [0, 0], speed: 0, label: "calm" }, durationSeconds: 10 },
        ],
      },
      {
        id: "eye",
        center: [100, 0],
        radius: 5,
        phases: [{ state: { direction: [0, 1], speed: 1 }, durationSeconds: 1 }],
      },
    ],
    ambient: windField({ direction: [0, 1], speed: 2 }),
  });

describe("createWindZones", () => {
  test("zoneAt picks the innermost containing zone, null in open air", () => {
    const field = zones();
    expect(field.zoneAt(100, 0)).toBe("eye");
    expect(field.zoneAt(120, 0)).toBe("canyon");
    expect(field.zoneAt(500, 0)).toBeNull();
  });

  test("windAt follows the zone schedule and falls back to ambient outside", () => {
    const field = zones();
    expect(field.windAt(120, 0, 5)).toEqual([8, 0]);
    expect(field.windAt(120, 0, 25)).toEqual([0, 0]);
    const ambient = field.windAt(500, 0, 5);
    expect(ambient[1]).toBeGreaterThan(0);
  });

  test("stateAt exposes labels for the HUD", () => {
    const field = zones();
    expect(field.stateAt("canyon", 25)?.label).toBe("calm");
    expect(field.stateAt("missing", 0)).toBeNull();
  });

  test("forecastShift announces the next state and countdown", () => {
    const field = zones();
    const shift = field.forecastShift("canyon", 5)!;
    expect(shift.at).toBe(20);
    expect(shift.inSeconds).toBe(15);
    expect(shift.next.label).toBe("calm");
    expect(field.forecastShift("eye", 5)).toBeNull();
    expect(field.forecastShift("missing", 5)).toBeNull();
  });
});
