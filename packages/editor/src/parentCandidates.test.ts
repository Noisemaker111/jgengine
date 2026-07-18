import { describe, expect, test } from "bun:test";

import { normalizeEditorLayers } from "@jgengine/core/editor/index";

import { listParentCandidates } from "./parentCandidates";

describe("listParentCandidates", () => {
  test("excludes the child, its descendants, and returns sorted labels", () => {
    const document = normalizeEditorLayers({
      markers: [
        { id: "root", kind: "poi", position: { x: 0, y: 0, z: 0 }, label: "Root" },
        { id: "child", kind: "poi", position: { x: 1, y: 0, z: 0 }, label: "Child", parentId: "root" },
        { id: "grand", kind: "poi", position: { x: 2, y: 0, z: 0 }, label: "Grand", parentId: "child" },
        { id: "sib", kind: "poi", position: { x: 3, y: 0, z: 0 }, label: "Sibling" },
      ],
    });
    const forChild = listParentCandidates(document, ["child"]);
    expect(forChild.map((c) => c.id)).toEqual(["root", "sib"]);
    expect(forChild.map((c) => c.id)).not.toContain("child");
    expect(forChild.map((c) => c.id)).not.toContain("grand");

    const forRoot = listParentCandidates(document, ["root"]);
    expect(forRoot.map((c) => c.id)).toEqual(["sib"]);
  });

  test("multi-select bans the union of descendants", () => {
    const document = normalizeEditorLayers({
      markers: [
        { id: "a", kind: "poi", position: { x: 0, y: 0, z: 0 } },
        { id: "b", kind: "poi", position: { x: 1, y: 0, z: 0 } },
        { id: "c", kind: "poi", position: { x: 2, y: 0, z: 0 }, parentId: "a" },
        { id: "d", kind: "poi", position: { x: 3, y: 0, z: 0 } },
      ],
    });
    expect(listParentCandidates(document, ["a", "b"]).map((c) => c.id)).toEqual(["d"]);
  });
});
