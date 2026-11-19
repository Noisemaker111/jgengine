import { createThreatTable, type ThreatTable, type ThreatTableConfig } from "./threat";
import { resolveRng } from "../random/resolveRng";

export type MobBrainMode = "idle" | "wander" | "chase" | "engage" | "evade";

export type MobVec3 = readonly [number, number, number];

export interface MobWanderConfig {
  radius: number;
  /** Seconds between wander-point picks; default `4`. */
  intervalSeconds?: number;
  speedScale?: number;
  arriveRadius?: number;
}

export interface MobBrainConfig {
  aggroRadius: number;
  attackRange: number;
  leashDistance: number;
  wander?: MobWanderConfig | false;
  evadeSpeedScale?: number;
  stickiness?: number;
  homeArriveRadius?: number;
  threat?: ThreatTableConfig;
}

export interface MobBrainDeps {
  home: MobVec3;
  position(): MobVec3 | null;
  targetPosition(targetId: string): MobVec3 | null;
  candidates(): readonly string[];
  rng?: () => number;
}

export interface MobBrainStep {
  mode: MobBrainMode;
  targetId: string | null;
  moveTo: MobVec3 | null;
  speedScale: number;
  inAttackRange: boolean;
  arrivedHome: boolean;
}

export interface MobBrain {
  readonly threat: ThreatTable;
  mode(): MobBrainMode;
  addThreat(sourceId: string, amount: number): void;
  tick(dt: number): MobBrainStep;
  reset(): void;
}

const HOLD: Omit<MobBrainStep, "mode"> = {
  targetId: null,
  moveTo: null,
  speedScale: 1,
  inAttackRange: false,
  arrivedHome: false,
};

function distance(a: MobVec3, b: MobVec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** @internal */
export function createMobBrain(config: MobBrainConfig, deps: MobBrainDeps): MobBrain {
  const threat = createThreatTable(config.threat);
  const stickiness = config.stickiness ?? 1.15;
  const evadeSpeedScale = config.evadeSpeedScale ?? 1.4;
  const homeArriveRadius = config.homeArriveRadius ?? 1.2;
  const wander = config.wander === false || config.wander === undefined ? null : config.wander;
  const wanderInterval = wander?.intervalSeconds ?? 4;
  const wanderArrive = wander?.arriveRadius ?? 0.6;
  const rng = resolveRng(deps.rng, "createMobBrain");

  let currentMode: MobBrainMode = "idle";
  let currentTarget: string | null = null;
  let evading = false;
  let wanderClock = 0;
  let wanderTo: MobVec3 | null = null;

  function step(mode: MobBrainMode, patch: Partial<MobBrainStep> = {}): MobBrainStep {
    currentMode = mode;
    return { mode, ...HOLD, ...patch };
  }

  function acquireByProximity(position: MobVec3): void {
    let nearest: string | null = null;
    let nearestDistance = config.aggroRadius;
    for (const candidateId of deps.candidates()) {
      const candidatePosition = deps.targetPosition(candidateId);
      if (candidatePosition === null) continue;
      const candidateDistance = distance(position, candidatePosition);
      if (candidateDistance <= nearestDistance) {
        nearest = candidateId;
        nearestDistance = candidateDistance;
      }
    }
    if (nearest !== null) threat.add(nearest, 1);
  }

  return {
    threat,
    mode: () => currentMode,
    addThreat(sourceId, amount) {
      if (evading) return;
      threat.add(sourceId, amount);
    },
    tick(dt) {
      const position = deps.position();
      if (position === null) return step(currentMode);

      if (evading) {
        if (distance(position, deps.home) <= homeArriveRadius) {
          evading = false;
          wanderClock = 0;
          wanderTo = null;
          return step("idle", { arrivedHome: true });
        }
        return step("evade", { moveTo: deps.home, speedScale: evadeSpeedScale });
      }

      threat.decay(dt);
      if (threat.size() === 0) acquireByProximity(position);
      let targetId = threat.highest({ current: currentTarget, stickiness });
      if (targetId !== null && deps.targetPosition(targetId) === null) {
        threat.remove(targetId);
        targetId = threat.highest({ stickiness });
      }
      currentTarget = targetId;

      if (targetId !== null) {
        if (distance(position, deps.home) > config.leashDistance) {
          threat.clear();
          currentTarget = null;
          evading = true;
          return step("evade", { moveTo: deps.home, speedScale: evadeSpeedScale });
        }
        const targetPosition = deps.targetPosition(targetId);
        if (targetPosition === null) return step(currentMode);
        if (distance(position, targetPosition) <= config.attackRange) {
          return step("engage", { targetId, inAttackRange: true });
        }
        return step("chase", { targetId, moveTo: targetPosition });
      }

      if (wander === null) return step("idle");
      wanderClock += dt;
      if (wanderTo !== null && distance(position, wanderTo) <= wanderArrive) wanderTo = null;
      if (wanderTo === null && wanderClock >= wanderInterval) {
        wanderClock = 0;
        const angle = rng() * Math.PI * 2;
        const radius = Math.sqrt(rng()) * wander.radius;
        wanderTo = [deps.home[0] + Math.cos(angle) * radius, deps.home[1], deps.home[2] + Math.sin(angle) * radius];
      }
      if (wanderTo === null) return step("idle");
      return step("wander", { moveTo: wanderTo, speedScale: wander.speedScale ?? 0.35 });
    },
    reset() {
      threat.clear();
      currentMode = "idle";
      currentTarget = null;
      evading = false;
      wanderClock = 0;
      wanderTo = null;
    },
  };
}
