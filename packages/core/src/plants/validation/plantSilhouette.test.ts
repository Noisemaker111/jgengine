import { describe, expect, test } from "bun:test";
import { encodePlantStructure } from "../cache/plantCodec";
import { OPEN_TEMPERATE_SITE } from "../growth/plantEnvironment";
import { createPlantGrowth } from "../growth/plantGrowth";
import { ACER_SACCHARUM } from "../species/data/acerSaccharum";
import { hashPlantStructure, type PlantStructure } from "../structure/plantStructure";
import { branchAzimuthHistogram, histogramDistance, plantSilhouettes, silhouetteIoU } from "./plantSilhouette";

const TREES = 100;
const AGE = 20;
/** Two trees look the same from 8 sides at or above this IoU. */
const SAME_SILHOUETTE_IOU = 0.9;
/** Two trees' main limbs point the same ways below this histogram distance. */
const SAME_LIMBS_DISTANCE = 0.25;

function grow(seed: string): PlantStructure {
  const growth = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, seed);
  growth.step(AGE);
  return growth.structure(200);
}

describe("unique trees", () => {
  const trees = Array.from({ length: TREES }, (_, k) => grow(`maple-${k}`));

  test("100 sugar maples of one age and different seeds have 100 different structures", () => {
    expect(new Set(trees.map(hashPlantStructure)).size).toBe(TREES);
  });

  test("every pair differs in its 8-view silhouette or in where its limbs point", () => {
    let heightM = 0;
    let radiusM = 0;
    for (const tree of trees) {
      heightM = Math.max(heightM, tree.stats.heightM);
      radiusM = Math.max(radiusM, tree.stats.crownRadiusM);
    }
    const frame = { halfWidthM: radiusM * 1.15, heightM: heightM * 1.05, size: 48 };
    const silhouettes = trees.map((tree) => plantSilhouettes(tree, frame, 8));
    const limbs = trees.map((tree) => branchAzimuthHistogram(tree));
    const alike: string[] = [];
    let mostAlike = 0;
    for (let a = 0; a < TREES; a += 1) {
      for (let b = a + 1; b < TREES; b += 1) {
        const silA = silhouettes[a];
        const silB = silhouettes[b];
        const limbsA = limbs[a];
        const limbsB = limbs[b];
        if (silA === undefined || silB === undefined || limbsA === undefined || limbsB === undefined) continue;
        const iou = silhouetteIoU(silA, silB);
        mostAlike = Math.max(mostAlike, iou);
        if (iou >= SAME_SILHOUETTE_IOU && histogramDistance(limbsA, limbsB) < SAME_LIMBS_DISTANCE) alike.push(`${a}/${b}`);
      }
    }
    console.log(`unique trees: most alike pair has 8-view IoU ${mostAlike.toFixed(3)}`);
    expect(alike).toEqual([]);
  }, 60_000);

  test("regrowing a seed gives the same bytes", () => {
    for (const k of [0, 37, 99]) {
      const first = trees[k];
      if (first === undefined) throw new Error(`no tree ${k}`);
      const again = grow(`maple-${k}`);
      const bytesA = encodePlantStructure(first, hashPlantStructure(first));
      const bytesB = encodePlantStructure(again, hashPlantStructure(again));
      expect(Buffer.from(bytesA).equals(Buffer.from(bytesB))).toBe(true);
    }
  });

  test("a silhouette sees a tree and not empty sky", () => {
    const tree = trees[0];
    if (tree === undefined) throw new Error("no tree");
    const { views, size } = plantSilhouettes(tree, { halfWidthM: tree.stats.crownRadiusM * 1.2, heightM: tree.stats.heightM * 1.1, size: 32 });
    expect(views).toHaveLength(8);
    for (const view of views) {
      const filled = view.reduce((sum, pixel) => sum + pixel, 0) / (size * size);
      expect(filled).toBeGreaterThan(0.1);
      expect(filled).toBeLessThan(0.9);
    }
    expect(silhouetteIoU(plantSilhouettes(tree, { halfWidthM: 5, heightM: 12 }), plantSilhouettes(tree, { halfWidthM: 5, heightM: 12 }))).toBe(1);
  });
});
