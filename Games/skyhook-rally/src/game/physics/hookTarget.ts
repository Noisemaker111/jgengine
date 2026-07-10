import { selectAutoTarget } from "@jgengine/core/scene/autoTarget";

import type { Pylon } from "../world/archipelago";
import type { Vec3 } from "./swing";

const AIM_ORIGIN_ID = "__aim_origin__";

/** Nearest hookable pylon inside `maxLength` and inside the forward view cone (`coneCos` = cos of the half-angle). Reuses the engine's `nearest` auto-target policy over a pre-filtered candidate set — the view-cone gate is game data, the "which is nearest" pick is the engine primitive. */
export function pickHookTarget(
  origin: Vec3,
  forward: Vec3,
  pylons: readonly Pylon[],
  maxLength: number,
  coneCos: number,
): Pylon | null {
  const inRange = new Map<string, { pylon: Pylon; distance: number }>();
  for (const pylon of pylons) {
    const dx = pylon.base.x - origin.x;
    const dy = pylon.ringY - origin.y;
    const dz = pylon.base.z - origin.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance <= 0.001 || distance > maxLength) continue;
    const dot = (dx / distance) * forward.x + (dy / distance) * forward.y + (dz / distance) * forward.z;
    if (dot < coneCos) continue;
    inRange.set(pylon.id, { pylon, distance });
  }
  if (inRange.size === 0) return null;

  const targetId = selectAutoTarget("nearest", AIM_ORIGIN_ID, {
    candidates: () => Array.from(inRange.keys()),
    distance: (_from, toId) => inRange.get(toId)?.distance ?? null,
  });
  return targetId === null ? null : (inRange.get(targetId)?.pylon ?? null);
}
