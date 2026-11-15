import { expect, test } from "bun:test";
import { resolveBuildingKitPart } from "@jgengine/core/buildings/buildingKit";
import { DRIFT_SOUNDS } from "../audio";
import { STORE_KIOSK_KIT } from "./facades";

test("street-only facade parts are omitted while kiosk walls, signs, awnings and shutters keep their block", () => {
  for (const kind of ["airConditioner", "clothesline", "roofProp", "window"] as const) {
    expect(resolveBuildingKitPart(STORE_KIOSK_KIT, kind).type).toBe("omit");
  }
  for (const kind of ["wall", "storefront", "roof", "awning", "storeSign", "shutter"] as const) {
    expect(resolveBuildingKitPart(STORE_KIOSK_KIT, kind).type).not.toBe("omit");
  }
});

test("every impact kind that drives a sound has a registered cue", () => {
  for (const kind of ["plow", "landing", "blocked", "armor", "grab", "power", "trick"]) {
    expect(DRIFT_SOUNDS[kind]?.synth?.voices.length ?? 0).toBeGreaterThan(0);
  }
});
