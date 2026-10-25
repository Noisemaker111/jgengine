import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import { scatterModels } from "./modelRef";

const publicRoot = join(import.meta.dir, "../../public");

/** Every `{ model }` the idea names. */
function modelsIn(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) modelsIn(item, found);
  else if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record["model"] === "string") found.push(record["model"]);
    for (const item of Object.values(record)) modelsIn(item, found);
  }
  return found;
}

describe("the generated world", () => {
  test("every pack model the idea names is a file the game serves", () => {
    const files = modelsIn(idea).filter((ref) => ref.startsWith("/"));
    expect(files.length).toBeGreaterThan(0);
    for (const ref of files) expect(existsSync(join(publicRoot, ref))).toBe(true);
  });

  test("every scatter item the scene paints has a model to draw", () => {
    const painted = new Set<string>();
    for (const path of editorLayers.paths) {
      const palette = (path.meta?.["palette"] ?? []) as { item?: string }[];
      for (const entry of palette) if (typeof entry.item === "string") painted.add(entry.item);
    }
    for (const item of painted) expect(scatterModels[item]).toBeDefined();
  });

  test("the world is dressed: woods, markers and a place to start", () => {
    expect(editorLayers.paths.filter((path) => path.kind === "scatter").length).toBeGreaterThan(3);
    expect(editorLayers.markers.length).toBeGreaterThan(5);
  });
});
