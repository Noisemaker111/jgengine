import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { terrainField, world } from "../../world";
import { MAIN_QUEST_IDS, quests } from "../quests/catalog";
import { SETTLEMENT_KITS } from "./buildingKit";
import { AUTHORED_PIECES, ROUTES, SPUR_ROUTES, authoredScene } from "./level";
import { entityModels, objectModels } from "./models";
import { BOLT_POS, BOLT_YAW, PLAYER_SPAWN, PLAYER_SPAWN_YAW } from "./sites";
import { ZONES, zoneAt, zoneLevelAt } from "./zones";

describe("the-robots world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("routes and spurs render as draped road geometry, not just color", () => {
    expect(summary.counts.roads).toBe(ROUTES.length + SPUR_ROUTES.length);
    const totalLength = summary.roads.reduce((sum, entry) => sum + entry.length, 0);
    expect(totalLength).toBeGreaterThan(1000);
    for (const entry of summary.roads) expect(entry.points).toBeGreaterThanOrEqual(2);
  });

  test("rendered roads and level props both read from the one authored document", () => {
    const authoredRoads = authoredScene.paths.filter((path) => path.kind === "road");
    expect(summary.counts.roads).toBe(authoredRoads.length);
    expect(ROUTES.length + SPUR_ROUTES.length).toBe(authoredRoads.length);
    expect(AUTHORED_PIECES.length).toBeGreaterThan(300);
    expect(authoredScene.markers.every((marker) => marker.position !== undefined)).toBe(true);
  });

  test("the authored scene owns the opening player and guide composition", () => {
    const playerMarker = authoredScene.markers.find((marker) => marker.id === "player_spawn");
    const boltMarker = authoredScene.markers.find((marker) => marker.id === "bolt");
    expect(playerMarker).toBeDefined();
    expect(boltMarker).toBeDefined();
    expect(PLAYER_SPAWN).toEqual([
      playerMarker!.position.x,
      playerMarker!.position.y,
      playerMarker!.position.z,
    ]);
    expect(PLAYER_SPAWN_YAW).toBe(playerMarker!.rotationY!);
    expect(BOLT_POS).toEqual([boltMarker!.position.x, boltMarker!.position.y, boltMarker!.position.z]);
    expect(BOLT_YAW).toBe(boltMarker!.rotationY!);

    const openingRoad = authoredScene.paths.find(
      (path) => path.id === playerMarker!.meta?.routeId,
    );
    expect(openingRoad).toBeDefined();
    const routePointIndex = playerMarker!.meta?.routePointIndex;
    expect(routePointIndex).toBeTypeOf("number");
    const destination = openingRoad!.points[routePointIndex as number]!;
    const desiredYaw = Math.atan2(
      destination.x - PLAYER_SPAWN[0],
      destination.z - PLAYER_SPAWN[2],
    );
    expect(Math.cos(PLAYER_SPAWN_YAW - desiredYaw)).toBeGreaterThan(0.95);
    const boltDistance = Math.hypot(BOLT_POS[0] - PLAYER_SPAWN[0], BOLT_POS[2] - PLAYER_SPAWN[2]);
    expect(boltDistance).toBeGreaterThan(30);
    expect(boltDistance).toBeLessThan(45);
  });

  // ~41 degrees: the horizontal half-angle the play camera covers at 16:9. Anything outside it is
  // not in the opening frame, whatever the scene document says is nearby.
  const HALF_VIEW_RADIANS = 0.72;

  function offsetFromSpawnView(x: number, z: number): number {
    let delta = Math.atan2(x - PLAYER_SPAWN[0], z - PLAYER_SPAWN[2]) - PLAYER_SPAWN_YAW;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return Math.abs(delta);
  }

  test("the opening frame is aimed at authored content, not empty desert", () => {
    const rustflat = ZONES[0]!;
    // Something to shoot, close enough that its silhouette resolves rather than dissolving into haze.
    const clustersInView = rustflat.clusters.filter(
      (cluster) => offsetFromSpawnView(cluster.center.x, cluster.center.z) < HALF_VIEW_RADIANS,
    );
    expect(clustersInView.length).toBeGreaterThan(0);
    for (const cluster of clustersInView) {
      const distance = Math.hypot(cluster.center.x - PLAYER_SPAWN[0], cluster.center.z - PLAYER_SPAWN[2]);
      expect(distance).toBeLessThan(120);
    }

    // Mass in the middle distance. The 40–100 m band the enemy cluster stands in used to be bare
    // sand from the spawn's own eye line, which is why the opening frame read as an empty plain with
    // a horizon: nothing between the player's feet and the ridgeline for the eye to land on.
    const midfield = AUTHORED_PIECES.filter((piece) => {
      const distance = Math.hypot(piece.x - PLAYER_SPAWN[0], piece.z - PLAYER_SPAWN[2]);
      return distance > 40 && distance < 100 && offsetFromSpawnView(piece.x, piece.z) < HALF_VIEW_RADIANS;
    });
    expect(midfield.length).toBeGreaterThanOrEqual(5);
    // …and not five of the same prop, which composes as a repeated silhouette rather than a place.
    expect(new Set(midfield.map((piece) => piece.catalogId)).size).toBeGreaterThanOrEqual(3);
  });

  test("scrub covers the middle distance, not only the ground the player stands on", () => {
    const ringed = summary.vegetation.filter((patch) => {
      const [x, z] = patch.area.position ?? [0, 0];
      const distance = Math.hypot(x - PLAYER_SPAWN[0], z - PLAYER_SPAWN[2]);
      return distance > 35 && distance < 110;
    });
    // Blades stop rendering past 150 m, so 35–110 m is the whole band a desert horizon shot has to
    // fill. Six zone-wide clumps spread over that band left most of it bare sand.
    expect(ringed.length).toBeGreaterThanOrEqual(6);
    for (const patch of summary.vegetation) expect(patch.density).toBeGreaterThanOrEqual(4);
  });

  test("every settlement zone contributes a structure group", () => {
    const settled = ZONES.filter((zone) => zone.settlement !== undefined);
    expect(summary.counts.structureGroups).toBe(settled.length);
    expect(summary.counts.buildings).toBe(settled.reduce((sum, zone) => sum + zone.settlement!.count, 0));
  });

  test("every settlement carries the kit its zone style names", () => {
    const settled = ZONES.filter((zone) => zone.settlement !== undefined);
    const groups = world.structures ?? [];
    expect(groups.length).toBe(settled.length);
    for (const [index, zone] of settled.entries()) {
      expect(groups[index]!.kit?.id).toBe(SETTLEMENT_KITS[zone.settlement!.style].id);
    }
  });

  test("terrain resolves finite heights with real relief across the expanse", () => {
    const heights = [
      terrainField.sampleHeight(0, 0),
      terrainField.sampleHeight(500, -500),
      terrainField.sampleHeight(-600, 600),
      terrainField.sampleHeight(PLAYER_SPAWN[0], PLAYER_SPAWN[2]),
    ];
    for (const height of heights) expect(Number.isFinite(height)).toBe(true);
    const spread = Math.max(...heights) - Math.min(...heights);
    expect(spread).toBeGreaterThan(2);
  });

  test("every zone center is flattened for its settlement", () => {
    for (const zone of ZONES) {
      const center = terrainField.sampleHeight(zone.center.x, zone.center.z);
      const edge = terrainField.sampleHeight(zone.center.x + zone.flattenRadius * 0.3, zone.center.z - zone.flattenRadius * 0.25);
      expect(Math.abs(edge - center)).toBeLessThan(0.9);
    }
  });
});

describe("zones", () => {
  test("player spawn sits inside the level-1 starting zone", () => {
    const zone = zoneAt(PLAYER_SPAWN[0], PLAYER_SPAWN[2]);
    expect(zone?.id).toBe("windshear_waste");
    expect(zone?.level).toBe(1);
  });

  test("zone levels climb along the campaign route", () => {
    const levels = ZONES.map((zone) => zone.level);
    expect(levels[0]).toBe(1);
    expect(levels[levels.length - 1]).toBeGreaterThanOrEqual(20);
  });

  test("zoneLevelAt falls back to the nearest zone outside all radii", () => {
    expect(zoneLevelAt(9999, 9999)).toBeGreaterThanOrEqual(1);
  });

  test("every zone cluster and boss references a real spot inside world bounds", () => {
    for (const zone of ZONES) {
      expect(Math.abs(zone.center.x)).toBeLessThan(750);
      expect(Math.abs(zone.center.z)).toBeLessThan(750);
    }
  });
});

describe("campaign chain", () => {
  const byId = new Map(quests.map((quest) => [quest.id, quest]));

  test("main chain quests all exist", () => {
    for (const id of MAIN_QUEST_IDS) expect(byId.has(id)).toBe(true);
  });

  test("each main quest links to the next via rewards.quests", () => {
    for (let index = 0; index < MAIN_QUEST_IDS.length - 1; index += 1) {
      const quest = byId.get(MAIN_QUEST_IDS[index]!)!;
      expect(quest.rewards?.quests).toContain(MAIN_QUEST_IDS[index + 1]!);
    }
  });

  test("every chained quest id resolves to a registered quest", () => {
    for (const quest of quests) {
      for (const next of quest.rewards?.quests ?? []) expect(byId.has(next)).toBe(true);
    }
  });
});

describe("settlement building kits", () => {
  const publicRoot = join(import.meta.dir, "../../../../../apps/dev/public");

  test("every bound model is a file the game actually serves", () => {
    for (const kit of Object.values(SETTLEMENT_KITS)) {
      const bound = [...Object.values(kit.parts), ...Object.values(kit.slots ?? {})].flat();
      expect(bound.length).toBeGreaterThan(0);
      for (const part of bound) {
        expect(part.model.startsWith("/models/")).toBe(true);
        expect(existsSync(join(publicRoot, part.model))).toBe(true);
      }
    }
  });

  test("clothesline is dropped rather than left to fall back to a block", () => {
    for (const kit of Object.values(SETTLEMENT_KITS)) expect(kit.omit).toContain("clothesline");
  });

  // The kit's models were checked here from the start; the object catalog's were not, and that is
  // where a broken reference would show up as a magenta placeholder in the starting settlement.
  test("every object and entity model the game mounts is a file it actually serves", () => {
    const mounted = [...Object.values(objectModels), ...Object.values(entityModels)];
    expect(mounted.length).toBeGreaterThan(0);
    for (const config of mounted) {
      expect(config.url.startsWith("/models/")).toBe(true);
      expect(existsSync(join(publicRoot, config.url))).toBe(true);
    }
  });
});
