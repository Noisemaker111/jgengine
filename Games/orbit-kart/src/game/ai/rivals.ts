import { CHECKPOINT_DEFS, PLANETOIDS, type Planetoid } from "../cluster/catalog";
import { isDischargeWindow, type KartControlInput, type KartPhysicsState } from "../physics/orbitalSim";
import { PALETTE } from "../theme";

export type RivalKind = "cautious" | "aggressive";

export interface RivalPersonality {
  id: string;
  name: string;
  kind: RivalKind;
  color: string;
  cruiseSpeed: number;
  alignTolerance: number;
  dischargeChargeThreshold: number;
}

export const RIVALS: readonly RivalPersonality[] = [
  {
    id: "rival_cautious",
    name: "Marla \"Steady\" Kwan",
    kind: "cautious",
    color: PALETTE.planetMint,
    cruiseSpeed: 21.5,
    alignTolerance: 0.5,
    dischargeChargeThreshold: 0.75,
  },
  {
    id: "rival_aggressive",
    name: "Dex Solari",
    kind: "aggressive",
    color: PALETTE.boostTangerine,
    cruiseSpeed: 25,
    alignTolerance: 0.75,
    dischargeChargeThreshold: 0.25,
  },
];

function normalizeAngle(angle: number): number {
  let value = angle % (Math.PI * 2);
  if (value > Math.PI) value -= Math.PI * 2;
  if (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function wellPlanetoid(state: KartPhysicsState, planetoids: readonly Planetoid[]): Planetoid | null {
  if (state.wellId === null) return null;
  return planetoids.find((planetoid) => planetoid.id === state.wellId) ?? null;
}

export function steerRival(
  state: KartPhysicsState,
  personality: RivalPersonality,
  targetCheckpointIndex: number,
  planetoids: readonly Planetoid[] = PLANETOIDS,
): KartControlInput {
  const checkpoint = CHECKPOINT_DEFS[targetCheckpointIndex % CHECKPOINT_DEFS.length]!;
  const toX = checkpoint.position[0] - state.x;
  const toZ = checkpoint.position[1] - state.z;
  const distToTarget = Math.hypot(toX, toZ);

  const desiredSpeed = personality.cruiseSpeed;
  const desiredVx = distToTarget > 0 ? (toX / distToTarget) * desiredSpeed : 0;
  const desiredVz = distToTarget > 0 ? (toZ / distToTarget) * desiredSpeed : 0;

  const errX = desiredVx - state.vx;
  const errZ = desiredVz - state.vz;
  const errMag = Math.hypot(errX, errZ);

  const desiredHeading = errMag > 0.5 ? Math.atan2(errX, errZ) : Math.atan2(toX, toZ);
  const diff = normalizeAngle(desiredHeading - state.heading);
  const absDiff = Math.abs(diff);

  const rotateLeft = diff > 0.06;
  const rotateRight = diff < -0.06;
  const thrust = errMag > 1.2 && absDiff < personality.alignTolerance;
  const retro = errMag > 1.2 && absDiff > Math.PI - personality.alignTolerance;

  const well = wellPlanetoid(state, planetoids);
  const discharge =
    well !== null &&
    state.wellCharge >= personality.dischargeChargeThreshold &&
    isDischargeWindow([state.x - well.position[0], state.z - well.position[1]], [state.vx, state.vz]);

  return { thrust, retro, rotateLeft, rotateRight, discharge };
}
