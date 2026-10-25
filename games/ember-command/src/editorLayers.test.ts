import { describe, expect, test } from "bun:test";

import { world } from "./world";
import { editorLayers } from "./editorLayers";
import { combatantDef, DECOR, isNode } from "./game/catalog";

function catalogId(marker: { catalogId?: string }): string {
  return marker.catalogId ?? "";
}

describe("authored skirmish scene", () => {
  test("places both keeps as opposing structures", () => {
    const player = editorLayers.markers.find((m) => catalogId(m) === "keep_player");
    const enemy = editorLayers.markers.find((m) => catalogId(m) === "keep_enemy");
    expect(player).toBeDefined();
    expect(enemy).toBeDefined();
    // Opposing ends of the field.
    expect(Math.sign(player!.position.z)).not.toBe(Math.sign(enemy!.position.z));
  });

  test("fields a player squad and an enemy force", () => {
    const players = editorLayers.markers.filter((m) => combatantDef(catalogId(m))?.faction === "player" && combatantDef(catalogId(m))?.kind === "unit");
    const enemies = editorLayers.markers.filter((m) => combatantDef(catalogId(m))?.faction === "enemy" && combatantDef(catalogId(m))?.kind === "unit");
    expect(players.length).toBeGreaterThanOrEqual(4);
    expect(enemies.length).toBeGreaterThanOrEqual(4);
  });

  test("every authored marker resolves to a known combatant, node, or decor — or is a waypoint", () => {
    for (const marker of editorLayers.markers) {
      // `poi` markers author a place (a campaign waypoint), not a body or a prop: nothing spawns there.
      if (marker.kind === "poi") {
        expect(catalogId(marker)).toBe("");
        continue;
      }
      const id = catalogId(marker);
      expect(combatantDef(id) !== null || isNode(id) || DECOR.has(id)).toBe(true);
    }
  });

  test("places gatherable gold and lumber nodes plus starting peasants", () => {
    const nodes = editorLayers.markers.filter((m) => isNode(catalogId(m)));
    const peasants = editorLayers.markers.filter((m) => catalogId(m) === "peasant");
    expect(nodes.length).toBeGreaterThanOrEqual(3);
    expect(peasants.length).toBeGreaterThanOrEqual(2);
  });

  test("enemy units carry a guard or assault stance", () => {
    const enemyUnits = editorLayers.markers.filter((m) => combatantDef(catalogId(m))?.faction === "enemy" && combatantDef(catalogId(m))?.kind === "unit");
    for (const marker of enemyUnits) {
      const stance = (marker.meta as { stance?: string } | undefined)?.stance;
      expect(stance === "guard" || stance === "assault").toBe(true);
    }
  });

  test("the world consumes editor terrain with a distinct clear circulation surface and one grass owner", () => {
    expect(world.kind === "environment" ? world.sculpt : undefined).toBe(editorLayers.terrain);
    expect(world.kind === "environment" ? world.vegetation : undefined).toBeUndefined();
    expect(editorLayers.volumes.filter(volume => volume.kind === "grass_field").length).toBe(1);
    const painted = editorLayers.terrain!;
    const surfaceAt = (x: number, z: number) => painted.surfaces[Math.floor((z - painted.bounds.minZ) / painted.cellSize) * painted.cols + Math.floor((x - painted.bounds.minX) / painted.cellSize)];
    expect(surfaceAt(0, 12)).toBe("dirt");
    expect(surfaceAt(0, 36)).toBe("gravel");
    expect(surfaceAt(14, -16)).toBe("grass");
  });
});
