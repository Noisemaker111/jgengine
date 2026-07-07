import { describe, expect, test } from "bun:test";
import {
  buildContextMenu,
  contextVerb,
  contextVerbInput,
} from "@jgengine/core/interaction/contextMenu";

describe("contextMenu", () => {
  test("contextVerb builds a label/command verb", () => {
    expect(contextVerb("Sit", "sim.sit")).toEqual({ label: "Sit", command: "sim.sit" });
    expect(contextVerb("Repair", "sim.repair", { quality: 1 })).toEqual({
      label: "Repair",
      command: "sim.repair",
      args: { quality: 1 },
    });
  });

  test("buildContextMenu returns null when the target lists no verbs", () => {
    expect(buildContextMenu({ kind: "object", targetId: "chair-1", verbs: undefined })).toBeNull();
    expect(buildContextMenu({ kind: "object", targetId: "chair-1", verbs: [] })).toBeNull();
  });

  test("buildContextMenu carries the world point through", () => {
    const menu = buildContextMenu({
      kind: "object",
      targetId: "chair-1",
      verbs: [contextVerb("Sit", "sim.sit")],
      point: [1, 0, 2],
    });
    expect(menu).not.toBeNull();
    expect(menu!.point).toEqual([1, 0, 2]);
    expect(menu!.verbs).toHaveLength(1);
  });

  test("contextVerbInput merges verb args with target id and point", () => {
    const menu = buildContextMenu({
      kind: "entity",
      targetId: "villager-3",
      verbs: [contextVerb("Follow", "unit.follow", { formation: "wedge" })],
      point: [4, 0, 5],
    })!;
    expect(contextVerbInput(menu, menu.verbs[0]!)).toEqual({
      formation: "wedge",
      target: "villager-3",
      targetKind: "entity",
      point: [4, 0, 5],
    });
  });
});
