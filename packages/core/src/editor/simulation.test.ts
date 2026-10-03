import { describe, expect, test } from "bun:test";
import { createEditorSession } from "./commands";
import { applyEditorDocumentOverlay, cloneEditorDocument, createEmptyEditorDocument, decodeEditorDocument, exportEditorDocumentJson, importEditorDocumentJson, mergeEditorDocuments, normalizeEditorLayers } from "./document";
import type { EditorSimulation } from "./simulation";

const simulation: EditorSimulation = {
  weather: { profiles: [{ id: "storm", mode: "rain", intensity: 0.8 }], schedule: [{ atSeconds: 10, profileId: "storm", transitionSeconds: 4 }], wind: { direction: [1, 0], speed: 5 }, zones: [{ id: "valley", center: [2, 4], radius: 10, falloff: 2, wind: { speed: 2 } }] },
  emitters: [{ id: "chimney", position: { x: 1, y: 4, z: 2 }, config: { rate: 4, max: 20, seed: "smoke" }, options: { render: { shape: "smoke" }, space: "world" } }],
  fires: [{ id: "camp", position: { x: 0, y: 0, z: 0 }, config: { cols: 2, rows: 1, cellSize: 1 }, fuel: [0.5, 1], ignitions: [{ col: 0, row: 0 }] }],
  habitats: [{ id: "birds", species: "swallow", position: { x: 0, y: 4, z: 0 }, radius: 8, count: 4, seed: 2, role: "cosmetic", steering: { maxSpeed: 5, separationRadius: 1, neighborRadius: 5 } }],
};

describe("authored simulation document", () => {
  test("nested authored metadata and schemas detach across play snapshot boundaries", () => {
    const document = createEmptyEditorDocument();
    document.markers.push({ id: "source", kind: "prop", position: { x: 0, y: 0, z: 0 }, meta: { nested: { speed: 5 } } });
    document.catalogs.push({ id: "values", entries: [{ id: "row", meta: { nested: [1, 2] } }], schema: [{ type: "text", key: "label", default: "untouched" }] });
    const play = cloneEditorDocument(document);
    (play.markers[0]!.meta!.nested as { speed: number }).speed = 99;
    (play.catalogs[0]!.entries[0]!.meta!.nested as number[])[0] = 99;
    play.catalogs[0]!.schema![0]!.key = "changed";
    expect(document.markers[0]!.meta!.nested).toEqual({ speed: 5 });
    expect(document.catalogs[0]!.entries[0]!.meta!.nested).toEqual([1, 2]);
    expect(document.catalogs[0]!.schema![0]!.key).toBe("label");
  });
  test("save/reopen, clone, normalization, overlay and merge preserve detached inputs", () => {
    const document = { ...createEmptyEditorDocument(), simulation: structuredClone(simulation) };
    for (const next of [cloneEditorDocument(document), normalizeEditorLayers(document), applyEditorDocumentOverlay(createEmptyEditorDocument(), document), mergeEditorDocuments(document), importEditorDocumentJson(exportEditorDocumentJson(document))]) {
      expect(next.simulation).toEqual(simulation);
      next.simulation!.weather!.zones![0]!.center = [900, 900];
      expect(document.simulation.weather!.zones![0]!.center).toEqual([2, 4]);
    }
  });
  test("set, undo, redo and clear are one authored history step", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    session.dispatch({ type: "setSimulation", simulation });
    session.dispatch({ type: "undo" });
    expect(session.getState().document.simulation).toBeUndefined();
    session.dispatch({ type: "redo" });
    expect(session.getState().document.simulation).toEqual(simulation);
    session.dispatch({ type: "setSimulation", simulation: undefined });
    expect(session.getState().document.simulation).toBeUndefined();
    session.dispatch({ type: "undo" });
    expect(session.getState().document.simulation).toEqual(simulation);
  });
  test("invalid references and budgets fail without partial history or publication", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    let publications = 0;
    session.subscribe(() => publications++);
    const result = session.transaction([{ type: "addMarker", marker: { id: "first", kind: "prop", position: { x: 0, y: 0, z: 0 } } }, { type: "setSimulation", simulation: { weather: { schedule: [{ atSeconds: 1, profileId: "missing" }] } } }]);
    expect(result.ok).toBe(false);
    expect(session.getState().document.markers).toHaveLength(0);
    expect(session.canUndo()).toBe(false);
    expect(publications).toBe(0);
    expect(decodeEditorDocument({ ...createEmptyEditorDocument(), simulation: { fires: [{ id: "large", position: { x: 0, y: 0, z: 0 }, config: { cols: 256, rows: 256, cellSize: 1 } }] } }).ok).toBe(false);
    expect(decodeEditorDocument({ ...createEmptyEditorDocument(), simulation: { habitats: [{ ...simulation.habitats![0], routeId: "missing" }] } }).ok).toBe(false);
  });
});

test("simulation typos and runtime-invalid fire bounds are rejected before history changes", () => {
  const session = createEditorSession(createEmptyEditorDocument());
  const malformed = [
    { weathre: { ambient: { mode: "rain", intensity: 1 } } },
    { weather: [] },
    { weather: { ambient: { mode: "rain", intensity: 1, tempratureOffset: 2 } } },
    { fires: [{ id: "bad", position: { x: 0, y: 0, z: 0 }, config: { cols: 2, rows: 1, cellSize: 1, maxCells: 1 } }] },
    { fires: [{ id: "bad", position: { x: 0, y: 0, z: 0 }, config: { cols: 2, rows: 1, cellSize: 1, maxCells: 2.5 } }] },
  ];
  for (const value of malformed) {
    const result = session.transaction([{ type: "setSimulation", simulation: value as EditorSimulation }]);
    expect(result.ok).toBe(false);
    expect(session.getState().document.simulation).toBeUndefined();
    expect(session.canUndo()).toBe(false);
  }
});

test("emitter fire bindings require a defined authored area", () => {
  const document = { ...createEmptyEditorDocument(), simulation: structuredClone(simulation) };
  document.simulation.emitters![0]!.fireAreaId = "missing";
  expect(decodeEditorDocument(document).ok).toBe(false);
  document.simulation.emitters![0]!.fireAreaId = "camp";
  expect(decodeEditorDocument(document).ok).toBe(true);
});
