import type { BodySnapshot } from "@jgengine/core/scene/bodyBind";
import type { SessionSnapshot } from "../run/session";
import type { PartIconId } from "../parts/catalog";

export const UPGRADE_KINDS: Record<PartIconId, string> = {
  salvage_v6: "upgrade_salvage_v6",
  truck_engine: "upgrade_truck_engine",
  ev_conversion: "upgrade_ev_conversion",
  plow_blade: "upgrade_plow_blade",
  hood_plate: "upgrade_hood_plate",
  fan_blade_vanes: "upgrade_fan_blade_vanes",
  coil_springs: "upgrade_coil_springs",
  steel_rims: "upgrade_steel_rims",
  monster_treads: "upgrade_monster_treads",
  scrap_frame: "upgrade_scrap_frame",
  roll_cage: "upgrade_roll_cage",
  armor_plating: "upgrade_armor_plating",
};

// Geometry shares the chassis origin and heading. Each replacement has a new id,
// because body-bind selects the model kind only when an identity first spawns.
export function upgradeBodies(ownerId: string, snapshot: Pick<SessionSnapshot, "installed" | "pose">): BodySnapshot[] {
  return Object.entries(snapshot.installed).flatMap(([slot, part]) => part === null ? [] : [{
    id: `${ownerId}:upgrade:${part.id}`,
    kind: UPGRADE_KINDS[part.id],
    position: snapshot.pose.position,
    rotationY: snapshot.pose.heading,
    role: "prop" as const,
    meta: { ownerId, slot, partId: part.id },
  }]);
}
