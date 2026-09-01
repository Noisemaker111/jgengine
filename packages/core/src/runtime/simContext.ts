import type { EntityStore } from "../scene/entityStore";
import { createPoseHistory, type PoseHistory, type RenderPose } from "./poseInterpolation";
import { createSimLoop, type SimAdvanceResult, type SimLoop, type SimulationConfig } from "./simLoop";

/** Where a registered stage runs inside one simulation step. */
export type SimStagePhase = "beforeMovement" | "afterMovement" | "afterTick";

/** Extra work a game or engine seam (a physics backend, a netcode buffer) runs inside every simulation step. */
export interface SimStage {
  id: string;
  phase: SimStagePhase;
  run(dt: number, tick: number): void;
}

/** Serializable `ctx.sim` state: loop position plus the interpolation pose history. */
export interface SimContextState {
  loop: ReturnType<SimLoop["snapshot"]>;
  poses: ReturnType<PoseHistory["snapshot"]>;
}

/**
 * `ctx.sim`: the simulation stepper shared by every driver plus the render-side interpolation it enables.
 * Drivers call {@link advance} with real elapsed seconds and do their per-step work inside the callback;
 * renderers call {@link renderPose} each frame.
 */
export interface SimContext {
  readonly loop: SimLoop;
  /** Advance the loop; `body` runs once per simulation step with that step's dt. Pose history is captured before each step. */
  advance(realDt: number, body: (dt: number, tick: number) => void): SimAdvanceResult;
  tick(): number;
  /** Interpolation fraction for the current frame, 1 on a variable loop. */
  alpha(): number;
  /** Interpolated pose for rendering; live pose on a variable loop. `false` when the entity does not exist. */
  renderPose(id: string, out: RenderPose): boolean;
  /** Forget an entity's interpolation history so it renders at its live pose next frame. */
  snapPose(id: string): void;
  /** Register a stage; returns an unregister handle. Stages run in registration order within a phase. */
  addStage(stage: SimStage): () => void;
  /** Run every stage registered for `phase`; drivers call this from inside {@link advance}'s body. */
  runStages(phase: SimStagePhase, dt: number): void;
  retune(config: SimulationConfig): void;
  snapshot(): SimContextState;
  restore(state: SimContextState): void;
}

/** Build `ctx.sim` for a context; `createGameContext` calls this from `definition.simulation`. */
export function createSimContext(options: { config?: SimulationConfig; entities: EntityStore }): SimContext {
  const { entities } = options;
  const loop = createSimLoop(options.config);
  const poses = createPoseHistory({ snapDistance: loop.config().snapDistance });
  const stages = new Map<SimStagePhase, SimStage[]>();
  let advancing = false;

  return {
    loop,
    advance(realDt, body) {
      if (advancing) throw new Error("ctx.sim.advance is not reentrant");
      advancing = true;
      try {
        return loop.advance(realDt, (dt, tick) => {
          if (loop.isFixed()) poses.beginStep(entities);
          body(dt, tick);
        });
      } finally {
        advancing = false;
      }
    },
    tick: () => loop.tick(),
    alpha: () => loop.alpha(),
    renderPose(id, out) {
      return poses.sample(entities, id, loop.isFixed() ? loop.alpha() : 1, out);
    },
    snapPose: (id) => poses.snap(id),
    addStage(stage) {
      const list = stages.get(stage.phase) ?? [];
      list.push(stage);
      stages.set(stage.phase, list);
      return () => {
        const current = stages.get(stage.phase);
        if (current === undefined) return;
        const index = current.indexOf(stage);
        if (index >= 0) current.splice(index, 1);
      };
    },
    runStages(phase, dt) {
      const list = stages.get(phase);
      if (list === undefined) return;
      const tick = loop.tick();
      for (const stage of list) stage.run(dt, tick);
    },
    retune(config) {
      loop.retune(config);
      if (config.snapDistance !== undefined) poses.retune({ snapDistance: config.snapDistance });
    },
    snapshot: () => ({ loop: loop.snapshot(), poses: poses.snapshot() }),
    restore(state) {
      loop.restore(state.loop);
      poses.restore(state.poses);
    },
  };
}
