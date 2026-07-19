import { describe, expect, test } from "bun:test";
import { getSceneKind, listSceneKinds } from "@jgengine/core/scene/sceneKinds";
import { BOUNTY_KIND, STASH_KIND } from "./editorKinds";

describe("vice-isle placeable marker kinds", () => {
  test("stash and bounty register as click-to-place marker kinds under the Vice Isle menu", () => {
    expect(STASH_KIND).toBe("stash");
    expect(BOUNTY_KIND).toBe("bounty");
    for (const kind of [STASH_KIND, BOUNTY_KIND]) {
      const definition = getSceneKind(kind);
      expect(definition?.target).toBe("marker");
      // addCategory is the flag the + Add menu filters on, so these show as placement tools.
      expect(definition?.addCategory).toBe("Vice Isle");
    }
    const menuMarkers = listSceneKinds("marker").filter((d) => d.addCategory === "Vice Isle");
    expect(menuMarkers.map((d) => d.kind).sort()).toEqual(["bounty", "stash"]);
  });

  test("a placed stash carries an editable payout default", () => {
    const value = getSceneKind(STASH_KIND)?.schema.fields.find((f) => f.key === "value");
    expect(value?.type).toBe("number");
  });
});
