import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { rememberHome } from "../entities/enemies/ai";
import { countsAsKillOf, enemyById, levelHealthMult } from "../entities/enemies/catalog";
import { findEditorMarker } from "@jgengine/core/editor/document";
import { AMMO_CRATES } from "../items/ammoCrates";
import { campDeathsStore } from "../stores";
import { authoredScene, placeLevel, SIDE_POIS } from "./level";
import {
  BLACK_MARKET_POS,
  BOLT_POS,
  BOLT_YAW,
  RIGG_VENDOR_POS,
  TRAVEL_STATIONS,
  SPARX_VENDOR_POS,
  VAULT_POS,
  ZONES,
  zoneLevelAt,
} from "./sites";

export { PLAYER_SPAWN, PLAYER_SPAWN_YAW } from "./sites";

function grounded(ctx: GameContext, x: number, z: number): EntityPosition {
  return [x, ctx.world.groundHeightAt(x, z), z];
}

interface ClusterMember {
  id: string;
  catalogId: string;
  position: EntityPosition;
  level: number;
}

const clusterMembers: ClusterMember[] = [];
const bossMembers: ClusterMember[] = [];

function scaleSpawnedEnemy(ctx: GameContext, member: ClusterMember): void {
  const def = enemyById(member.catalogId);
  if (def === undefined) return;
  const mult = levelHealthMult(member.level);
  for (const statId of ["health", "shield"] as const) {
    const stat = ctx.scene.entity.stats.get(member.id, statId);
    if (stat === null || stat.max <= 0) continue;
    const max = Math.round(stat.max * mult);
    ctx.scene.entity.stats.set(member.id, statId, { max });
    ctx.scene.entity.stats.delta(member.id, statId, max);
  }
}

function spawnMember(ctx: GameContext, member: ClusterMember): void {
  ctx.scene.entity.spawn(member.catalogId, { id: member.id, position: member.position });
  rememberHome(ctx, member.id, member.position);
  scaleSpawnedEnemy(ctx, member);
}

function planClusters(ctx: GameContext): void {
  clusterMembers.length = 0;
  bossMembers.length = 0;
  const rng = seededRng("scrap-cluster-spawns");
  for (const zone of ZONES) {
    zone.clusters.forEach((cluster, clusterIndex) => {
      for (let index = 0; index < cluster.count; index += 1) {
        const angle = rng() * Math.PI * 2;
        const radius = 2 + rng() * cluster.radius;
        const x = cluster.center.x + Math.cos(angle) * radius;
        const z = cluster.center.z + Math.sin(angle) * radius;
        clusterMembers.push({
          id: `spawn_${zone.id}_${clusterIndex}_${cluster.catalogId}_${index}`,
          catalogId: cluster.catalogId,
          position: grounded(ctx, x, z),
          level: zone.level,
        });
      }
    });
    if (zone.boss !== undefined) {
      bossMembers.push({
        id: zone.boss.instanceId,
        catalogId: zone.boss.catalogId,
        position: grounded(ctx, zone.boss.x, zone.boss.z),
        level: zone.level,
      });
    }
  }
  const poiRng = seededRng("scrap-poi-spawns");
  for (const poi of SIDE_POIS) {
    const anchor = ZONES.find((zone) => zone.id === poi.anchorZoneId);
    poi.spawns.forEach((entry, entryIndex) => {
      for (let index = 0; index < entry.count; index += 1) {
        const angle = poiRng() * Math.PI * 2;
        const distance = 3 + poiRng() * poi.radius * 0.7;
        clusterMembers.push({
          id: `spawn_${poi.id}_${entryIndex}_${index}`,
          catalogId: entry.catalogId,
          position: grounded(ctx, poi.x + Math.cos(angle) * distance, poi.z + Math.sin(angle) * distance),
          level: anchor?.level ?? 1,
        });
      }
    });
  }
}

/**
 * Put a quest's enemy in the world at its editor marker, at the level of the zone around it. It is
 * not a cluster member, so it never respawns once killed.
 */
export function spawnQuestEnemy(ctx: GameContext, spawn: { catalogId: string; marker: string; instanceId: string }): void {
  if (ctx.scene.entity.get(spawn.instanceId) !== null) return;
  const marker = findEditorMarker(authoredScene, spawn.marker);
  if (marker === undefined) throw new Error(`editor.scene.json: missing quest marker "${spawn.marker}"`);
  spawnMember(ctx, {
    id: spawn.instanceId,
    catalogId: spawn.catalogId,
    position: grounded(ctx, marker.position.x, marker.position.z),
    level: zoneLevelAt(marker.position.x, marker.position.z),
  });
}

/** Stand an NPC at an editor marker: where a quest giver waits once the story moves on. */
export function moveNpcTo(ctx: GameContext, entityId: string, markerId: string): void {
  const marker = findEditorMarker(authoredScene, markerId);
  if (marker === undefined) throw new Error(`editor.scene.json: missing NPC marker "${markerId}"`);
  ctx.scene.entity.update(entityId, {
    position: grounded(ctx, marker.position.x, marker.position.z),
    ...(marker.rotationY === undefined ? {} : { rotationY: marker.rotationY }),
  });
}

/**
 * A kill job just taken: bring back the dead camp members it counts, so a camp cleared earlier is
 * not an empty marker the player waits at. Members in the player's face stay down, as respawns do.
 */
export function respawnForJob(ctx: GameContext, targets: readonly string[]): void {
  const player = ctx.scene.entity.get(ctx.player.userId);
  const deaths = { ...campDeathsStore.read(ctx) };
  for (const member of clusterMembers) {
    if (ctx.scene.entity.get(member.id) !== null) continue;
    if (!targets.some((target) => countsAsKillOf(member.catalogId, target))) continue;
    if (player !== null && Math.hypot(player.position[0] - member.position[0], player.position[2] - member.position[2]) < 24) continue;
    delete deaths[member.id];
    spawnMember(ctx, member);
  }
  campDeathsStore.write(ctx, deaths);
}

/**
 * Seconds a dead camp member stays dead. Borderlands refills a camp when you come back to the map, not
 * the moment you turn your back, so a camp you cleared is still clear when the boss behind it wakes.
 */
export const CAMP_RESPAWN_SECONDS = 240;

export function respawnClusters(ctx: GameContext): void {
  const playerEntity = ctx.scene.entity.get(ctx.player.userId);
  const now = ctx.time.now();
  const deaths = { ...campDeathsStore.read(ctx) };
  for (const member of clusterMembers) {
    if (ctx.scene.entity.get(member.id) !== null) continue;
    const diedAt = deaths[member.id];
    if (diedAt === undefined) {
      deaths[member.id] = now;
      continue;
    }
    if (now - diedAt < CAMP_RESPAWN_SECONDS) continue;
    if (playerEntity !== null) {
      const distance = Math.hypot(
        playerEntity.position[0] - member.position[0],
        playerEntity.position[2] - member.position[2],
      );
      if (distance < 38) continue;
    }
    delete deaths[member.id];
    spawnMember(ctx, member);
  }
  campDeathsStore.write(ctx, deaths);
}

export const RED_CHESTS: readonly { x: number; z: number }[] = ZONES.flatMap((zone) =>
  zone.chests.filter((chest) => chest.kind === "red").map((chest) => ({ x: chest.x, z: chest.z })),
);


export function setupWorld(ctx: GameContext): void {
  const place = (catalogId: string, x: number, z: number, instanceId?: string, rotation?: number) => {
    const [gx, gy, gz] = grounded(ctx, x, z);
    ctx.scene.object.place(
      catalogId,
      gx,
      gy + 0.5,
      gz,
      instanceId === undefined && rotation === undefined
        ? undefined
        : {
            ...(instanceId === undefined ? {} : { instanceId }),
            ...(rotation === undefined ? {} : { rotation }),
          },
    );
  };

  place("vendor_rigg", RIGG_VENDOR_POS[0], RIGG_VENDOR_POS[2], "vendor_rigg_1");
  place("vendor_sparx", SPARX_VENDOR_POS[0], SPARX_VENDOR_POS[2], "vendor_sparx_1");
  place("black_market", BLACK_MARKET_POS[0], BLACK_MARKET_POS[2], "black_market_1");
  place("vault", VAULT_POS[0], VAULT_POS[2], "vault_1");
  for (const station of TRAVEL_STATIONS) {
    place("fast_travel", station.x, station.z, `travel_${station.zoneId}`);
  }
  RED_CHESTS.forEach((chest, index) => place("red_chest", chest.x, chest.z, `red_chest_${index}`));
  for (const crate of AMMO_CRATES) place("ammo_chest", crate.x, crate.z, crate.id);

  ctx.scene.entity.spawn("bolt", {
    id: "bolt_1",
    position: grounded(ctx, BOLT_POS[0], BOLT_POS[2]),
    rotationY: BOLT_YAW,
  });
  placeLevel(ctx);

  planClusters(ctx);
  for (const member of clusterMembers) spawnMember(ctx, member);
  for (const boss of bossMembers) spawnMember(ctx, boss);
}
