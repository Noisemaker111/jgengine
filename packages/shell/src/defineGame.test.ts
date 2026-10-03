import { describe, expect, test } from "bun:test";

import type { EditorDocument } from "@jgengine/core/editor/types";

import { environment, sky } from "@jgengine/core/world/features";

import { defineGame, withDocumentSky } from "./defineGame";

function doc(environment: EditorDocument["environment"]): EditorDocument {
  return { version: 1, markers: [], volumes: [], paths: [], annotations: [], prefabs: [], collections: [], environment } as EditorDocument;
}

describe("withDocumentSky", () => {
  test("an authored document sky fills an empty backdrop", () => {
    const backdrop = withDocumentSky(undefined, doc({ preset: "dusk", sunAzimuth: 120, fog: { far: 90 } }));
    expect(backdrop?.sky).toEqual({ preset: "dusk", sun: { azimuth: 120 }, fog: { far: 90 } });
  });

  test("the game's own backdrop sky wins over the document", () => {
    const backdrop = withDocumentSky({ sky: { preset: "night" }, background: "#000" }, doc({ preset: "day" }));
    expect(backdrop).toEqual({ sky: { preset: "night" }, background: "#000" });
  });

  test("keeps other backdrop fields when adding the document sky", () => {
    expect(withDocumentSky({ background: "#123" }, doc({ preset: "day" }))).toEqual({ background: "#123", sky: { preset: "day" } });
  });

  test("an environment with only point lights leaves the world sky alone", () => {
    expect(withDocumentSky(undefined, doc({ pointLights: [{ position: [0, 2, 0] }] }))).toBeUndefined();
    expect(withDocumentSky(undefined, doc(undefined))).toBeUndefined();
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
