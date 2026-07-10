export interface AiPoint {
  x: number;
  z: number;
}

export type AiMode = "defend" | "attack";

export interface AiConfig {
  defendRadius: number;
  aimErrorRadius: number;
  standOffset: number;
  throwRange: number;
  detonateRange: number;
  maxArmedCharges: number;
}

export interface AiDecision {
  mode: AiMode;
  moveTarget: AiPoint;
  throwAt: AiPoint;
  shouldThrow: boolean;
  shouldDetonate: boolean;
}

function dist(a: AiPoint, b: AiPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function lerpPoint(a: AiPoint, b: AiPoint, t: number): AiPoint {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

function awayFrom(from: AiPoint, toward: AiPoint, offset: number): AiPoint {
  const dx = from.x - toward.x;
  const dz = from.z - toward.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return { x: from.x, z: from.z + offset };
  return { x: from.x + (dx / len) * offset, z: from.z + (dz / len) * offset };
}

function withAimError(target: AiPoint, radius: number, rng: () => number): AiPoint {
  if (radius <= 0) return target;
  const angle = rng() * Math.PI * 2;
  const magnitude = rng() * radius;
  return { x: target.x + Math.cos(angle) * magnitude, z: target.z + Math.sin(angle) * magnitude };
}

export function decideAiAction(
  aiPos: AiPoint,
  ballPos: AiPoint,
  ownGoalX: number,
  opponentGoalX: number,
  chargesArmed: number,
  config: AiConfig,
  rng: () => number,
): AiDecision {
  const ownGoal: AiPoint = { x: ownGoalX, z: 0 };
  const opponentGoal: AiPoint = { x: opponentGoalX, z: 0 };
  const threatDistance = dist(ballPos, ownGoal);
  const mode: AiMode = threatDistance < config.defendRadius ? "defend" : "attack";

  const moveTarget = mode === "defend" ? lerpPoint(ownGoal, ballPos, 0.45) : awayFrom(ballPos, opponentGoal, config.standOffset);

  const throwAt = withAimError(ballPos, config.aimErrorRadius, rng);
  const withinThrowRange = dist(aiPos, ballPos) <= config.throwRange;
  const shouldThrow = chargesArmed < config.maxArmedCharges && withinThrowRange;
  const shouldDetonate = chargesArmed > 0 && dist(aiPos, ballPos) <= config.detonateRange;

  return { mode, moveTarget, throwAt, shouldThrow, shouldDetonate };
}
