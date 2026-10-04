import { describe, expect, test } from "bun:test";

import { createObjectStore } from "../scene/objectStore";
import {
  markerAnimation,
  markerCatalogId,
  placeAuthoredObjects,
  placeAuthoredObjectsFromDocument,
  resolveAuthoredObjects,
  resolveAuthoredObjectsWithDiagnostics,
  syncAuthoredObjects,
  type AuthoredObject,
} from "./authoredObjects";

const doc = {
  markers: [
    {
      id: "crate_a",
      kind: "prop",
      position: { x: 10, y: 0, z: -4 },
      rotationY: 1.5,
      meta: { catalogId: "wood_crate" },
    },
    {
      id: "spawn",
      kind: "player_spawn",
      position: { x: 0, y: 0, z: 0 },
    },
    {
      id: "barrel_b",
      kind: "prop",
      position: { x: -2, y: 0, z: 8 },
      catalogId: "oil_barrel",
      meta: { verticalOffset: 0.25 },
    },
    {
      id: "gen",
      kind: "prop",
      position: { x: 1, y: 0, z: 1 },
      meta: { assetId: "building", catalogId: "" },
    },
    {
      id: "empty_meta",
      kind: "prop",
      position: { x: 3, y: 0, z: 3 },
      meta: { label: "no catalog" },
    },
  ],
};

describe("markerCatalogId", () => {
  test("reads first-class catalogId over meta", () => {
    expect(
      markerCatalogId({
        id: "m",
        kind: "prop",
        position: { x: 0, y: 0, z: 0 },
        catalogId: "typed",
        meta: { catalogId: "meta" },
      }),
    ).toBe("typed");
  });

  test("falls back to meta.catalogId", () => {
    expect(
      markerCatalogId({
        id: "m",
        kind: "prop",
        position: { x: 0, y: 0, z: 0 },
        meta: { catalogId: "from_meta" },
      }),
    ).toBe("from_meta");
  });

  test("returns null when neither field carries a non-empty id", () => {
    expect(markerCatalogId({ id: "m", kind: "prop", position: { x: 0, y: 0, z: 0 } })).toBeNull();
    expect(
      markerCatalogId({
        id: "m",
        kind: "prop",
        position: { x: 0, y: 0, z: 0 },
        meta: { catalogId: "" },
      }),
    ).toBeNull();
  });
});

describe("resolveAuthoredObjects", () => {
  test("returns only markers with a catalog id", () => {
    const objects = resolveAuthoredObjects(doc);
    expect(objects.map((o) => o.instanceId)).toEqual(["crate_a", "barrel_b"]);
  });

  test("maps position, rotation, and verticalOffset", () => {
    const objects = resolveAuthoredObjects(doc);
    expect(objects[0]).toEqual({
      catalogId: "wood_crate",
      x: 10,
      z: -4,
      rotationY: 1.5,
      instanceId: "crate_a",
      verticalOffset: 0,
    } satisfies AuthoredObject);
    expect(objects[1]).toMatchObject({
      catalogId: "oil_barrel",
      x: -2,
      z: 8,
      rotationY: 0,
      instanceId: "barrel_b",
      verticalOffset: 0.25,
    });
  });

  test("is empty for a document with no catalog markers", () => {
    expect(resolveAuthoredObjects({ markers: [] })).toEqual([]);
    expect(
      resolveAuthoredObjects({
        markers: [{ id: "spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 0 } }],
      }),
    ).toEqual([]);
  });
});

describe("placeAuthoredObjects", () => {
  test("grounds each object on the height sampler and places into the store", () => {
    const store = createObjectStore();
    const objects = resolveAuthoredObjects(doc);
    const ids = placeAuthoredObjects(store, objects, (x, z) => x + z * 0.1, { verticalOffset: 0.5 });
    expect(ids).toEqual(["crate_a", "barrel_b"]);
    const crate = store.get("crate_a")!;
    expect(crate.catalogId).toBe("wood_crate");
    expect(crate.position[0]).toBe(10);
    expect(crate.position[2]).toBe(-4);
    expect(crate.position[1]).toBeCloseTo(10 + -4 * 0.1 + 0.5, 5);
    expect(crate.rotationY).toBe(1.5);
    const barrel = store.get("barrel_b")!;
    expect(barrel.position[1]).toBeCloseTo(-2 + 8 * 0.1 + 0.25 + 0.5, 5);
  });

  test("placeAuthoredObjectsFromDocument is resolve + place", () => {
    const store = createObjectStore();
    placeAuthoredObjectsFromDocument(store, doc, () => 2, { onExisting: "keep" });
    expect(store.list().map((o) => o.instanceId).sort()).toEqual(["barrel_b", "crate_a"]);
    placeAuthoredObjectsFromDocument(store, doc, () => 9, { onExisting: "keep" });
    expect(store.get("crate_a")!.position[1]).toBe(2);
  });
});

describe("authored animation (marker.meta.animation → placed ModelConfig.animation, #1276)", () => {
  const animConfig = { states: { idle: "Idle", walk: "Walk" }, oneShots: { attack: "Attack" } };
  const animDoc = {
    markers: [
      {
        id: "guard",
        kind: "prop",
        position: { x: 5, y: 0, z: 5 },
        catalogId: "knight",
        meta: { animation: animConfig },
      },
      {
        id: "statue",
        kind: "prop",
        position: { x: 6, y: 0, z: 6 },
        catalogId: "knight",
        meta: { animation: "none" },
      },
      {
        id: "plain",
        kind: "prop",
        position: { x: 7, y: 0, z: 7 },
        catalogId: "knight",
      },
    ],
  };

  test("markerAnimation reads the override, passing string modes and configs, else undefined", () => {
    expect(markerAnimation({ id: "a", kind: "prop", position: { x: 0, y: 0, z: 0 }, meta: { animation: "auto" } })).toBe(
      "auto",
    );
    expect(markerAnimation({ id: "a", kind: "prop", position: { x: 0, y: 0, z: 0 }, meta: { animation: "none" } })).toBe(
      "none",
    );
    expect(
      markerAnimation({ id: "a", kind: "prop", position: { x: 0, y: 0, z: 0 }, meta: { animation: animConfig } }),
    ).toEqual(animConfig);
    expect(markerAnimation({ id: "a", kind: "prop", position: { x: 0, y: 0, z: 0 } })).toBeUndefined();
    // Malformed values (array / non-record) are ignored — no override.
    expect(
      markerAnimation({ id: "a", kind: "prop", position: { x: 0, y: 0, z: 0 }, meta: { animation: ["Idle"] } }),
    ).toBeUndefined();
  });

  test("resolveAuthoredObjects carries the authored animation; a marker without it omits the field", () => {
    const [guard, statue, plain] = resolveAuthoredObjects(animDoc);
    expect(guard!.animation).toEqual(animConfig);
    expect(statue!.animation).toBe("none");
    expect(plain!.animation).toBeUndefined();
    expect("animation" in plain!).toBe(false);
  });

  test("placeAuthoredObjects lands the override on the placed object's ModelConfig.animation", () => {
    const store = createObjectStore();
    placeAuthoredObjects(store, resolveAuthoredObjects(animDoc), () => 0);
    expect(store.get("guard")!.animation).toEqual(animConfig);
    expect(store.get("statue")!.animation).toBe("none");
    // Absent override → catalog-resolved default (no per-placement animation stored) unchanged.
    expect(store.get("plain")!.animation).toBeUndefined();
  });
});

test("document synchronization updates authored poses and removes ghosts without touching game objects", async () => {
  const { syncAuthoredObjects } = await import("./authoredObjects");
  const store = createObjectStore();
  store.place("game_loot", 12, 0, 12, { instanceId: "runtime" });
  let owned = syncAuthoredObjects(store, resolveAuthoredObjects(doc), [], () => 2);
  const edited = structuredClone(doc);
  edited.markers[0]!.position.x = 25;
  edited.markers[0]!.rotationY = 2.5;
  edited.markers[0]!.meta = { catalogId: "wood_crate", verticalOffset: 3 };
  owned = syncAuthoredObjects(store, resolveAuthoredObjects(edited), owned, () => 4);
  expect(store.get("crate_a")!.position).toEqual([25, 7, -4]);
  expect(store.get("crate_a")!.rotationY).toBe(2.5);
  owned = syncAuthoredObjects(store, [], owned, () => 4);
  expect(owned).toEqual([]);
  expect(store.get("crate_a")).toBeNull();
  expect(store.get("barrel_b")).toBeNull();
  expect(store.get("runtime")!.catalogId).toBe("game_loot");
});


test("initial sync and unrelated edits preserve game initialized prop state", async () => {
  const { syncAuthoredObjects } = await import("./authoredObjects");
  const store = createObjectStore();
  store.place("wood_crate", 91, 8, 43, { instanceId: "crate_a", rotation: 0.7 });
  const objects = resolveAuthoredObjects(doc);
  const previous = syncAuthoredObjects(store, objects, [], () => 2);
  expect(store.get("crate_a")!.position).toEqual([91, 8, 43]);
  syncAuthoredObjects(store, resolveAuthoredObjects(structuredClone(doc)), previous, () => 9);
  expect(store.get("crate_a")!.position).toEqual([91, 8, 43]);
  expect(store.get("crate_a")!.rotationY).toBe(0.7);
});


test("malformed saved animation is omitted from normal static placements and object-store overrides", () => {
  for (const animation of [{ clip: 7 }, { clock: "calendar" }, { auto: false }, { states: { idle: "Idle", walk: false } }]) {
    const authored = { ...doc, markers: [{ ...doc.markers[0]!, meta: { ...doc.markers[0]!.meta, animation } }] };
    expect(markerAnimation(authored.markers[0]!)).toBeUndefined();
    const objects = resolveAuthoredObjects(authored);
    expect(objects).toEqual(resolveAuthoredObjects({ ...authored, markers: [{ ...authored.markers[0]!, meta: { ...authored.markers[0]!.meta, animation: undefined } }] }));
    expect(Object.hasOwn(objects[0]!, "animation")).toBe(false);
    const store = createObjectStore();
    placeAuthoredObjectsFromDocument(store, authored, (x, z) => x + z, { verticalOffset: 0.5 });
    const placed = store.get("crate_a")!;
    expect(placed.animation).toBeUndefined();
    expect(placed.position).toEqual([10, 6.5, -4]);
    expect(placed.rotationY).toBe(1.5);
    expect(authored.markers[0]!.meta.animation).toBe(animation);
  }
});


test("static placement reports located whole-config rejection without consuming excluded character markers", () => {
  const bad = { graph: { layers: [{ id: "base", entry: "idle", states: { idle: { kind: "clip", clip: "Idle" } }, transitions: [{ from: "idle", to: "missing" }] }] } };
  const markers = [
    { ...doc.markers[0]!, id: "dynamic", kind: "mob", catalogId: "dynamic-rig", meta: { animation: { clip: 7 } } },
    { ...doc.markers[0]!, id: "unplaced", catalogId: undefined, meta: { animation: { clip: 7 } } },
    { ...doc.markers[0]!, id: "bad", meta: { ...doc.markers[0]!.meta, animation: bad } },
  ];
  const original = structuredClone(markers);
  const result = resolveAuthoredObjectsWithDiagnostics({ markers });
  expect(result.objects.map((object) => object.instanceId)).toEqual(["bad"]);
  expect(result.objects[0]!.animation).toBeUndefined();
  expect(result.diagnostics).toEqual([{ path: "markers[2].meta.animation.graph.layers[0].transitions[0].to", message: "Transition references an unknown state.", repair: "Choose a state declared in this layer; only from may use *." }]);
  expect(markers).toEqual(original);
  expect(resolveAuthoredObjects({ markers })).toEqual(result.objects);
  const custom = resolveAuthoredObjectsWithDiagnostics({ markers }, { excludeKinds: [] });
  expect(custom.objects.map((object) => object.instanceId)).toEqual(["dynamic", "bad"]);
  expect(custom.diagnostics.map((diagnostic) => diagnostic.path)).toEqual(["markers[0].meta.animation.clip", "markers[2].meta.animation.graph.layers[0].transitions[0].to"]);
});

test("static animation validation retains explicit modes, partial maps, signed values and ordered extension data", () => {
  const configurations = ["auto", "none", {}, { states: {} }, { states: { run: "Running_A" } }, { clip: "Idle", clock: "game", auto: true, time: -1, timeScale: -0.5, oneShots: { attack: ["Chop", "Slice"], hit: [] }, identity: { authoredOrder: ["keep", "identity"] } }];
  for (const animation of configurations) {
    const authored = { markers: [{ ...doc.markers[0]!, meta: { ...doc.markers[0]!.meta, animation } }] };
    const result = resolveAuthoredObjectsWithDiagnostics(authored);
    expect(result.diagnostics).toEqual([]);
    expect(markerAnimation(authored.markers[0]!)).toBe(animation);
    expect(result.objects[0]!.animation).toBe(animation);
    const store = createObjectStore();
    placeAuthoredObjects(store, result.objects, () => 7, { verticalOffset: 0.5 });
    expect(store.get("crate_a")!.animation).toBe(animation);
  }
});

test("batch validation uses one indexed document pass and reads only placed animation values", () => {
  let reads = 0;
  const markers = Array.from({ length: 120 }, (_, index) => ({
    id: `marker-${index}`, kind: index % 3 === 0 ? "mob" : "prop", catalogId: "rig", position: { x: index, y: 0, z: 0 },
    meta: { get animation() { reads += 1; return { clip: 7 }; } },
  }));
  const withoutLookups = new Proxy(markers, { get(target, property, receiver) { if (property === "findIndex" || property === "find") throw new Error("Batch resolution must not look up each marker again"); return Reflect.get(target, property, receiver); } });
  const result = resolveAuthoredObjectsWithDiagnostics({ markers: withoutLookups });
  expect(reads).toBe(80);
  expect(result.objects).toHaveLength(80);
  expect(result.diagnostics).toHaveLength(80);
  expect(result.diagnostics[0]!.path).toBe("markers[1].meta.animation.clip");
  expect(result.diagnostics.at(-1)!.path).toBe("markers[119].meta.animation.clip");
});


test("live authored synchronization clears an invalid override and restores a repaired one without changing placement ownership", () => {
  const animation = { clip: "Idle", paused: true, time: 0.75, timeScale: 0.5, oneShots: { attack: ["Slice", "Chop"] } };
  const original = { markers: [{ ...doc.markers[0]!, meta: { ...doc.markers[0]!.meta, animation, verticalOffset: 0.25 } }] };
  const store = createObjectStore();
  store.place("runtime", 100, 2, 100, { instanceId: "runtime-owned" });
  let previous = syncAuthoredObjects(store, resolveAuthoredObjects(original), [], () => 3, { verticalOffset: 0.5 });
  const placed = store.get("crate_a")!;
  expect(placed.animation).toEqual(animation);
  expect(placed.position).toEqual([10, 3.75, -4]);
  const invalid = { markers: [{ ...original.markers[0]!, meta: { ...original.markers[0]!.meta, animation: { ...animation, clock: "calendar" } } }] };
  const rejected = resolveAuthoredObjectsWithDiagnostics(invalid);
  expect(rejected.diagnostics[0]!.path).toBe("markers[0].meta.animation.clock");
  previous = syncAuthoredObjects(store, rejected.objects, previous, () => 3, { verticalOffset: 0.5 });
  expect(store.get("crate_a")!.animation).toBeUndefined();
  expect(store.get("crate_a")!.position).toEqual(placed.position);
  expect(store.get("runtime-owned")!.position).toEqual([100, 2, 100]);
  syncAuthoredObjects(store, resolveAuthoredObjects(original), previous, () => 3, { verticalOffset: 0.5 });
  expect(store.get("crate_a")!.animation).toEqual(animation);
  expect(store.get("crate_a")!.position).toEqual(placed.position);
});
