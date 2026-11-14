import { describe, expect, test } from "bun:test";
import {
  districtDepth,
  dropFloor,
  hoursUntilDusk,
  shiftOpen,
  stageAt,
  streetState,
  tideLevelAt,
  waterEffect,
} from "./tide";

describe("the tide clock", () => {
  test("the streets are dry by day and the water climbs from dusk to a midnight peak", () => {
    expect(tideLevelAt(12)).toBe(0);
    expect(tideLevelAt(17)).toBe(0);
    let last = -1;
    for (let hour = 18; hour <= 24; hour += 0.25) {
      const level = tideLevelAt(hour);
      expect(level).toBeGreaterThan(last);
      last = level;
    }
    expect(tideLevelAt(24)).toBeCloseTo(2, 5);
    // It ebbs after midnight and is out by three.
    expect(tideLevelAt(1)).toBeLessThan(2);
    expect(tideLevelAt(3)).toBe(0);
  });

  test("a shift walks every stage from low tide to the king tide", () => {
    const seen = new Set<string>();
    for (let hour = 17.5; hour < 24; hour += 0.1) seen.add(stageAt(tideLevelAt(hour)).id);
    expect([...seen]).toEqual(["low", "wet", "canal", "high", "king"]);
  });

  test("the docks flood first, then the boulevard, then downtown; the Heights stay dry", () => {
    const at = (hour: number) => ({
      docks: districtDepth("port_carmine", tideLevelAt(hour)),
      boulevard: districtDepth("mainsail_boulevard", tideLevelAt(hour)),
      downtown: districtDepth("downtown", tideLevelAt(hour)),
      heights: districtDepth("palm_heights", tideLevelAt(hour)),
    });
    const early = at(19.5);
    expect(streetState(early.docks)).toBe("canal");
    expect(streetState(early.boulevard)).toBe("dry");
    const late = at(22);
    expect(streetState(late.boulevard)).toBe("canal");
    expect(streetState(late.downtown)).not.toBe("canal");
    const peak = at(23.9);
    expect(streetState(peak.downtown)).toBe("canal");
    expect(peak.heights).toBe(0);
    expect(districtDepth(null, 2)).toBe(0);
  });

  test("road engines drown and hulls float where the streets are canals; the blimp does not care", () => {
    expect(waterEffect("road", 0, 40).keepPerSecond).toBe(1);
    const splash = waterEffect("road", 0.2, 45);
    expect(splash.stuck).toBe(false);
    expect(splash.soakPerSecond).toBeGreaterThan(0);
    expect(waterEffect("road", 0.2, 10).soakPerSecond).toBe(0);
    expect(waterEffect("road", 1, 20).stuck).toBe(true);
    expect(waterEffect("water", 1, 20).stuck).toBe(false);
    expect(waterEffect("water", 0, 20).label).toBe("BEACHED");
    expect(waterEffect("water", 0, 20, true).stuck).toBe(false);
    expect(waterEffect("air", 1.5, 80)).toEqual({ keepPerSecond: 1, stuck: false, soakPerSecond: 0, label: "" });
  });

  test("deliveries move upstairs as the water rises", () => {
    expect(dropFloor(0)).toBe("door");
    expect(dropFloor(0.3)).toBe("balcony");
    expect(dropFloor(1.2)).toBe("rooftop");
  });

  test("the shop is open dusk to midnight and the skip lands as the doors open", () => {
    expect(shiftOpen(17.9)).toBe(false);
    expect(shiftOpen(18)).toBe(true);
    expect(shiftOpen(23.99)).toBe(true);
    expect(hoursUntilDusk(0)).toBeCloseTo(18, 5);
    expect(hoursUntilDusk(17.5)).toBeCloseTo(0.5, 5);
    expect(hoursUntilDusk(18)).toBe(24);
  });
});
