import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { createModelVariantSelector } from "@jgengine/core/world/modelLod";

import { attributeTriangles } from "./triangleAttribution";
import { cloneModelScene } from "./modelRender";
import { buildScatterModelSources, disposeScatterModelSources } from "../scatter/scatterModels";
import { variantLevelModel, variantLevelShadows, variantLevels } from "./singleVariantLod";

/** Harbor's palm, as the repo's variant test states it: the full mesh near, a cheaper one far. */
const NEAR_TRIANGLES = 9134;
const FAR_TRIANGLES = 4110;

/** One-mesh GLB stand-in carrying exactly `triangles` triangles, so a drawn count is a real triangle count. */
function glbLike(triangles: number): THREE.Group {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 7.6, 0]), 3));
  const index = new Uint32Array(triangles * 3);
  for (let i = 0; i < index.length; i += 1) index[i] = i % 3;
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: "#3f6b32" })));
  return root;
}

const TRIANGLES: Record<string, number> = {
  "mainsail-palm.glb": NEAR_TRIANGLES,
  "mainsail-palm-far.glb": FAR_TRIANGLES,
};

/** What the single prop path submits at one level: its clone, and the triangles the shadow pass would redraw. */
function frameAt(model: ModelConfig, level: number): { triangles: number; casters: number; castShadow: boolean[] } {
  const drawn = variantLevelModel(model, level);
  const clone = cloneModelScene(glbLike(TRIANGLES[drawn.url]!), { shadows: drawn.shadows });
  const attributed = attributeTriangles(clone);
  const castShadow: boolean[] = [];
  clone.traverse((node) => {
    if ((node as THREE.Mesh).isMesh === true) castShadow.push((node as THREE.Mesh).castShadow);
  });
  return { triangles: attributed.triangles, casters: attributed.casters, castShadow };
}

/** Harbor's palm as a game writes it: the same two assets, with the far level's shadow decided per level. */
function palm(farShadows?: ModelConfig["shadows"] | "inherit"): ModelConfig {
  return {
    url: "mainsail-palm.glb",
    targetHeight: 7.6,
    anchor: "origin",
    variants: variantLevels({
      levels: [
        { url: "mainsail-palm.glb", maxDistance: 60 },
        { url: "mainsail-palm-far.glb", ...(farShadows === undefined ? {} : { shadows: farShadows }) },
      ],
    }),
  };
}

describe("per-level shadow policy", () => {
  test("today: the far level casts, so a far palm costs its whole mesh again in the shadow pass", () => {
    const near = frameAt(palm(), 0);
    const far = frameAt(palm(), 1);

    expect(near.casters).toBe(NEAR_TRIANGLES);
    expect(far.casters).toBe(FAR_TRIANGLES);
    // The saving the policy can make is the far level's own share, not a guessed constant.
    expect(far.triangles).toBe(FAR_TRIANGLES);
    expect(far.casters).toBe(far.triangles);
  });

  test("a far level that stops casting keeps drawing and drops the caster count by that level's share", () => {
    const before = frameAt(palm(), 1);
    const after = frameAt(palm("none"), 1);

    expect(after.triangles).toBe(before.triangles);
    expect(after.casters).toBe(0);
    expect(before.casters - after.casters).toBe(FAR_TRIANGLES);
    expect(after.castShadow).toEqual([false]);
    // The near level of the same model is untouched: only the level that chose keeps the cost.
    expect(frameAt(palm("none"), 0).casters).toBe(NEAR_TRIANGLES);
  });

  test("a far level that keeps casting leaves the caster count unchanged", () => {
    const before = frameAt(palm(), 1);
    for (const mode of ["cast", "both"] as const) {
      const after = frameAt(palm(mode), 1);
      expect(after.casters).toBe(before.casters);
      expect(after.casters).toBe(FAR_TRIANGLES);
      expect(after.castShadow).toEqual([true]);
    }
  });

  test("an omitted or inherited level keeps the model's own shadows, so every existing model draws as before", () => {
    expect(variantLevelShadows(palm(), 1)).toBeUndefined();
    expect(variantLevelShadows(palm("inherit"), 1)).toBeUndefined();

    const receiving: ModelConfig = { ...palm(), shadows: "receive" };
    expect(variantLevelShadows(receiving, 1)).toBe("receive");
    expect(frameAt(receiving, 1).castShadow).toEqual([false]);

    // A hero prop can opt a level back in even when the model itself never casts.
    const hero: ModelConfig = { ...palm("both"), shadows: "none" };
    expect(variantLevelShadows(hero, 1)).toBe("both");
    expect(frameAt(hero, 1).castShadow).toEqual([true]);
  });

  test("the batched prop path takes the same per-level answer", () => {
    const source = glbLike(FAR_TRIANGLES);
    const nearHarvest = buildScatterModelSources(source, variantLevelModel(palm("none"), 0));
    const farHarvest = buildScatterModelSources(source, variantLevelModel(palm("none"), 1));
    try {
      expect(nearHarvest.sources.map((entry) => entry.castShadow)).toEqual([true]);
      expect(farHarvest.sources.map((entry) => entry.castShadow)).toEqual([false]);
      // Unchanged when the far level keeps its shadow: the batched draw still enters the pass.
      expect(buildScatterModelSources(source, variantLevelModel(palm(), 1)).sources.map((entry) => entry.castShadow)).toEqual([true]);
    } finally {
      disposeScatterModelSources(nearHarvest.root);
      disposeScatterModelSources(farHarvest.root);
    }
  });

  test("the level a prop draws and the level its shadow answers come from one config", () => {
    const model = palm("none");
    // A game's `variants` is still a plain `ModelVariantLodConfig`: the selector validates and switches it.
    expect(variantLevels(model.variants as never)).toBe(model.variants as never);
    const selector = createModelVariantSelector(model.variants!);
    expect(selector.level("palm", 30)).toBe(0);
    expect(selector.level("palm", 90)).toBe(1);
    expect(variantLevelModel(model, 1).url).toBe("mainsail-palm-far.glb");
    expect(variantLevelModel(model, 1).shadows).toBe("none");
    // No variants: the model comes back untouched.
    const plain: ModelConfig = { url: "mainsail-palm.glb" };
    expect(variantLevelModel(plain, 1)).toBe(plain);
  });
});
