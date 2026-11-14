import type { BodySnapshot } from "@jgengine/core/scene/bodyBind";
import type { SessionSnapshot } from "../run/session";
import type { PartIconId } from "../parts/catalog";

export const UPGRADE_KINDS: Record<PartIconId, string> = {
  power_walker: "upgrade_power_walker",
  leaf_blower: "upgrade_leaf_blower",
  e_assist: "upgrade_e_assist",
  pallet_plow: "upgrade_pallet_plow",
  noodle_bumper: "upgrade_noodle_bumper",
  sign_spoiler: "upgrade_sign_spoiler",
  spring_casters: "upgrade_spring_casters",
  fixed_squeak: "upgrade_fixed_squeak",
  knobby_casters: "upgrade_knobby_casters",
  wire_basket: "upgrade_wire_basket",
  cage_basket: "upgrade_cage_basket",
  bin_lid_armor: "upgrade_bin_lid_armor",
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
