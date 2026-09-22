import { describe, expect, test } from "bun:test";

import type { EditorDocument } from "@jgengine/core/editor/types";

import { withDocumentSky } from "./defineGame";

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
