import { resolveTerrainDetail } from "@jgengine/core/world/terrain";
import { expect, test } from "bun:test";

import { createTerrainDetailMaterial } from "./terrainDetailMaterial";

function compileFragment(): string {
  const { material } = createTerrainDetailMaterial(resolveTerrainDetail({}));
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>",
    fragmentShader: "#include <common>\n#include <color_fragment>",
  };
  material.onBeforeCompile?.(shader as never, undefined as never);
  return shader.fragmentShader;
}

test("terrain detail noise uses a precision-stable integer hash, not the sin hash", () => {
  const frag = compileFragment();
  expect(frag).toContain("jgHashUint");
  expect(frag).toContain("ivec2(floor");
  expect(frag).not.toContain("sin(dot");
});

test("terrain detail hash stays well-distributed at large world coords", () => {
  const hash = (n: number) => {
    let x = Math.imul(Math.trunc(n) >>> 0, 1664525) >>> 0;
    x = Math.imul((x ^ (x >>> 16)) >>> 0, 2246822519) >>> 0;
    x = Math.imul((x ^ (x >>> 13)) >>> 0, 3266489917) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    return x / 4294967296;
  };
  const near = [0, 1, 2, 3, 4, 5, 6, 7].map(hash);
  const far = [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007].map(hash);
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  expect(spread(far)).toBeGreaterThan(0.5);
  expect(spread(far)).toBeCloseTo(spread(near), 0);
});
