import { describe, expect, test } from "bun:test";

import type { SceneDocumentLike } from "../world/sceneShapes";
import { resolveTerrainField } from "./terrain";
import { terrain } from "../world/features";
import { surveyBiomeAt, surveyFromDocument, surveyHeightField, surveyIsLand, surveyTerrain, SURVEY_KINDS } from "./surveyTerrain";

const ring = (points: [number, number][]) => points.map(([x, z]) => ({ x, y: 0, z }));

const doc: SceneDocumentLike = {
  markers: [
    { id: "volcano", kind: SURVEY_KINDS.peak, position: { x: 0, y: 200, z: 0 }, meta: { radius: 300, craterRadius: 40, craterDepth: 50 } },
    { id: "spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 0 } },
  ],
  volumes: [],
  paths: [
    { id: "main", kind: SURVEY_KINDS.coast, points: ring([[-1000, -1000], [1000, -1000], [1000, 1000], [-1000, 1000]]) },
    { id: "chain", kind: SURVEY_KINDS.ridge, width: 200, points: [{ x: -600, y: 100, z: 600 }, { x: 600, y: 160, z: 600 }] },
    { id: "river", kind: SURVEY_KINDS.river, width: 20, points: ring([[-800, -500], [800, -500]]), meta: { bed: -2 } },
    { id: "snowfield", kind: SURVEY_KINDS.biome, points: ring([[-900, -900], [-400, -900], [-400, -400], [-900, -400]]), meta: { biome: "snow", material: "snow" } },
    { id: "swamp", kind: SURVEY_KINDS.biome, points: ring([[400, 400], [900, 400], [900, 900], [400, 900]]), meta: { biome: "swamp" } },
  ],
};

describe("surveyFromDocument", () => {
  test("reads shores, summits, chains, rivers and biomes by kind and ignores the rest", () => {
    const survey = surveyFromDocument(doc);
    expect(survey.coasts).toHaveLength(1);
    expect(survey.peaks).toEqual([{ id: "volcano", at: [0, 0], height: 200, radius: 300, crater: { radius: 40, depth: 50 } }]);
    expect(survey.ridges[0]!.points).toEqual([[-600, 600, 100], [600, 600, 160]]);
    expect(survey.rivers[0]).toEqual({ id: "river", points: [[-800, -500], [800, -500]], width: 20, bed: -2 });
    expect(survey.biomes.map((biome) => biome.biome)).toEqual(["snow", "swamp"]);
  });
});

describe("surveyHeightField", () => {
  const survey = surveyFromDocument(doc);
  const height = surveyHeightField(survey, { height: 8, roll: 0, rugged: 0 });

  test("plains sit at their height away from the mountains", () => {
    expect(height(-700, 0)).toBeCloseTo(8, 5);
  });

  test("a summit rises to its height at the rim of its crater and the crater dips", () => {
    const rim = height(40, 0);
    expect(rim).toBeGreaterThan(150);
    expect(height(0, 0)).toBeLessThan(rim - 30);
    expect(height(150, 0)).toBeGreaterThan(height(250, 0));
  });

  test("a chain's crest follows its points and falls off across its width", () => {
    expect(height(-600, 600)).toBeGreaterThan(95);
    expect(height(600, 600)).toBeGreaterThan(height(-600, 600) + 40);
    expect(height(0, 600)).toBeGreaterThan(height(0, 680));
    expect(height(0, 720)).toBeCloseTo(8, 5);
  });
});

describe("surveyTerrain", () => {
  const survey = surveyFromDocument(doc);
  const config = surveyTerrain(survey, { plains: { height: 10, roll: 0, rugged: 0 }, shore: { falloff: 50, shoreHeight: 1, seaFloor: -30, shelf: 60, wobble: 0 } });
  const field = resolveTerrainField(terrain({ bounds: { w: 3000, d: 3000 }, ...config }));

  test("land inside the shore, sea floor far outside", () => {
    expect(field.sampleHeight(-700, 0)).toBeCloseTo(10, 5);
    expect(field.sampleHeight(1500, 0)).toBe(-30);
  });

  test("the river cuts its channel down to its bed", () => {
    expect(field.sampleHeight(0, -500)).toBeCloseTo(-2, 5);
    expect(field.sampleHeight(0, -300)).toBeCloseTo(10, 5);
  });

  test("biomes with a ground look become polygon regions; a bare one only names the place", () => {
    expect(config.materialRegions).toHaveLength(1);
    expect(config.materialRegions[0]).toMatchObject({ shape: "polygon", material: "snow" });
    expect(surveyBiomeAt(survey, 600, 600)?.biome).toBe("swamp");
    expect(surveyBiomeAt(survey, -600, -600)?.biome).toBe("snow");
    expect(surveyBiomeAt(survey, 0, 0)).toBeNull();
  });

  test("land is inside a shore outline", () => {
    expect(surveyIsLand(survey, 0, 0)).toBe(true);
    expect(surveyIsLand(survey, 1200, 0)).toBe(false);
  });
});

describe("hills, cliffs and erosion", () => {
  const relief: SceneDocumentLike = {
    markers: [
      { id: "worn", kind: SURVEY_KINDS.peak, position: { x: 0, y: 200, z: 0 }, meta: { radius: 300, erosion: 1 } },
      { id: "smooth", kind: SURVEY_KINDS.peak, position: { x: 0, y: 200, z: 0 }, meta: { radius: 300 } },
    ],
    volumes: [],
    paths: [
      { id: "downs", kind: SURVEY_KINDS.hills, points: ring([[1000, -400], [1800, -400], [1800, 400], [1000, 400]]), meta: { height: 30, scale: 120, falloff: 60 } },
      { id: "scarp", kind: SURVEY_KINDS.cliff, points: ring([[-1500, -600], [-1500, 600]]), meta: { height: 20, face: 4, reach: 100 } },
    ],
  };
  const survey = surveyFromDocument(relief);
  const flat = { height: 8, roll: 0, rugged: 0 };

  test("reads hills and cliffs with their defaults, and erosion only where authored", () => {
    expect(survey.hills).toEqual([{ id: "downs", ring: [[1000, -400], [1800, -400], [1800, 400], [1000, 400]], height: 30, scale: 120, ridged: 0.35, falloff: 60, seed: "downs" }]);
    expect(survey.cliffs).toEqual([{ id: "scarp", points: [[-1500, -600], [-1500, 600]], height: 20, face: 4, reach: 100, side: 1 }]);
    expect(survey.peaks.map((peak) => peak.erosion)).toEqual([1, undefined]);
    expect("erosion" in (survey.peaks[1] ?? {})).toBe(false);
  });

  test("hills roll inside their outline and leave the plains flat outside it", () => {
    const height = surveyHeightField({ ...survey, peaks: [] }, flat);
    expect(height(900, 0)).toBeCloseTo(8, 5);
    expect(height(1001, 0)).toBeLessThan(8.5);
    const samples: number[] = [];
    for (let x = 1100; x <= 1700; x += 20) for (let z = -300; z <= 300; z += 20) samples.push(height(x, z));
    expect(Math.max(...samples)).toBeGreaterThan(8 + 30 * 0.6);
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(12);
    expect(Math.max(...samples)).toBeLessThanOrEqual(8 + 30 + 1e-6);
  });

  test("a cliff raises the left of its line across a steep face and eases back over its reach", () => {
    const height = surveyHeightField({ ...survey, peaks: [] }, flat);
    // Drawn toward +z, so its left is -x.
    expect(height(-1490, 0)).toBeCloseTo(8, 5);
    expect(height(-1503, 0)).toBeGreaterThan(8 + 19);
    expect(height(-1503, 0) - height(-1497, 0)).toBeGreaterThan(18);
    expect(height(-1560, 0)).toBeGreaterThan(8 + 5);
    expect(height(-1620, 0)).toBeCloseTo(8, 5);
    expect(height(-1503, 590)).toBeLessThan(height(-1503, 0));
  });

  test("erosion cuts gullies into a summit but never raises it", () => {
    const worn = surveyHeightField({ ...survey, hills: [], cliffs: [], peaks: survey.peaks.slice(0, 1) }, flat);
    const smooth = surveyHeightField({ ...survey, hills: [], cliffs: [], peaks: survey.peaks.slice(1) }, flat);
    let deepest = 0;
    for (let angle = 0; angle < Math.PI * 2; angle += 0.05) {
      const x = Math.cos(angle) * 120;
      const z = Math.sin(angle) * 120;
      expect(worn(x, z)).toBeLessThanOrEqual(smooth(x, z) + 1e-6);
      deepest = Math.max(deepest, smooth(x, z) - worn(x, z));
    }
    expect(deepest).toBeGreaterThan(10);
  });
});
