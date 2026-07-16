import { describe, expect, test } from "bun:test";

import { createObjectStore } from "../scene/objectStore";
import {
  markerCatalogId,
  placeAuthoredObjects,
  placeAuthoredObjectsFromDocument,
  resolveAuthoredObjects,
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
