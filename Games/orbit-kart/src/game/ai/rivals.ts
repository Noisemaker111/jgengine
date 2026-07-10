import { CHECKPOINT_DEFS, PLANETOIDS, type Planetoid } from "../cluster/catalog";
import type { KartControlInput, KartPhysicsState } from "../physics/orbitalSim";
import { PALETTE } from "../theme";

export type RivalKind = "cautious" | "aggressive";

export interface RivalPersonality {
  id: string;
  name: string;
  kind: RivalKind;
  color: string;
  headingTolerance: number;
  orbitBias: number;
  dischargeChargeThreshold: number;
  retroOnOvershoot: boolean;
}

export const RIVALS: readonly RivalPersonality[] = [
  {
    id: "rival_cautious",
    name: "Marla \"Steady\" Kwan",
    kind: "cautious",
    color: PALETTE.planetMint,
    headingTolerance: 0.32,
    orbitBias: -0.4,
    dischargeChargeThreshold: 0.85,
    retroOnOvershoot: true,
  },
  {
    id: "rival_aggressive",
    name: "Dex Solari",
    kind: "aggressive",
    color: PALETTE.boostTangerine,
    headingTolerance: 0.55,
    orbitBias: 0.45,
    dischargeChargeThreshold: 0.35,
    retroOnOvershoot: false,
  },
];

function normalizeAngle(angle: number): number {
  let value = angle % (Math.PI * 2);
  if (value > Math.PI) value -= Math.PI * 2;
  if (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function nearestPlanetoid(x: number, z: number, planetoids: readonly Planetoid[]): Planetoid | null {
  let best: Planetoid | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const planetoid of planetoids) {
    const dist = Math.hypot(planetoid.position[0] - x, planetoid.position[1] - z);
    if (dist < bestDist) {
      bestDist = dist;
      best = planetoid;
    }
  }
  return best;
}

export function steerRival(
  state: KartPhysicsState,
  personality: RivalPersonality,
  targetCheckpointIndex: number,
  planetoids: readonly Planetoid[] = PLANETOIDS,
): KartControlInput {
  const checkpoint = CHECKPOINT_DEFS[targetCheckpointIndex % CHECKPOINT_DEFS.length]!;
  let targetX = checkpoint.position[0];
  let targetZ = checkpoint.position[1];

  const nearest = nearestPlanetoid(state.x, state.z, planetoids);
  if (nearest !== null) {
    const dx = nearest.position[0] - state.x;
    const dz = nearest.position[1] - state.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0 && dist < nearest.wellRadius) {
      targetX += (dx / dist) * nearest.radius * personality.orbitBias * 0.2;
      targetZ += (dz / dist) * nearest.radius * personality.orbitBias * 0.2;
    }
  }

  const toX = targetX - state.x;
  const toZ = targetZ - state.z;
  const distToTarget = Math.hypot(toX, toZ);
  const desiredHeading = Math.atan2(toX, toZ);
  const diff = normalizeAngle(desiredHeading - state.heading);
  const turnDeadzone = personality.headingTolerance * 0.2;
  const rotateLeft = diff < -turnDeadzone;
  const rotateRight = diff > turnDeadzone;
  const speed = Math.hypot(state.vx, state.vz);
  const approachGain = personality.retroOnOvershoot ? 0.5 : 0.7;
  const desiredSpeed = Math.min(24, Math.max(7, distToTarget * approachGain));
  const absDiff = Math.abs(diff);
  const thrust = absDiff < 0.4 && speed < desiredSpeed;
  const retro = speed > desiredSpeed + 4 || (absDiff > 1.2 && speed > 6);
  const discharge = state.wellId !== null && state.wellCharge >= personality.dischargeChargeThreshold;

  return { thrust, retro, rotateLeft, rotateRight, discharge };
}
