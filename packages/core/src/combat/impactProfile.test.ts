import { describe, expect, test } from "bun:test";

import { IMPACT_PROFILES, impactClassFor } from "./impactProfile";

describe("impactClassFor", () => {
  test("weapon words pick the class", () => {
    expect(impactClassFor("frag_grenade")).toBe("explosive");
    expect(impactClassFor("rocketLauncher")).toBe("explosive");
    expect(impactClassFor("pump-shotgun")).toBe("heavy");
    expect(impactClassFor("sniper_rifle")).toBe("heavy");
    expect(impactClassFor("rusty sword")).toBe("melee");
    expect(impactClassFor("vehicle_ram")).toBe("vehicle");
    expect(impactClassFor("crossbow_bolt")).toBe("medium");
    expect(impactClassFor("pistol")).toBe("light");
    expect(impactClassFor("kinetic")).toBe("light");
  });

  test("short words only match whole words", () => {
    expect(impactClassFor("program")).toBe("light");
    expect(impactClassFor("scar_tissue")).toBe("light");
    expect(impactClassFor("combat")).toBe("light");
    expect(impactClassFor("seashell")).toBe("light");
  });

  test("an explicit class wins over the name", () => {
    expect(impactClassFor("pistol", { pistol: "heavy" })).toBe("heavy");
  });
});

describe("IMPACT_PROFILES", () => {
  test("a kill always stops time at least as long as a plain hit, and light guns never stop it on a hit", () => {
    for (const profile of Object.values(IMPACT_PROFILES)) expect(profile.killHitstopMs).toBeGreaterThanOrEqual(profile.hitstopMs);
    expect(IMPACT_PROFILES.light.hitstopMs).toBe(0);
    for (const profile of Object.values(IMPACT_PROFILES)) expect(profile.killHitstopMs).toBeLessThanOrEqual(90);
  });
});
