import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { rememberHome } from "../entities/enemies/ai";
import {
  BANDIT_CAMP,
  CLAPTRAP_POS,
  FLYNT_PERCH,
  FYRESTONE,
  MARCUS_VENDOR_POS,
  NEW_U_STATION,
  SKAG_GULLY,
  SPAWN_CLUSTERS,
  ZED_VENDOR_POS,
} from "./sites";

export { PLAYER_SPAWN } from "./sites";

function grounded(ctx: GameContext, x: number, z: number): EntityPosition {
  return [x, ctx.world.groundHeightAt(x, z), z];
}

interface ClusterMember {
  id: string;
  catalogId: string;
  position: EntityPosition;
  clusterIndex: number;
}

const clusterMembers: ClusterMember[] = [];

function planClusters(ctx: GameContext): void {
  clusterMembers.length = 0;
  const rng = seededRng("bl2-cluster-spawns");
  SPAWN_CLUSTERS.forEach((cluster, clusterIndex) => {
    for (const entry of cluster.entries) {
      for (let index = 0; index < entry.count; index += 1) {
        const angle = rng() * Math.PI * 2;
        const radius = 3 + rng() * cluster.radius;
        const x = cluster.center.x + Math.cos(angle) * radius;
        const z = cluster.center.z + Math.sin(angle) * radius;
        clusterMembers.push({
          id: `spawn_${clusterIndex}_${entry.catalogId}_${index}`,
          catalogId: entry.catalogId,
          position: grounded(ctx, x, z),
          clusterIndex,
        });
      }
    }
  });
}

function spawnMember(ctx: GameContext, member: ClusterMember): void {
  ctx.scene.entity.spawn(member.catalogId, { id: member.id, position: member.position });
  rememberHome(member.id, member.position);
}

export function respawnClusters(ctx: GameContext): void {
  const playerEntity = ctx.scene.entity.get(ctx.player.userId);
  for (const member of clusterMembers) {
    if (ctx.scene.entity.get(member.id) !== null) continue;
    if (member.catalogId === "captain_flynt") continue;
    if (playerEntity !== null) {
      const distance = Math.hypot(
        playerEntity.position[0] - member.position[0],
        playerEntity.position[2] - member.position[2],
      );
      if (distance < 34) continue;
    }
    spawnMember(ctx, member);
  }
}

export const RED_CHESTS: readonly { x: number; z: number }[] = [
  { x: BANDIT_CAMP.x + 6, z: BANDIT_CAMP.z - 8 },
  { x: FLYNT_PERCH.x - 4, z: FLYNT_PERCH.z + 6 },
  { x: SKAG_GULLY.x + 10, z: SKAG_GULLY.z + 4 },
];

export const AMMO_CHESTS: readonly { x: number; z: number }[] = [
  { x: FYRESTONE.x + 16, z: FYRESTONE.z + 4 },
  { x: BANDIT_CAMP.x - 10, z: BANDIT_CAMP.z + 4 },
  { x: FLYNT_PERCH.x + 8, z: FLYNT_PERCH.z - 4 },
];

export function setupWorld(ctx: GameContext): void {
  const place = (catalogId: string, x: number, z: number, instanceId?: string) => {
    const [gx, gy, gz] = grounded(ctx, x, z);
    ctx.scene.object.place(catalogId, gx, gy + 0.5, gz, instanceId === undefined ? undefined : { instanceId });
  };

  place("vendor_marcus", MARCUS_VENDOR_POS[0], MARCUS_VENDOR_POS[2], "vendor_marcus_1");
  place("vendor_zed", ZED_VENDOR_POS[0], ZED_VENDOR_POS[2], "vendor_zed_1");
  place("new_u_station", NEW_U_STATION[0], NEW_U_STATION[2], "new_u_1");
  RED_CHESTS.forEach((chest, index) => place("red_chest", chest.x, chest.z, `red_chest_${index}`));
  AMMO_CHESTS.forEach((chest, index) => place("ammo_chest", chest.x, chest.z, `ammo_chest_${index}`));

  const barrelRng = seededRng("bl2-barrels");
  for (let index = 0; index < 6; index += 1) {
    const x = BANDIT_CAMP.x + (barrelRng() - 0.5) * 30;
    const z = BANDIT_CAMP.z + (barrelRng() - 0.5) * 30;
    place("bandit_barrel", x, z, `barrel_${index}`);
  }

  ctx.scene.entity.spawn("claptrap", { id: "claptrap_1", position: grounded(ctx, CLAPTRAP_POS[0], CLAPTRAP_POS[2]) });

  planClusters(ctx);
  for (const member of clusterMembers) spawnMember(ctx, member);

  const flyntPos = grounded(ctx, FLYNT_PERCH.x, FLYNT_PERCH.z);
  ctx.scene.entity.spawn("captain_flynt", { id: "boss_flynt", position: flyntPos });
  rememberHome("boss_flynt", flyntPos);
}
