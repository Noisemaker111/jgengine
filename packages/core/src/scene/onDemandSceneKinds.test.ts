import { describe, expect, test } from "bun:test";

import { CITY_KIND } from "../city/cityKind";
import { getGenerator } from "../generator/generator";
import { LANDFORM_GENERATOR } from "../landform/generator/landformGenerator";
import { PLANT_GROWN_GENERATOR } from "../plants/grown/plantGrown";
import { FOREST_STAND_KIND } from "../plants/stand/forestStand";
import { registerBuiltinSceneKinds } from "./builtinSceneKinds";
import { ON_DEMAND_SCENE_KINDS, onDemandSceneKindsFor, sceneKindNeeds } from "./onDemandSceneKinds";
import { isSceneKind } from "./sceneKinds";

describe("on-demand scene kinds", () => {
  test("the table names the real kind and generator ids", () => {
    const byId = new Map(ON_DEMAND_SCENE_KINDS.map((entry) => [entry.id, entry]));
    expect(byId.get("city")?.kinds).toEqual([CITY_KIND]);
    expect(byId.get("plants")?.kinds).toEqual([FOREST_STAND_KIND]);
    expect(byId.get("plants")?.generators).toEqual([PLANT_GROWN_GENERATOR.id]);
    expect(byId.get("landform")?.generators).toEqual([LANDFORM_GENERATOR.id]);
  });

  test("each load registers the kinds and generators it lists", async () => {
    registerBuiltinSceneKinds();
    for (const entry of ON_DEMAND_SCENE_KINDS) {
      await entry.load();
      for (const kind of entry.kinds) expect({ kind, registered: isSceneKind(kind) }).toEqual({ kind, registered: true });
      for (const id of entry.generators) expect(getGenerator(id)?.id).toBe(id);
    }
  });

  test("a scene needs a system only when it uses one of its kinds or generators", () => {
    const empty = { markers: [], volumes: [], paths: [] };
    expect(onDemandSceneKindsFor(sceneKindNeeds(empty))).toEqual([]);
    const city = { ...empty, volumes: [{ kind: "city" }] };
    expect(onDemandSceneKindsFor(sceneKindNeeds(city)).map((entry) => entry.id)).toEqual(["city"]);
    expect(onDemandSceneKindsFor(sceneKindNeeds(empty, ["plant.grown"])).map((entry) => entry.id)).toEqual(["plants"]);
    const placed = { ...empty, markers: [{ kind: "prop", meta: { assetId: "plant.grown" } }] };
    expect(onDemandSceneKindsFor(sceneKindNeeds(placed)).map((entry) => entry.id)).toEqual(["plants"]);
  });
});
