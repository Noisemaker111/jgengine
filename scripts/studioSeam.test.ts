import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { getSceneKind, parseParams } from "../packages/core/src/scene/sceneKinds";
import { getAssetGenerator, resolveGeneratorAsset } from "../packages/core/src/scene/assetGenerator";
import { POLE_LINE_KIND, POLE_LINE_SCHEMA, registerPoleLineStudio, resolvePoleLine } from "../examples/studios/src/poleLineStudio";
import { BOOKCASE_GENERATOR_ID, registerBookcaseStudio } from "../examples/studios/src/bookcaseStudio";

/**
 * Acceptance test for the parametric-studio seam (#809/#812): a brand-new studio is added by ONE
 * self-contained module + one register call, with zero edits to engine files. Proven two ways —
 * the example adopters light up through the public registry, and no engine source names them.
 */
describe("adding a studio needs only the public seam", () => {
  test("registerPoleLineStudio lights up a scene kind the editor+runtime pick up generically", () => {
    registerPoleLineStudio();
    const definition = getSceneKind(POLE_LINE_KIND);
    expect(definition).toBeDefined();
    expect(definition!.target).toBe("path");
    // The same registered resolver the editor note + AuthoredScene renderer consume.
    const resolved = resolvePoleLine(
      { id: "line", kind: POLE_LINE_KIND, points: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }] },
      parseParams(POLE_LINE_SCHEMA, { spacing: 10, wireCount: 2 }),
    );
    expect(resolved.poles).toHaveLength(5);
    expect(resolved.cables).toHaveLength(8);
  });

  test("registerBookcaseStudio lights up a generator asset re-resolvable from meta", () => {
    registerBookcaseStudio();
    expect(getAssetGenerator(BOOKCASE_GENERATOR_ID)).toBeDefined();
    const asset = resolveGeneratorAsset({ assetId: BOOKCASE_GENERATOR_ID, width: 1.2, shelves: 3, seed: "s" });
    expect(asset).not.toBeNull();
    expect(asset!.parts.length).toBeGreaterThan(5);
    // Deterministic for the same seed.
    const again = resolveGeneratorAsset({ assetId: BOOKCASE_GENERATOR_ID, width: 1.2, shelves: 3, seed: "s" });
    expect(again!.parts.length).toBe(asset!.parts.length);
  });
});

describe("no engine file references the throwaway studios", () => {
  const walk = (dir: string, out: string[]): string[] => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
  };

  test("no engine package imports an example studio or defines its logic", () => {
    const offenders: string[] = [];
    // Real coupling would be an import of the adopter modules or the examples workspace, or an
    // engine-defined pole/bookcase symbol. Prose mentions in doc comments are fine (they teach the seam).
    const importPattern = /from\s+["'][^"']*(?:examples\/studios|poleLineStudio|poleLineRenderer|bookcaseStudio)["']|@jgengine-examples/;
    const symbolPattern = /\b(?:registerPoleLineStudio|registerBookcaseStudio|resolvePoleLine|generateBookcase|POLE_LINE_KIND|BOOKCASE_GENERATOR_ID)\b/;
    for (const file of walk(join(process.cwd(), "packages"), [])) {
      const source = readFileSync(file, "utf8");
      if (importPattern.test(source) || symbolPattern.test(source)) offenders.push(file.replace(process.cwd(), "."));
    }
    expect(offenders).toEqual([]);
  });
});
