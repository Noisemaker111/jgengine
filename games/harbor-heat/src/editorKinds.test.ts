import { describe, expect, test } from "bun:test";
import { getSceneKind, listSceneKinds } from "@jgengine/core/scene/sceneKinds";
import { BOUNTY_KIND, STASH_KIND } from "./editorKinds";

describe("harbor-heat placeable marker kinds", () => {
  test("stash and bounty register as click-to-place marker kinds under the Harbor Heat menu", () => {
    expect(STASH_KIND).toBe("stash");
    expect(BOUNTY_KIND).toBe("bounty");
    for (const kind of [STASH_KIND, BOUNTY_KIND]) {
      const definition = getSceneKind(kind);
      expect(definition?.target).toBe("marker");
      // addCategory is the flag the + Add menu filters on, so these show as placement tools.
      expect(definition?.addCategory).toBe("Harbor Heat");
    }
    const menuMarkers = listSceneKinds("marker").filter((d) => d.addCategory === "Harbor Heat");
    expect(menuMarkers.map((d) => d.kind).sort()).toEqual([
      "bounty",
      "front",
      "gig_stop",
      "hideout",
      "resident_place",
      "stash",
      "traffic_intersection",
      "traffic_parking",
      "turf",
    ]);
  });

  test("a crossing marker exposes the right-of-way knobs the lane graph reads", () => {
    const definition = getSceneKind("traffic_intersection");
    expect(definition?.target).toBe("marker");
    expect(definition?.schema.fields.find((f) => f.key === "rightOfWay")?.type).toBe("select");
    expect(getSceneKind("traffic_parking")?.target).toBe("marker");
  });

  test("a placed stash carries an editable payout default", () => {
    const value = getSceneKind(STASH_KIND)?.schema.fields.find((f) => f.key === "value");
    expect(value?.type).toBe("number");
  });
});
