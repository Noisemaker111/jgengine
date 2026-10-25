import { expect, test } from "bun:test";
import { resolveBuildingKitPart } from "@jgengine/core/world/buildingKit";
import { DRIFT_SOUNDS } from "../audio";
import { SALVAGE_FACADE_KIT } from "./facades";

test("apartment-only facade parts are omitted while walls and windows keep their block", () => {
  for (const kind of ["awning", "airConditioner", "clothesline", "shutter", "storeSign", "roofProp"] as const) {
    expect(resolveBuildingKitPart(SALVAGE_FACADE_KIT, kind).type).toBe("omit");
  }
  for (const kind of ["wall", "window", "storefront", "roof"] as const) {
    expect(resolveBuildingKitPart(SALVAGE_FACADE_KIT, kind).type).toBe("box");
  }
});

test("every impact kind that drives a sound has a registered cue", () => {
  for (const kind of ["plow", "landing", "blocked", "armor"]) {
    expect(DRIFT_SOUNDS[kind]?.synth?.voices.length ?? 0).toBeGreaterThan(0);
  }
});
