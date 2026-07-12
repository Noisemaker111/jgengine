import { describe, expect, test } from "bun:test";
import { worldObjectById } from "../objects/catalog";
import { terrainField } from "../../world";
import { NPC_PLACEMENTS, ROUTES, roadFlattenMasks, roadsidePieces, zoneSetPieces } from "./level";
import { ZONES } from "./zones";

describe("roads", () => {
  test("routes chain every zone into the campaign path", () => {
    const touched = new Set(ROUTES.flatMap((route) => [route.from, route.to]));
    for (const zone of ZONES) expect(touched.has(zone.id)).toBe(true);
  });

  test("road flatten masks trace every route with ramped heights", () => {
    const masks = roadFlattenMasks((x, z) => terrainField.sampleHeight(x, z));
    expect(masks.length).toBeGreaterThan(60);
    for (const mask of masks) expect(Number.isFinite(mask.height)).toBe(true);
  });

  test("roads are walkable: on-road slope is gentler than raw terrain amplitude", () => {
    const route = ROUTES[1]!;
    let maxStep = 0;
    for (let index = 1; index < route.points.length; index += 1) {
      const previous = route.points[index - 1]!;
      const point = route.points[index]!;
      const drop = Math.abs(
        terrainField.sampleHeight(point.x, point.z) - terrainField.sampleHeight(previous.x, previous.z),
      );
      maxStep = Math.max(maxStep, drop);
    }
    expect(maxStep).toBeLessThan(6);
  });

  test("roadside props exist and resolve to catalog entries", () => {
    const pieces = roadsidePieces();
    expect(pieces.length).toBeGreaterThan(15);
    for (const piece of pieces) expect(worldObjectById(piece.catalogId)).toBeDefined();
  });
});

describe("set pieces", () => {
  const allPieces = ZONES.flatMap((zone) => zoneSetPieces(zone));

  test("every zone composes a real place", () => {
    for (const zone of ZONES) expect(zoneSetPieces(zone).length).toBeGreaterThanOrEqual(8);
  });

  test("piece ids are unique and catalog ids resolve", () => {
    const ids = allPieces.map((piece) => piece.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const piece of allPieces) expect(worldObjectById(piece.catalogId)).toBeDefined();
  });

  test("camp walls leave a gate opening toward the road", () => {
    const shelfWall = zoneSetPieces(ZONES[1]!).filter((piece) => piece.instanceId.startsWith("shelf_wall"));
    expect(shelfWall.length).toBeGreaterThan(6);
    expect(shelfWall.length).toBeLessThan(14);
  });

  test("landmarks anchor key zones", () => {
    const ids = allPieces.map((piece) => piece.instanceId);
    expect(ids).toContain("crash_bus");
    expect(ids).toContain("fyrestone_tower");
    expect(ids).toContain("vault_gate");
  });

  test("named NPCs stand in the hub", () => {
    expect(NPC_PLACEMENTS.length).toBe(3);
    const hub = ZONES.find((zone) => zone.id === "arid_badlands")!;
    for (const npc of NPC_PLACEMENTS) {
      expect(Math.hypot(npc.x - hub.center.x, npc.z - hub.center.z)).toBeLessThan(hub.flattenRadius);
    }
  });
});
