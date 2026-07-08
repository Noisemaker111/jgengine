import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { PhysicsWorld, type CollisionEvent } from "@jgengine/core/physics/physicsWorld";
import { groundFieldFor } from "@jgengine/core/world/terrain";
import { useEngineState, type ReadableEngineStore } from "@jgengine/react/engineStore";
import { useGameContext } from "@jgengine/react/provider";

import { LEVELS, type BlockPiece, type DummyPiece, type LevelDef } from "../levels/catalog";
import { MATERIALS, resolveBlockImpact, resolveDummyImpact, type BlockMaterial } from "../physics/impact";
import { clampPull, launchVelocity, sampleTrajectory, type Vec3 } from "../physics/trajectory";
import { computeLevelScore, levelCleared, starsForScore } from "../scoring";
import { world } from "../../world";

export type ShotPhase = "aiming" | "dragging" | "flying";
export type LevelOutcome = "playing" | "cleared" | "failed" | "won";

export interface SlingshotState {
  levelIndex: number;
  levelName: string;
  shotsLeft: number;
  shotsMax: number;
  targetsTotal: number;
  targetsDestroyed: number;
  levelScore: number;
  totalScore: number;
  stars: 0 | 1 | 2 | 3;
  phase: ShotPhase;
  outcome: LevelOutcome;
  dragPoint: Vec3 | null;
  trajectory: readonly Vec3[];
  hasDragged: boolean;
  epoch: number;
}

export type BodyMeta =
  | { kind: "ground" }
  | { kind: "block"; pieceId: string; material: BlockMaterial }
  | { kind: "dummy"; pieceId: string }
  | { kind: "projectile" };

interface LiveBlock extends BlockPiece {
  position: Vec3;
}

interface LiveDummy extends DummyPiece {
  position: Vec3;
}

export const GRAVITY = -18;
export const GROUND_SURFACE_Y = 0;
export const GROUND_HALF: Vec3 = [30, 0.5, 8];
export const GROUND_CENTER: Vec3 = [14, GROUND_SURFACE_Y - GROUND_HALF[1] - 0.05, 0];
export const SLING_ANCHOR: Vec3 = [0, 1.2, 0];
export const MAX_PULL = 2.6;
export const GRAB_RADIUS = 3.5;
export const GRAB_RADIUS_COARSE = 6.5;
export const POWER_SCALE = 9;
export const MAX_LAUNCH_SPEED = 24;
export const PROJECTILE_HALF: Vec3 = [0.32, 0.32, 0.32];
export const PROJECTILE_MASS = 3;
export const MIN_IMPACT_SPEED = 0.6;
export const MAX_FLIGHT_SECONDS = 8;
export const MAX_STEP_DT = 0.05;
export const TRAJECTORY_STEPS = 90;
export const TRAJECTORY_DT = 1 / 60;
const CAPACITY = 96;
export const GROUND_FIELD = groundFieldFor(world);

export function grabRadiusFor(coarsePointer: boolean): number {
  return coarsePointer ? GRAB_RADIUS_COARSE : GRAB_RADIUS;
}

function toLiveBlock(block: BlockPiece): LiveBlock {
  return { ...block, position: block.position };
}

function toLiveDummy(dummy: DummyPiece): LiveDummy {
  return { ...dummy, position: dummy.position };
}

export class SlingshotStore implements ReadableEngineStore<SlingshotState> {
  readonly world: PhysicsWorld;
  bodyMeta: BodyMeta[] = [];

  private listeners = new Set<(state: SlingshotState) => void>();
  private state: SlingshotState;
  private blocks: LiveBlock[] = [];
  private dummies: LiveDummy[] = [];
  private destroyedBlocks = new Set<string>();
  private destroyedDummies = new Set<string>();
  private flightTimer = 0;
  private epochCounter = 0;

  constructor() {
    this.world = new PhysicsWorld({
      capacity: CAPACITY,
      bounds: { min: [-6, -3, -9], max: [46, 26, 9] },
      gravity: GRAVITY,
    });
    this.world.onCollision(this.handleCollision, MIN_IMPACT_SPEED);
    this.state = this.freshLevelState(0, 0, false);
    this.blocks = LEVELS[0]!.blocks.map(toLiveBlock);
    this.dummies = LEVELS[0]!.dummies.map(toLiveDummy);
    this.rebuildWorld();
  }

  getState = (): SlingshotState => this.state;

  subscribe = (listener: (state: SlingshotState) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify(): void {
    for (const listener of this.listeners) listener(this.state);
  }

  private setState(patch: Partial<SlingshotState>): void {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  private freshLevelState(levelIndex: number, totalScore: number, hasDragged: boolean): SlingshotState {
    const level = LEVELS[levelIndex]!;
    return {
      levelIndex,
      levelName: level.name,
      shotsLeft: level.shotsMax,
      shotsMax: level.shotsMax,
      targetsTotal: level.dummies.length,
      targetsDestroyed: 0,
      levelScore: 0,
      totalScore,
      stars: 0,
      phase: "aiming",
      outcome: "playing",
      dragPoint: null,
      trajectory: [],
      hasDragged,
      epoch: (this.epochCounter += 1),
    };
  }

  loadLevel(levelIndex: number, totalScore: number): void {
    const level: LevelDef | undefined = LEVELS[levelIndex];
    if (level === undefined) return;
    this.blocks = level.blocks.map(toLiveBlock);
    this.dummies = level.dummies.map(toLiveDummy);
    this.destroyedBlocks.clear();
    this.destroyedDummies.clear();
    this.flightTimer = 0;
    this.rebuildWorld();
    this.state = this.freshLevelState(levelIndex, totalScore, this.state.hasDragged);
    this.notify();
  }

  retryLevel(): void {
    this.loadLevel(this.state.levelIndex, this.state.totalScore - this.state.levelScore);
  }

  nextLevel(): void {
    const nextIndex = this.state.levelIndex + 1;
    if (nextIndex >= LEVELS.length) {
      this.setState({ outcome: "won" });
      return;
    }
    this.loadLevel(nextIndex, this.state.totalScore);
  }

  private rebuildWorld(): void {
    this.world.clear();
    this.bodyMeta = [];
    this.world.addBody({ position: GROUND_CENTER, halfExtents: GROUND_HALF, static: true });
    this.bodyMeta.push({ kind: "ground" });
    for (const block of this.blocks) {
      this.world.addBody({
        position: block.position,
        halfExtents: block.halfExtents,
        mass: MATERIALS[block.material].mass,
        asleep: true,
      });
      this.bodyMeta.push({ kind: "block", pieceId: block.id, material: block.material });
    }
    for (const dummy of this.dummies) {
      this.world.addBody({ position: dummy.position, halfExtents: dummy.halfExtents, mass: 1, asleep: true });
      this.bodyMeta.push({ kind: "dummy", pieceId: dummy.id });
    }
  }

  private handleCollision = (event: CollisionEvent): void => {
    this.applyImpact(event.a, event.impulse);
    this.applyImpact(event.b, event.impulse);
  };

  private applyImpact(bodyIndex: number, impulse: number): void {
    const meta = this.bodyMeta[bodyIndex];
    if (meta === undefined) return;
    if (meta.kind === "block" && !this.destroyedBlocks.has(meta.pieceId) && resolveBlockImpact(meta.material, impulse)) {
      this.destroyedBlocks.add(meta.pieceId);
      this.neutralizeBody(bodyIndex);
      this.world.wakeAll();
    } else if (meta.kind === "dummy" && !this.destroyedDummies.has(meta.pieceId) && resolveDummyImpact(impulse)) {
      this.destroyedDummies.add(meta.pieceId);
      this.neutralizeBody(bodyIndex);
      this.world.wakeAll();
    }
  }

  private neutralizeBody(bodyIndex: number): void {
    this.world.halfX[bodyIndex] = 0.001;
    this.world.halfY[bodyIndex] = 0.001;
    this.world.halfZ[bodyIndex] = 0.001;
    this.world.wake(bodyIndex);
  }

  beginAim(point: Vec3, grabRadius: number = GRAB_RADIUS): void {
    if (this.state.phase !== "aiming") return;
    const dx = point[0] - SLING_ANCHOR[0];
    const dy = point[1] - SLING_ANCHOR[1];
    const dz = point[2] - SLING_ANCHOR[2];
    if (Math.hypot(dx, dy, dz) > grabRadius) return;
    this.setState({ phase: "dragging", dragPoint: point, trajectory: this.previewFor(point) });
  }

  updateAim(point: Vec3): void {
    if (this.state.phase !== "dragging") return;
    this.setState({ dragPoint: point, trajectory: this.previewFor(point) });
  }

  private previewFor(point: Vec3): readonly Vec3[] {
    const clamped = clampPull(SLING_ANCHOR, point, MAX_PULL);
    const velocity = launchVelocity({
      anchor: SLING_ANCHOR,
      pulledPoint: point,
      maxPull: MAX_PULL,
      powerScale: POWER_SCALE,
      maxSpeed: MAX_LAUNCH_SPEED,
    });
    const floorY = GROUND_FIELD.sampleHeight(clamped[0], clamped[2]);
    return sampleTrajectory(clamped, velocity, GRAVITY, TRAJECTORY_STEPS, TRAJECTORY_DT, floorY);
  }

  cancelAim(): void {
    if (this.state.phase !== "dragging") return;
    this.setState({ phase: "aiming", dragPoint: null, trajectory: [], hasDragged: true });
  }

  releaseAim(): void {
    if (this.state.phase !== "dragging" || this.state.dragPoint === null) return;
    const velocity = launchVelocity({
      anchor: SLING_ANCHOR,
      pulledPoint: this.state.dragPoint,
      maxPull: MAX_PULL,
      powerScale: POWER_SCALE,
      maxSpeed: MAX_LAUNCH_SPEED,
    });
    if (Math.hypot(...velocity) < 0.5) {
      this.cancelAim();
      return;
    }
    const origin = clampPull(SLING_ANCHOR, this.state.dragPoint, MAX_PULL);
    this.world.addBody({
      position: origin,
      halfExtents: PROJECTILE_HALF,
      velocity,
      mass: PROJECTILE_MASS,
    });
    this.bodyMeta.push({ kind: "projectile" });
    this.flightTimer = 0;
    this.setState({
      phase: "flying",
      shotsLeft: this.state.shotsLeft - 1,
      dragPoint: null,
      trajectory: [],
      hasDragged: true,
      epoch: (this.epochCounter += 1),
    });
  }

  tick(dt: number): void {
    if (this.state.phase !== "flying") return;
    const stepped = Math.min(dt, MAX_STEP_DT);
    const stats = this.world.step(stepped);
    this.flightTimer += stepped;
    if (stats.awake === 0 || this.flightTimer > MAX_FLIGHT_SECONDS) this.resolveShot();
  }

  private resolveShot(): void {
    this.blocks = this.blocks.filter((block) => !this.destroyedBlocks.has(block.id));
    this.dummies = this.dummies.filter((dummy) => !this.destroyedDummies.has(dummy.id));
    for (let i = 0; i < this.bodyMeta.length; i += 1) {
      const meta = this.bodyMeta[i]!;
      if (meta.kind === "block") {
        const block = this.blocks.find((b) => b.id === meta.pieceId);
        if (block !== undefined) block.position = [this.world.posX[i]!, this.world.posY[i]!, this.world.posZ[i]!];
      } else if (meta.kind === "dummy") {
        const dummy = this.dummies.find((d) => d.id === meta.pieceId);
        if (dummy !== undefined) dummy.position = [this.world.posX[i]!, this.world.posY[i]!, this.world.posZ[i]!];
      }
    }
    this.rebuildWorld();

    const targetsTotal = this.state.targetsTotal;
    const targetsDestroyed = targetsTotal - this.dummies.length;
    const shotsUsed = this.state.shotsMax - this.state.shotsLeft;
    const outcome: LevelOutcome = levelCleared({ targetsDestroyed, targetsTotal, shotsUsed, shotsMax: this.state.shotsMax })
      ? "cleared"
      : this.state.shotsLeft <= 0
        ? "failed"
        : "playing";
    const levelScore =
      outcome === "cleared"
        ? computeLevelScore({ targetsDestroyed, targetsTotal, shotsUsed, shotsMax: this.state.shotsMax })
        : 0;
    const stars = outcome === "cleared" ? starsForScore(levelScore, targetsTotal, this.state.shotsMax) : 0;
    this.setState({
      targetsDestroyed,
      levelScore,
      totalScore: this.state.totalScore + levelScore,
      stars,
      phase: "aiming",
      outcome,
      epoch: (this.epochCounter += 1),
    });
  }
}

const stores = new WeakMap<GameContext, SlingshotStore>();

export function slingshotStoreFor(ctx: GameContext): SlingshotStore {
  let store = stores.get(ctx);
  if (store === undefined) {
    store = new SlingshotStore();
    stores.set(ctx, store);
  }
  return store;
}

export function useSlingshotStore(): SlingshotStore {
  const ctx = useGameContext();
  return slingshotStoreFor(ctx);
}

export function useSlingshotState(): SlingshotState {
  return useEngineState(useSlingshotStore());
}
