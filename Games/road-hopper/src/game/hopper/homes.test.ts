import { describe, expect, test } from "bun:test";

import { HOME_TOLERANCE } from "./constants";
import { allFilled, createHomes, emptyBayIndices, pickEmptyBay, resolveHomeLanding } from "./homes";

describe("home-bay fill / duplicate rules", () => {
  test("landing between bays hits the hedge (miss)", () => {
    const homes = createHomes();
    expect(resolveHomeLanding(homes, 1.6).kind).toBe("miss");
    expect(resolveHomeLanding(homes, 6 + HOME_TOLERANCE + 0.01).kind).toBe("miss");
  });

  test("an aligned empty bay fills", () => {
    const homes = createHomes();
    const landing = resolveHomeLanding(homes, 3.1);
    expect(landing.kind).toBe("fill");
    if (landing.kind === "fill") {
      expect(landing.index).toBe(1);
      expect(landing.col).toBe(3);
      expect(landing.fly).toBe(false);
    }
  });

  test("re-entering an occupied bay is a duplicate (death)", () => {
    const homes = createHomes();
    homes[1]!.filled = true;
    expect(resolveHomeLanding(homes, 3).kind).toBe("occupied");
  });

  test("bonus fly on the bay is reported on the fill", () => {
    const homes = createHomes();
    homes[2]!.fly = true;
    const landing = resolveHomeLanding(homes, 6);
    expect(landing.kind).toBe("fill");
    if (landing.kind === "fill") expect(landing.fly).toBe(true);
  });

  test("emptyBayIndices, allFilled and pickEmptyBay track occupancy", () => {
    const homes = createHomes();
    expect(emptyBayIndices(homes).length).toBe(5);
    expect(allFilled(homes)).toBe(false);
    expect(pickEmptyBay(homes, () => 0)).toBe(0);
    for (const bay of homes) bay.filled = true;
    expect(allFilled(homes)).toBe(true);
    expect(pickEmptyBay(homes, () => 0)).toBeNull();
  });
});
