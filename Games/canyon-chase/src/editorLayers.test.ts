import { describe, expect, test } from "bun:test";

import { buildCanyonChaseEditorLayers } from "./editorLayers";

describe("canyon-chase editorLayers", () => {
  test("exposes corridor, branches, start, goal, capture", () => {
    const doc = buildCanyonChaseEditorLayers();
    expect(doc.markers.some((m) => m.id === "car_start")).toBe(true);
    expect(doc.markers.some((m) => m.id === "border_goal")).toBe(true);
    expect(doc.paths.some((p) => p.id === "main_corridor")).toBe(true);
    expect(doc.paths.some((p) => p.kind === "branch")).toBe(true);
    expect(doc.volumes.some((v) => v.kind === "capture")).toBe(true);
  });
});
