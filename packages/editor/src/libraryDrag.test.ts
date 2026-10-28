import { describe, expect, test } from "bun:test";

import { decodeLibraryDragPayload, encodeLibraryDragPayload, placeLibraryDrop, registerLibraryAsset, type LibraryDragPayload } from "./libraryDrag";
import { createEditorHost } from "./session";

const chair: LibraryDragPayload = { key: "polyhaven:ArmChair_01", title: "Arm Chair 01", kind: "model", author: "Poly Haven", license: "CC0-1.0" };

describe("library drag", () => {
  test("payload round-trips and refuses non-placeable or malformed data", () => {
    expect(decodeLibraryDragPayload(encodeLibraryDragPayload(chair))).toEqual(chair);
    expect(decodeLibraryDragPayload(encodeLibraryDragPayload({ ...chair, kind: "icon" }))).toBeNull();
    expect(decodeLibraryDragPayload(JSON.stringify({ ...chair, license: "Kenney" }))).toBeNull();
    expect(decodeLibraryDragPayload("{not json")).toBeNull();
    expect(decodeLibraryDragPayload("")).toBeNull();
  });

  test("a drop pulls the entry, then places it where it landed with its served URL", async () => {
    const { api, dispose } = createEditorHost({ gameId: "test", layers: {}, assets: [{ id: "rock_01", label: "Rock", kind: "model", url: "/models/rock.glb" }] });
    const pulled: string[] = [];
    const markerId = await placeLibraryDrop(api, chair, { x: 4, y: 1, z: -6 }, async (payload) => {
      pulled.push(payload.key);
      const url = "/models/polyhaven/ArmChair_01/model.glb";
      registerLibraryAsset(api, payload, url);
      return url;
    });
    expect(pulled).toEqual(["polyhaven:ArmChair_01"]);
    const marker = api.getSession().getState().document.markers.find((item) => item.id === markerId);
    expect(marker?.position).toEqual({ x: 4, y: 1, z: -6 });
    expect(marker?.catalogId).toBe("polyhaven:ArmChair_01");
    expect(marker?.meta?.url).toBe("/models/polyhaven/ArmChair_01/model.glb");
    expect(api.getAssets().map((asset) => asset.id)).toEqual(["rock_01", "polyhaven:ArmChair_01"]);
    expect(api.getSession().exportJson(true)).toContain("polyhaven:ArmChair_01");
    dispose();
  });

  test("a failed pull places nothing", async () => {
    const { api, dispose } = createEditorHost({ gameId: "test", layers: {} });
    expect(await placeLibraryDrop(api, chair, { x: 0, y: 0, z: 0 }, async () => null)).toBeNull();
    expect(api.getSession().getState().document.markers).toHaveLength(0);
    dispose();
  });
});
