// home-ok: animal flight is a locomotion reference beside walking and running; flight/ holds aircraft
import { describe, expect, test } from "bun:test";

import { compareFlier, FLAPPING_MASS_LIMIT, flightPower, maximumRangeSpeed, minimumPowerSpeed, PUBLISHED_FLIERS, validateFlightReference } from "./flightPower";

const swan = { mass: 8.94, span: 2.3, wingArea: 0.683 };

describe("flight power", () => {
  test("every published flight check passes", () => {
    const rows = validateFlightReference();
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.filter((row) => !row.pass)).toEqual([]);
  });

  test("mechanical power bottoms out at the minimum-power speed and range peaks above it", () => {
    const vmp = minimumPowerSpeed(swan);
    const atVmp = flightPower(swan, vmp).mechanical;
    expect(flightPower(swan, vmp * 0.9).mechanical).toBeGreaterThan(atVmp);
    expect(flightPower(swan, vmp * 1.1).mechanical).toBeGreaterThan(atVmp);
    const vmr = maximumRangeSpeed(swan);
    expect(vmr).toBeGreaterThan(vmp);
    const costPerMetre = (v: number) => flightPower(swan, v).chemical / v;
    expect(costPerMetre(vmr * 0.9)).toBeGreaterThan(costPerMetre(vmr));
    expect(costPerMetre(vmr * 1.1)).toBeGreaterThan(costPerMetre(vmr));
  });

  test("fliers above the flapping limit have to soar", () => {
    expect(PUBLISHED_FLIERS.argentavis.body.mass).toBeGreaterThan(FLAPPING_MASS_LIMIT);
    expect(compareFlier(PUBLISHED_FLIERS.argentavis.body, 20).canSustainFlapping).toBe(false);
    expect(compareFlier(PUBLISHED_FLIERS.pteranodon.body, 20).canSustainFlapping).toBe(true);
  });
});
