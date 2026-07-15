import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { rememberHome } from "../entities/enemies/ai";
import { enemyById, levelHealthMult } from "../entities/enemies/catalog";
import { placeLevel, SIDE_POIS } from "./level";
import {
  BLACK_MARKET_POS,
  BOLT_POS,
  RIGG_VENDOR_POS,
  TRAVEL_STATIONS,
  SPARX_VENDOR_POS,
  ZONES,
} from "./sites";

export { PLAYER_SPAWN } from "./sites";

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
  rememberHome(member.id, member.position);
  scaleSpawnedEnemy(ctx, member);
}

function planClusters(ctx: GameContext): void {
  clusterMembers.length = 0;
  bossMembers.length = 0;
  const rng = seededRng("bl2-cluster-spawns");
  for (const zone of ZONES) {
    zone.clusters.forEach((cluster, clusterIndex) => {
      for (let index = 0; index < cluster.count; index += 1) {
        const angle = rng() * Math.PI * 2;
        const radius = 2 + rng() * cluster.radius;
        const x = zone.center.x + cluster.offset.x + Math.cos(angle) * radius;
        const z = zone.center.z + cluster.offset.z + Math.sin(angle) * radius;
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
  const poiRng = seededRng("bl2-poi-spawns");
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

export function respawnClusters(ctx: GameContext): void {
  const playerEntity = ctx.scene.entity.get(ctx.player.userId);
  for (const member of clusterMembers) {
    if (ctx.scene.entity.get(member.id) !== null) continue;
    if (playerEntity !== null) {
      const distance = Math.hypot(
        playerEntity.position[0] - member.position[0],
        playerEntity.position[2] - member.position[2],
      );
      if (distance < 38) continue;
    }
    spawnMember(ctx, member);
  }
}

export const RED_CHESTS: readonly { x: number; z: number }[] = ZONES.flatMap((zone) =>
  zone.chests.filter((chest) => chest.kind === "red").map((chest) => ({ x: chest.x, z: chest.z })),
);

export const AMMO_CHESTS: readonly { x: number; z: number }[] = ZONES.flatMap((zone) =>
  zone.chests.filter((chest) => chest.kind === "ammo").map((chest) => ({ x: chest.x, z: chest.z })),
);

export function setupWorld(ctx: GameContext): void {
  const place = (catalogId: string, x: number, z: number, instanceId?: string) => {
    const [gx, gy, gz] = grounded(ctx, x, z);
    ctx.scene.object.place(catalogId, gx, gy + 0.5, gz, instanceId === undefined ? undefined : { instanceId });
  };

  place("vendor_rigg", RIGG_VENDOR_POS[0], RIGG_VENDOR_POS[2], "vendor_rigg_1");
  place("vendor_zed", SPARX_VENDOR_POS[0], SPARX_VENDOR_POS[2], "vendor_zed_1");
  place("black_market", BLACK_MARKET_POS[0], BLACK_MARKET_POS[2], "black_market_1");
  for (const station of TRAVEL_STATIONS) {
    place("fast_travel", station.x, station.z, `travel_${station.zoneId}`);
  }
  RED_CHESTS.forEach((chest, index) => place("red_chest", chest.x, chest.z, `red_chest_${index}`));
  AMMO_CHESTS.forEach((chest, index) => place("ammo_chest", chest.x, chest.z, `ammo_chest_${index}`));

  const propRng = seededRng("bl2-props");
  const PROP_KINDS = ["rock_spire", "rock_spire", "dead_tree", "wreck"] as const;
  for (let index = 0; index < 90; index += 1) {
    const x = (propRng() - 0.5) * 1300;
    const z = (propRng() - 0.5) * 1300;
    const nearZone = ZONES.some(
      (zone) => Math.hypot(x - zone.center.x, z - zone.center.z) < zone.flattenRadius * 0.8,
    );
    if (nearZone) continue;
    const kind = PROP_KINDS[Math.floor(propRng() * PROP_KINDS.length)]!;
    place(kind, x, z, `prop_${index}`);
  }

  const barrelRng = seededRng("bl2-barrels");
  ZONES.forEach((zone, zoneIndex) => {
    for (let index = 0; index < 4; index += 1) {
      const x = zone.center.x + (barrelRng() - 0.5) * zone.flattenRadius * 1.4;
      const z = zone.center.z + (barrelRng() - 0.5) * zone.flattenRadius * 1.4;
      place("bandit_barrel", x, z, `barrel_${zoneIndex}_${index}`);
    }
  });

  ctx.scene.entity.spawn("bolt", { id: "bolt_1", position: grounded(ctx, BOLT_POS[0], BOLT_POS[2]) });
  placeLevel(ctx);

  planClusters(ctx);
  for (const member of clusterMembers) spawnMember(ctx, member);
  for (const boss of bossMembers) spawnMember(ctx, boss);
}
