import { expect, test } from "bun:test";

import {
  filterMaterialAssignments,
  listMaterialAssignments,
  summarizeMaterialUsage,
  type MaterialAssignmentRow,
} from "./materialAssignments";

const DOC = {
  markers: [
    { id: "rock_a", kind: "prop", label: "Rock A", meta: { materialId: "granite" } },
    { id: "rock_b", kind: "prop", label: "Rock B", meta: { materialId: "sand" } },
    { id: "crate", kind: "prop", label: "Crate" },
  ],
  volumes: [
    { id: "zone_1", kind: "zone", label: "Plaza", meta: { materialId: "granite" } },
    { id: "zone_2", kind: "zone", meta: { materialId: "" } },
  ],
  paths: [{ id: "path_1", kind: "road", label: "Main road", meta: { materialId: "road" } }],
};

test("listMaterialAssignments reads real meta.materialId across placeable families", () => {
  const rows = listMaterialAssignments(DOC);
  expect(rows).toHaveLength(6);
  expect(rows.find((row) => row.id === "rock_a")).toEqual({
    id: "rock_a",
    label: "Rock A",
    kind: "prop",
    objectKind: "marker",
    materialId: "granite",
  });
  expect(rows.find((row) => row.id === "crate")?.materialId).toBeNull();
  // Empty string is not a real assignment.
  expect(rows.find((row) => row.id === "zone_2")?.materialId).toBeNull();
  expect(rows.find((row) => row.id === "path_1")).toMatchObject({
    objectKind: "path",
    materialId: "road",
    label: "Main road",
  });
  // Fallback label is the object id when label is absent.
  expect(rows.find((row) => row.id === "zone_2")?.label).toBe("zone_2");
});

test("filterMaterialAssignments filters by assignment state, material id, and text", () => {
  const rows = listMaterialAssignments(DOC);

  expect(filterMaterialAssignments(rows, "", "assigned").map((row) => row.id)).toEqual([
    "rock_a",
    "rock_b",
    "zone_1",
    "path_1",
  ]);
  expect(filterMaterialAssignments(rows, "", "unassigned").map((row) => row.id)).toEqual(["crate", "zone_2"]);
  expect(filterMaterialAssignments(rows, "", { materialId: "granite" }).map((row) => row.id)).toEqual([
    "rock_a",
    "zone_1",
  ]);

  const byText = filterMaterialAssignments(rows, "rock", "all");
  expect(byText.map((row) => row.id)).toEqual(["rock_a", "rock_b"]);

  const byMaterialText = filterMaterialAssignments(rows, "GRANITE", "all");
  expect(byMaterialText.map((row) => row.id)).toEqual(["rock_a", "zone_1"]);

  // Combined: material filter + text.
  expect(filterMaterialAssignments(rows, "plaza", { materialId: "granite" }).map((row) => row.id)).toEqual([
    "zone_1",
  ]);
  expect(filterMaterialAssignments(rows, "plaza", { materialId: "sand" })).toEqual([]);
});

test("summarizeMaterialUsage counts assigned materials only", () => {
  const rows = listMaterialAssignments(DOC);
  expect(summarizeMaterialUsage(rows)).toEqual([
    { materialId: "granite", count: 2 },
    { materialId: "road", count: 1 },
    { materialId: "sand", count: 1 },
  ]);
  expect(summarizeMaterialUsage([] as MaterialAssignmentRow[])).toEqual([]);
});
