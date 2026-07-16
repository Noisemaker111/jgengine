import { describe, expect, test } from "bun:test";
import { worldObjectById } from "../objects/catalog";
import { terrainField } from "../../world";
import {
  AUTHORED_PIECES,
  NPC_PLACEMENTS,
  ROUTES,
  SIDE_POIS,
  SPUR_ROUTES,
  authoredScene,
  roadFlattenMasks,
} from "./level";
import { ZONES } from "./zones";

const pieceById = new Map(AUTHORED_PIECES.map((piece) => [piece.instanceId, piece]));

describe("authored document", () => {
  test("every placed prop is a document marker with a resolvable catalog id", () => {
    expect(AUTHORED_PIECES.length).toBe(395);
    for (const piece of AUTHORED_PIECES) expect(worldObjectById(piece.catalogId)).toBeDefined();
  });

  test("routes and spurs are authored paths, not generated in code", () => {
    expect(authoredScene.paths.filter((path) => path.kind === "road").length).toBe(
      ROUTES.length + SPUR_ROUTES.length,
    );
    expect(ROUTES.length).toBe(5);
    expect(SPUR_ROUTES.length).toBe(3);
  });

  test("piece ids are unique", () => {
    const ids = AUTHORED_PIECES.map((piece) => piece.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("landmarks keep their exact authored positions", () => {
    expect(pieceById.get("crash_bus")).toMatchObject({ catalogId: "bus_wreck", x: -510, z: 606 });
    expect(pieceById.get("coretown_tower")).toMatchObject({ catalogId: "water_tower", x: -22, z: 12 });
    expect(pieceById.get("reactor_gate")).toMatchObject({ catalogId: "reactor_gate", x: -80, z: -640 });
  });
});

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

  test("roadside props are authored and resolve to catalog entries", () => {
    const pieces = AUTHORED_PIECES.filter((piece) => piece.instanceId.startsWith("roadside_"));
    expect(pieces.length).toBeGreaterThan(15);
    for (const piece of pieces) expect(worldObjectById(piece.catalogId)).toBeDefined();
  });
});

describe("guided openness", () => {
  test("off-road ridges rise above climb limit so routes herd the player", () => {
    const route = ROUTES[0]!;
    let ridgeSamples = 0;
    let total = 0;
    for (let index = 3; index < route.points.length - 3; index += 2) {
      const point = route.points[index]!;
      const next = route.points[index + 1]!;
      const dx = next.x - point.x;
      const dz = next.z - point.z;
      const length = Math.hypot(dx, dz) || 1;
      const roadHeight = terrainField.sampleHeight(point.x, point.z);
      for (const side of [-1, 1]) {
        const offX = point.x + (-dz / length) * 55 * side;
        const offZ = point.z + (dx / length) * 55 * side;
        total += 1;
        if (terrainField.sampleHeight(offX, offZ) - roadHeight > 4) ridgeSamples += 1;
      }
    }
    expect(ridgeSamples / total).toBeGreaterThan(0.3);
  });

  test("every side POI has a walkable spur off a campaign zone", () => {
    expect(SPUR_ROUTES.length).toBe(SIDE_POIS.length);
    for (const spur of SPUR_ROUTES) {
      let maxStep = 0;
      for (let index = 1; index < spur.points.length; index += 1) {
        const previous = spur.points[index - 1]!;
        const point = spur.points[index]!;
        maxStep = Math.max(
          maxStep,
          Math.abs(terrainField.sampleHeight(point.x, point.z) - terrainField.sampleHeight(previous.x, previous.z)),
        );
      }
      expect(maxStep).toBeLessThan(6);
    }
  });

  test("side POIs are dressed with a reward chest", () => {
    const chests = AUTHORED_PIECES.filter(
      (piece) => piece.catalogId === "red_chest" && piece.instanceId.startsWith("poi_chest_"),
    );
    expect(chests.length).toBe(SIDE_POIS.length);
  });
});

describe("set pieces", () => {
  test("camp walls leave a gate opening toward the road", () => {
    const shelfWall = AUTHORED_PIECES.filter((piece) => piece.instanceId.startsWith("shelf_wall"));
    expect(shelfWall.length).toBeGreaterThan(6);
    expect(shelfWall.length).toBeLessThan(14);
  });

  test("landmarks anchor key zones", () => {
    const ids = new Set(AUTHORED_PIECES.map((piece) => piece.instanceId));
    expect(ids.has("crash_bus")).toBe(true);
    expect(ids.has("coretown_tower")).toBe(true);
    expect(ids.has("reactor_gate")).toBe(true);
  });

  test("named NPCs stand in the hub", () => {
    expect(NPC_PLACEMENTS.length).toBe(3);
    const hub = ZONES.find((zone) => zone.id === "arid_badlands")!;
    for (const npc of NPC_PLACEMENTS) {
      expect(Math.hypot(npc.x - hub.center.x, npc.z - hub.center.z)).toBeLessThan(hub.flattenRadius);
    }
  });
});
