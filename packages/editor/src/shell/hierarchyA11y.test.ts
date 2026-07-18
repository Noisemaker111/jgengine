import { describe, expect, test } from "bun:test";

import type { OutlinerFlatRow } from "../outlinerModel";
import {
  hierarchyActiveDescendantId,
  hierarchyRowDomId,
  selectableIds,
} from "./hierarchyA11y";

describe("hierarchy a11y helpers", () => {
  test("hierarchyRowDomId is a stable treeitem target id", () => {
    expect(hierarchyRowDomId("prop-1")).toBe("hierarchy-row-prop-1");
    expect(hierarchyRowDomId("a")).toBe("hierarchy-row-a");
  });

  test("selectableIds walks kind and tree items, skips groups", () => {
    const rows: OutlinerFlatRow[] = [
      { type: "group", key: "g-prop", kind: "prop", total: 2, collapsed: false },
      { type: "kindItem", key: "k-a", kind: "prop", ids: ["a", "a2"], label: "A" },
      { type: "kindItem", key: "k-b", kind: "prop", ids: ["b"], label: "B" },
      {
        type: "treeItem",
        key: "t-c",
        id: "c",
        kind: "prop",
        label: "C",
        depth: 0,
        hasChildren: false,
      },
    ];
    expect(selectableIds(rows)).toEqual(["a", "b", "c"]);
  });

  test("hierarchyActiveDescendantId only resolves ids in the navigable set", () => {
    const navigable = ["a", "b", "c"];
    expect(hierarchyActiveDescendantId(null, navigable)).toBeUndefined();
    expect(hierarchyActiveDescendantId("missing", navigable)).toBeUndefined();
    expect(hierarchyActiveDescendantId("b", navigable)).toBe("hierarchy-row-b");
    expect(hierarchyActiveDescendantId("a", [])).toBeUndefined();
  });
});
