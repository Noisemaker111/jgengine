import { describe, expect, test } from "bun:test";

import type { EditorDocument } from "@jgengine/core/editor/types";

import { environment, sky } from "@jgengine/core/world/features";

import { defineGame } from "./defineGame";

function doc(environment: EditorDocument["environment"]): EditorDocument {
  return { version: 1, markers: [], volumes: [], paths: [], annotations: [], prefabs: [], collections: [], environment } as EditorDocument;
}

describe("defineGame document sky", () => {
  test("an authored document sky fills an empty backdrop", () => {
    const playable = defineGame({ name: "Doc sky", editorLayers: doc({ preset: "dusk", sunAzimuth: 120, fog: { far: 90 } }) });
    expect(playable.backdrop?.sky).toEqual({ preset: "dusk", sun: { azimuth: 120 }, fog: { far: 90 } });
  });

  test("keeps other backdrop fields when adding the document sky", () => {
    const playable = defineGame({ name: "Doc sky", backdrop: { background: "#123" }, editorLayers: doc({ preset: "day" }) });
    expect(playable.backdrop).toEqual({ background: "#123", sky: { preset: "day" } });
  });

  test("an environment with only point lights leaves the world sky alone and keeps its lamps", () => {
    const lamps = defineGame({ name: "Lamps", editorLayers: doc({ pointLights: [{ position: [0, 2, 0] }] }) });
    expect(lamps.backdrop).toBeUndefined();
    expect(lamps.lighting?.point).toEqual([{ position: [0, 2, 0] }]);
    expect(defineGame({ name: "Bare", editorLayers: doc(undefined) }).backdrop).toBeUndefined();
  });
});

describe("defineGame look and mood", () => {
  test("look and mood reach the playable so the shell resolves the same look", () => {
    const playable = defineGame({ name: "Moody", look: "cinematic", mood: "golden" });
    expect(playable.look).toBe("cinematic");
    expect(playable.mood).toBe("golden");
    expect(playable.lighting?.directional?.[0]?.castShadow).toBe(true);
    expect(playable.backdrop?.sky?.sunColor).toBeDefined();
  });

  test("a mood keeps the document's lamps and lets the document place the sun", () => {
    const playable = defineGame({ name: "Moody lamps", look: "cinematic", mood: "dusk",
      editorLayers: doc({ sunAzimuth: 90, sunElevation: 30, pointLights: [{ position: [1, 2, 3] }] }) });
    expect(playable.lighting?.point).toEqual([{ position: [1, 2, 3] }]);
    expect(playable.backdrop?.sky?.sun).toEqual({ azimuth: 90, elevation: 30 });
    const [x, y, z] = playable.lighting!.directional![0]!.position!;
    expect(x).toBeGreaterThan(0);
    expect(Math.abs(z)).toBeLessThan(1e-6);
    expect(Math.atan2(y, Math.hypot(x, z)) * 180 / Math.PI).toBeCloseTo(30, 5);
  });

  test("a flat look stays flat after defineGame", () => {
    expect(defineGame({ name: "Flat", look: "flat" }).look).toBe("flat");
  });
});

describe("defineGame document sky compatibility", () => {
  test("sparse document edits preserve legacy clouds and unsupported sky fields without mutation", () => {
    const worldSky = sky({ preset: "day", timeOfDay: true, hazeStrength: 0.3, radius: 800,
      cloudiness: 0, gradientExponent: 0.8, sunGlowStrength: 1.4,
      sun: { azimuth: 20, elevation: 48 }, fog: { color: "#abc", near: 40, far: 900 },
      volumetricClouds: { coverage: 0.25, seed: "field-survey" } });
    const document = doc({ preset: "dusk", timeOfDay: false, sunAzimuth: 120, fog: { near: undefined, far: 90 } });
    const before = structuredClone({ worldSky, document });
    const playable = defineGame({ name: "Outdoor survey", world: environment({ sky: worldSky }), editorLayers: document });
    expect(playable.backdrop?.sky).toEqual({ ...worldSky, preset: "dusk", timeOfDay: false,
      sun: { azimuth: 120, elevation: 48 }, fog: { color: "#abc", near: 40, far: 90 } });
    expect({ worldSky, document }).toEqual(before);
  });

  test("a cloudless night consumer keeps its shape while applying partial sun and fog edits", () => {
    const worldSky = sky({ preset: "night", timeOfDay: false, hazeStrength: 0, radius: 120,
      gradientExponent: 0.35, sun: { azimuth: 230, elevation: 12 }, fog: { near: 25, far: 100 } });
    const playable = defineGame({ name: "Night courtyard", world: environment({ sky: worldSky }),
      editorLayers: doc({ horizonColor: "#123456", sunElevation: 8, fog: { near: 5 } }) });
    expect(playable.backdrop?.sky).toEqual({ ...worldSky, horizonColor: "#123456",
      sun: { azimuth: 230, elevation: 8 }, fog: { near: 5, far: 100 } });
    expect(playable.backdrop?.sky?.volumetricClouds).toBeUndefined();
  });

  test("a document-only consumer does not acquire legacy defaults", () => {
    const playable = defineGame({ name: "Document sky", editorLayers: doc({ preset: "night", fog: { far: 90 } }) });
    expect(playable.backdrop?.sky).toEqual({ preset: "night", fog: { far: 90 } });
  });

  test("an explicit game backdrop stays authoritative over world and document skies", () => {
    const backdrop = { sky: { preset: "night" as const, hazeStrength: 0.1 }, background: "#000" };
    const before = structuredClone(backdrop);
    const playable = defineGame({ name: "Explicit backdrop", world: environment({ sky: sky({ volumetricClouds: { coverage: 0.8 } }) }),
      editorLayers: doc({ preset: "dusk", sunAzimuth: 120 }), backdrop });
    expect(playable.backdrop).toEqual(backdrop);
    expect(backdrop).toEqual(before);
  });
});
