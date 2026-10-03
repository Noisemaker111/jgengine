import { expect, test } from "bun:test";
import { createEditorSession } from "./commands";
import { normalizeEditorLayers } from "./document";
import { createCreatorDocumentStorage, importCreatorDocument, validateCreatorDocument, type CreatorPolicy } from "./creatorStorage";

const policy: CreatorPolicy = {
  maxDocuments: 2, maxBytes: 10000, maxObjects: 2, maxPathPoints: 8,
  maxGridCells: 4, maxTerrainVertices: 4, allowedKinds: ["player_spawn", "prop"],
  allowedAssets: ["pad"], allowedCatalogIds: ["platform"],
};
const initial = () => normalizeEditorLayers({ markers: [{ id: "spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 0 } }] });
const value = (id = "course") => ({ version: 1 as const, id, name: "Cloud course", revision: 0, document: initial() });

test("creator durable saves reopen named versioned documents across adapters and reject stale writers", async () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, json: string) => { values.set(key, json); }, removeItem: (key: string) => { values.delete(key); } };
  const first = createCreatorDocumentStorage({ storage, key: "courses", policy });
  const saved = await first.save(value(), null);
  saved.document.markers[0]!.position.x = 99;
  const second = createCreatorDocumentStorage({ storage, key: "courses", policy });
  expect((await second.load("course"))?.document.markers[0]!.position.x).toBe(0);
  expect(await second.list()).toEqual([{ version: 1, id: "course", name: "Cloud course", revision: 1 }]);
  await second.save({ ...value(), name: "Edited" }, 1);
  await expect(first.save(value(), 1)).rejects.toThrow("changed in storage");
  await second.save(value("two"), null);
  await expect(first.save(value("three"), null)).rejects.toThrow("full");
});

test("creator surfaces durable failure without acknowledging a save", async () => {
  const adapter = createCreatorDocumentStorage({ storage: { getItem: () => null, setItem: () => { throw new Error("quota exceeded"); }, removeItem: () => {} }, key: "courses", policy });
  await expect(adapter.save(value(), null)).rejects.toThrow("quota exceeded");
  expect(await adapter.load("course")).toBeNull();
});

test("creator imports reject catalog, schema, amplification and budget bypasses", () => {
  expect(() => importCreatorDocument('{"version":77}', policy)).toThrow();
  expect(() => validateCreatorDocument({ ...initial(), markers: [{ id: "x", kind: "unapproved", position: { x: 0, y: 0, z: 0 } }] }, policy)).toThrow("kind");
  expect(() => validateCreatorDocument({ ...initial(), markers: [{ ...initial().markers[0], catalogId: "unknown" }] }, policy)).toThrow("catalog");
  expect(() => validateCreatorDocument({ ...initial(), markers: [{ ...initial().markers[0], meta: { url: "https://unapproved.test/model.glb" } }] }, policy)).toThrow("external");
  expect(() => validateCreatorDocument({ ...initial(), directives: [{ id: "forest", kind: "scatter", asset: "pad", density: 1, area: { min: [0, 0], max: [1000, 1000] } }] }, policy)).toThrow("explicit");
  expect(() => importCreatorDocument(" ".repeat(10001), policy)).toThrow("byte");
});

test("creator command and transaction constraints reject atomically without undo or publication", () => {
  const session = createEditorSession(initial(), 100, (document) => { validateCreatorDocument(document, policy); });
  const before = session.getState();
  let publications = 0;
  session.subscribe(() => { publications += 1; });
  const add = (id: string) => ({ type: "addMarker" as const, marker: { id, kind: "prop", position: { x: 1, y: 0, z: 0 } } });
  expect(session.transaction([add("a"), add("b")]).ok).toBe(false);
  expect(session.getState()).toBe(before);
  expect(session.canUndo()).toBe(false);
  expect(publications).toBe(0);
  session.dispatch(add("a"));
  const accepted = session.getState();
  expect(() => session.dispatch(add("b"))).toThrow("object");
  expect(session.getState()).toBe(accepted);
  session.dispatch({ type: "undo" });
  expect(session.getState().document.markers.length).toBe(1);
});

test("creator simulation force and particle budgets default to denied and can be bounded explicitly", () => {
  const forces = { ...initial(), simulation: { forces: [{ center: [0, 0, 0], shape: { kind: "sphere", radius: 3 }, strength: 2 }] } };
  expect(() => validateCreatorDocument(forces, policy)).toThrow("force field budget");
  expect(validateCreatorDocument(forces, { ...policy, maxForceFields: 1 }).simulation?.forces?.length).toBe(1);
  const emitters = { ...initial(), simulation: { emitters: [{ id: "rain", position: { x: 0, y: 0, z: 0 }, config: { max: 512 } }] } };
  expect(() => validateCreatorDocument(emitters, policy)).toThrow("particle budget");
  expect(() => validateCreatorDocument(emitters, { ...policy, maxSimulationParticles: 511 })).toThrow("particle budget");
  expect(() => validateCreatorDocument({ ...initial(), simulation: { weather: { ambient: { mode: "rain", intensity: 1 } } } }, { ...policy, maxSimulationParticles: 0 })).toThrow("particle budget");
  const weather = { ...initial(), simulation: { weather: { ambient: { mode: "rain" as const, intensity: 1 } } } };
  expect(() => validateCreatorDocument(weather, { ...policy, maxSimulationParticles: 5555 })).toThrow("particle budget");
  expect(validateCreatorDocument(weather, { ...policy, maxSimulationParticles: 5556 }).simulation?.weather?.ambient?.mode).toBe("rain");
  expect(() => validateCreatorDocument({ ...initial(), paths: [{ id: "forest", kind: "scatter", points: [{ x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }, { x: 1000, y: 0, z: 1000 }], meta: { item: "unapproved", density: 1000 } }] }, { ...policy, allowedKinds: [...policy.allowedKinds, "scatter"] })).toThrow("explicit placements");
});

test("creator reserves concurrent collision child pools inside the particle budget", () => {
  const document = { ...initial(), simulation: { emitters: [{ id: "impact", position: { x: 0, y: 1, z: 0 }, config: { max: 1, rate: 10, collision: { planeY: 0, response: "kill" as const } }, options: { collisionEffect: { count: 64, config: { max: 2 } } } }] } };
  expect(() => validateCreatorDocument(document, { ...policy, maxSimulationParticles: 64 })).toThrow("particle budget");
  expect(validateCreatorDocument(document, { ...policy, maxSimulationParticles: 65 }).simulation?.emitters?.[0]?.options?.collisionEffect?.count).toBe(64);
  const second = { ...document, simulation: { emitters: [...document.simulation.emitters, { ...document.simulation.emitters[0]!, id: "second" }] } };
  expect(validateCreatorDocument(second, { ...policy, maxSimulationParticles: 66 }).simulation?.emitters?.length).toBe(2);
  document.simulation.emitters[0]!.options.collisionEffect.config.max = 65536;
  document.simulation.emitters[0]!.options.collisionEffect.count = 65536;
  expect(() => validateCreatorDocument(document, { ...policy, maxSimulationParticles: 65 })).toThrow("particle budget");
});
