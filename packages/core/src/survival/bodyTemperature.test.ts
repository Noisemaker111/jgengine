import { describe, expect, test } from "bun:test";

import { ambientTemperature, bodyComfort } from "./bodyTemperature";

describe("body temperature", () => {
  test("night, altitude and wetness cool the air", () => {
    const noon = ambientTemperature({ baseC: 20, daySwingC: 5, dayFraction: 0.5 });
    const night = ambientTemperature({ baseC: 20, daySwingC: 5, dayFraction: 0, altitude: 1000, wet: true });
    expect(noon).toBe(25);
    expect(night).toBeCloseTo(20 - 5 - 6.5 - 6, 5);
  });

  test("cold burns food, insulation and fortitude widen the band, exposure hurts", () => {
    const config = {
      comfortC: [10, 30] as const,
      bands: {
        comfortable: "comfortable",
        cold: [{ id: "cold", at: 0 }, { id: "freezing", at: 15 }],
        hot: [{ id: "hot", at: 0 }, { id: "scorching", at: 15 }],
      },
      drainPerDegree: 0.05,
      coldDrains: "food",
      heatDrains: "water",
      damageAfterC: 15,
      damagePerDegree: 0.1,
      fortitudeC: 0.2,
    };
    expect(bodyComfort(20, config).band).toBe("comfortable");
    const cold = bodyComfort(0, config);
    expect(cold.band).toBe("cold");
    expect(cold.drain.food).toBeCloseTo(1.5, 5);
    expect(bodyComfort(0, config, { cold: 8, fortitude: 10 }).band).toBe("comfortable");
    const freezing = bodyComfort(-20, config);
    expect(freezing.band).toBe("freezing");
    expect(freezing.damagePerSecond).toBeCloseTo(1.5, 5);
    expect(bodyComfort(40, config).drain.water).toBeCloseTo(1.5, 5);
  });
});
