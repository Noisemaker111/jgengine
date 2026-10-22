import { describe, expect, test } from "bun:test";

import { decodeEditorDocument } from "./document";
import { authoredLightsFromDocument, bakeLightProbe, lightProbesFromDocument } from "./environment";
import { PROBE_STRIDE } from "../render/lightProbes";

const emptyDocument = (environment: unknown) => ({
  version: 1,
  markers: [],
  volumes: [],
  paths: [],
  annotations: [],
  prefabs: [],
  collections: [],
  catalogs: [],
  environment,
});

const probe = {
  id: "clubhouse",
  center: [0, 2, 0],
  size: [10, 4, 8],
  resolution: [3, 2, 2],
  label: "Clubhouse",
  bake: { skyVisibility: 0.15, ceilingColor: "#e0d8c8", floorColor: "#3f3a30", fillIntensity: 0.9 },
};

describe("irradiance volumes on the scene document", () => {
  test("an authored probe volume decodes and keeps its bake settings", () => {
    const decoded = decodeEditorDocument(emptyDocument({ probe: 1, probes: [probe] }));
    expect(decoded.document?.environment?.probes?.length).toBe(1);
    expect(decoded.document?.environment?.probes?.[0]?.id).toBe("clubhouse");
    expect(decoded.document?.environment?.probes?.[0]?.bake?.skyVisibility).toBe(0.15);
  });

  test("a volume with the wrong sample count is rejected by path", () => {
    const decoded = decodeEditorDocument(emptyDocument({ probes: [{ ...probe, samples: [1, 2, 3] }] }));
    expect(decoded.document).toBeUndefined();
    expect(decoded.errors.some((error) => error.path === "$.environment.probes[0].samples")).toBe(true);
  });

  test("sampling a document with no probes reads as an empty list", () => {
    const decoded = decodeEditorDocument(emptyDocument({ preset: "day" }));
    expect(lightProbesFromDocument(decoded.document!)).toEqual([]);
  });

  test("baking fills exactly the grid's sample count from the authored settings", () => {
    const decoded = decodeEditorDocument(emptyDocument({ probes: [probe] }));
    const doc = decoded.document!;
    const baked = bakeLightProbe(doc.environment!.probes![0]!, doc);
    expect(baked.samples?.length).toBe(PROBE_STRIDE * 3 * 2 * 2);
    expect(baked.samples?.every((sample) => Number.isFinite(sample))).toBe(true);
    expect(baked.samples?.some((sample) => sample !== 0)).toBe(true);
  });

  test("authored light markers and environment point lights both feed the bake", () => {
    const doc = {
      ...emptyDocument({ probes: [probe], pointLights: [{ position: [1, 3, 1], intensity: 4 }] }),
      markers: [{ id: "lamp", kind: "light", label: "Lamp", position: { x: -2, y: 3, z: 0 }, meta: { intensity: 5, range: 9 } }],
    };
    const decoded = decodeEditorDocument(doc);
    const lamps = authoredLightsFromDocument(decoded.document!);
    expect(lamps.length).toBe(2);
    expect(lamps[0]?.distance).toBe(9);
  });
});
