import { describe, expect, test } from "bun:test";

import { editorLayers } from "../../editorLayers";
import { DUNGEONS } from "../dungeons/catalog";
import { NPCS } from "../entities/npcs/catalog";
import { CRYPT, PLAYER_SPAWN, ZONES } from "./zones";

describe("authored scene drives placement", () => {
  test("editor document carries every placement (spawn, hubs, graveyards, crypt, dungeons, npcs)", () => {
    expect(editorLayers.markers.find((m) => m.id === "spawn:player")).toBeDefined();
    for (const zone of ZONES) {
      expect(editorLayers.markers.find((m) => m.id === `hub:${zone.id}`)).toBeDefined();
      expect(editorLayers.markers.find((m) => m.id === `graveyard:${zone.id}`)).toBeDefined();
      expect(editorLayers.volumes.find((v) => v.id === `zone:${zone.id}`)).toBeDefined();
    }
    expect(editorLayers.markers.filter((m) => m.id.startsWith("npc:"))).toHaveLength(NPCS.length);
    for (const dungeon of DUNGEONS) {
      expect(editorLayers.markers.find((m) => m.id === `dungeon:${dungeon.id}`)).toBeDefined();
      expect(editorLayers.markers.find((m) => m.id === `dungeon:${dungeon.id}:entrance`)).toBeDefined();
      expect(editorLayers.markers.find((m) => m.id === `dungeon:${dungeon.id}:inside`)).toBeDefined();
    }
  });

  test("zone hubs, graveyards, and bands read from the document markers/volumes", () => {
    for (const zone of ZONES) {
      const hub = editorLayers.markers.find((m) => m.id === `hub:${zone.id}`)!;
      expect([zone.hub.x, zone.hub.z]).toEqual([hub.position.x, hub.position.z]);
      expect(zone.hub.radius).toBe(hub.meta?.radius as number);
      const grave = editorLayers.markers.find((m) => m.id === `graveyard:${zone.id}`)!;
      expect([zone.graveyard.x, zone.graveyard.z]).toEqual([grave.position.x, grave.position.z]);
      const band = editorLayers.volumes.find((v) => v.id === `zone:${zone.id}`)!;
      expect(zone.zMin).toBe(band.center.z - band.halfExtents!.z);
      expect(zone.zMax).toBe(band.center.z + band.halfExtents!.z);
    }
  });

  test("crypt and player spawn read from the document", () => {
    const crypt = editorLayers.markers.find((m) => m.id === "hub:crypt")!;
    expect([CRYPT.x, CRYPT.z]).toEqual([crypt.position.x, crypt.position.z]);
    const spawn = editorLayers.markers.find((m) => m.id === "spawn:player")!;
    expect(PLAYER_SPAWN).toEqual([spawn.position.x, spawn.position.z]);
  });

  test("every NPC spawn position matches its authored marker", () => {
    for (const npc of NPCS) {
      const marker = editorLayers.markers.find((m) => m.id === `npc:${npc.id}`)!;
      expect(marker).toBeDefined();
      expect([npc.position[0], npc.position[1]]).toEqual([marker.position.x, marker.position.z]);
    }
  });

  test("every dungeon placement matches its authored markers", () => {
    for (const dungeon of DUNGEONS) {
      const center = editorLayers.markers.find((m) => m.id === `dungeon:${dungeon.id}`)!;
      expect(dungeon.center).toEqual([center.position.x, center.position.z]);
      expect(dungeon.radius).toBe(center.meta?.radius as number);
      const entrance = editorLayers.markers.find((m) => m.id === `dungeon:${dungeon.id}:entrance`)!;
      expect(dungeon.entrance).toEqual([entrance.position.x, entrance.position.z]);
      const inside = editorLayers.markers.find((m) => m.id === `dungeon:${dungeon.id}:inside`)!;
      expect(dungeon.inside).toEqual([inside.position.x, inside.position.z]);
    }
  });
});
