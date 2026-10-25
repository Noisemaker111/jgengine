/**
 * A game as one declaration the engine runs. The world (people, places, factions, things, kinds
 * that get placed, actions, totals, flows, queues, jobs, ripples, schedules) is data; what a
 * declaration can't say is a named hook. A refused command's message reaches the shared notice feed. `defineGameSpec` turns it into an engine system: the
 * world lives in one store (so saves and host-authority sync come with it), every action is a
 * command that refuses with a reason, and each tick reports what was built, removed or landed so
 * the game only has to put it on screen.
 */

import type { MissionRewards, MissionTickInput } from "../mission/mission";
import { defineSystem, type SystemDefinition } from "../game/defineSystem";
import type { GameContext } from "../runtime/gameContext";
import { perContext } from "../runtime/perContext";
import { defineStore, type StoreHandle } from "../store/defineStore";
import type { ScenePoint3 } from "../world/sceneShapes";
import {
  createWorldModel,
  defineWorldModel,
  type WorldEvent,
  type WorldFactValue,
  type WorldHookCall,
  type WorldInstanceView,
  type WorldJobEvent,
  type WorldModel,
  type WorldModelDecl,
  type WorldModelDef,
  type WorldModelState,
  type WorldRefusal,
  type WorldRemoved,
} from "./worldModel";

/** Everything a game is, as data plus the code hooks the data names. */
export interface GameSpecDecl {
  /** Store and command prefix: `<id>.place`, `<id>.act`, the `<id>.world` store. */
  id: string;
  world: WorldModelDecl;
  /** Marker positions for places, slots and mission objectives (usually `missionMarkers(editorLayers)`). */
  markers?: Readonly<Record<string, ScenePoint3>> | ((ctx: GameContext) => Readonly<Record<string, ScenePoint3>>);
  /** Code for whatever a declaration names with `hook`. */
  hooks?: Readonly<Record<string, (ctx: GameContext, call: WorldHookCall) => void>>;
  /** Where named ripple outputs go (`heat`, `noise`, `traffic`). */
  outputs?: Readonly<Record<string, (ctx: GameContext, amount: number, event: WorldEvent) => void>>;
  /** Pay a job's mission rewards through the game's own wallet. */
  onReward?(ctx: GameContext, rewards: MissionRewards, jobId: string): void;
  /** Put a finished build on screen (spawn its entity). */
  onReady?(ctx: GameContext, instance: WorldInstanceView): void;
  /** Take a removed instance off screen; `removed.refund` is what came back. */
  onRemoved?(ctx: GameContext, removed: WorldRemoved): void;
  /**
   * Put every built instance back on screen: runs on the first frame of a world and again after a
   * save loads, so a game never has to respawn its own buildings.
   */
  onRestored?(ctx: GameContext, instances: readonly WorldInstanceView[]): void;
  /** Return a message to refuse every command right now ("The park is closed"), or null to accept. */
  accepting?(ctx: GameContext): string | null;
  /** React to an action landing (sound, effect). */
  onLanded?(ctx: GameContext, action: string, target: string | null): void;
  onJob?(ctx: GameContext, event: WorldJobEvent): void;
  /** What missions see each tick: actor positions, events, extra facts. */
  input?(ctx: GameContext): MissionTickInput;
  /** Mission actor id for `pursue` objectives that name no pursuer. */
  defaultPursuer?: string;
  /** Facts the game computes each read (`clock.hour`, `police.stars`); conditions see them, saves never hold them. */
  live?(ctx: GameContext): Readonly<Record<string, WorldFactValue>>;
}

/** A running game spec: its checked world, the system to install, and the live world per context. */
export interface GameSpec {
  readonly id: string;
  readonly def: WorldModelDef;
  /** Install with `defineGame({ systems: [spec.system] })`. */
  readonly system: SystemDefinition;
  readonly store: StoreHandle<WorldModelState | undefined>;
  /** The live world of one game context. */
  of(ctx: GameContext): WorldModel;
  /** Report a world event (gunfire, a breakdown, a leak); it ripples through the declaration. */
  emit(ctx: GameContext, event: WorldEvent): void;
}

/** Input of the `<id>.place` command. */
export interface GameSpecPlaceInput {
  kind: string;
  slot?: string;
  cell?: readonly [number, number];
}

/** Input of the `<id>.act` command. */
export interface GameSpecActInput {
  action: string;
  target?: string;
}

const refusal = (result: WorldRefusal | null) => (result === null ? null : { reason: result.reason, message: result.message });

/**
 * Turn a game declaration into an installable engine system with commands
 * `<id>.place`, `<id>.remove`, `<id>.act`, `<id>.cancel` and `<id>.job.start`.
 *
 * @capability game-spec a whole game as one declaration the engine runs, with named code hooks for the rest
 */
export function defineGameSpec(spec: GameSpecDecl): GameSpec {
  if (spec.id.trim().length === 0 || spec.id.includes(" ")) throw new Error("game spec: id must be one word");
  const def = defineWorldModel(spec.world);
  const store = defineStore<WorldModelState | undefined>(`${spec.id}.world`, undefined);
  for (const hook of namedHooks(def)) {
    if (spec.hooks?.[hook] === undefined) throw new Error(`game spec "${spec.id}": the declaration names hook "${hook}" but hooks has no "${hook}"`);
  }

  const of = perContext((ctx: GameContext): WorldModel => {
    const markers = typeof spec.markers === "function" ? spec.markers(ctx) : (spec.markers ?? {});
    const hooks: Record<string, (call: WorldHookCall) => void> = {};
    for (const [name, hook] of Object.entries(spec.hooks ?? {})) hooks[name] = (call) => hook(ctx, call);
    return createWorldModel(def, {
      markers,
      storage: { read: () => store.read(ctx), write: (next) => store.write(ctx, next) },
      hooks,
      onOutput: (name, amount, event) => spec.outputs?.[name]?.(ctx, amount, event),
      ...(spec.onReward !== undefined ? { onReward: (rewards: MissionRewards, jobId: string) => spec.onReward!(ctx, rewards, jobId) } : {}),
      ...(spec.defaultPursuer !== undefined ? { defaultPursuer: spec.defaultPursuer } : {}),
      ...(spec.live !== undefined ? { live: () => spec.live!(ctx) } : {}),
    });
  });

  const restorePending = perContext((_ctx: GameContext) => ({ value: true }));
  const closed = (ctx: GameContext) => {
    const message = spec.accepting?.(ctx) ?? null;
    return message === null ? null : { reason: "closed", message };
  };
  const system = defineSystem({
    id: `${spec.id}.world`,
    tick: { type: "frame" },
    create(ctx) {
      ctx.game.commands.define<GameSpecPlaceInput>(`${spec.id}.place`, {
        validate: (state, input) => closed(state) ?? refusal(of(state).canPlace(input.kind, placement(input))),
        apply(state, input) {
          of(state).place(input.kind, placement(input));
          return state;
        },
      });
      ctx.game.commands.define<{ id: string }>(`${spec.id}.remove`, {
        validate: (state, input) => closed(state) ?? (of(state).instance(input.id) === null ? { reason: "missing", message: "Nothing to remove there" } : null),
        apply(state, input) {
          of(state).remove(input.id);
          return state;
        },
      });
      ctx.game.commands.define<GameSpecActInput>(`${spec.id}.act`, {
        validate: (state, input) => closed(state) ?? refusal(of(state).canAct(input.action, input.target)),
        apply(state, input) {
          of(state).act(input.action, input.target);
          return state;
        },
      });
      ctx.game.commands.define<{ order: string }>(`${spec.id}.cancel`, {
        validate: (state) => closed(state),
        apply(state, input) {
          of(state).cancel(input.order);
          return state;
        },
      });
      ctx.game.commands.define<{ id: string }>(`${spec.id}.job.start`, {
        validate(state, input) {
          const shut = closed(state);
          if (shut !== null) return shut;
          const status = of(state).job(input.id)?.status;
          return status === "available" || status === "failed" ? null : { reason: "job-unavailable" };
        },
        apply(state, input) {
          const event = of(state).startJob(input.id);
          if (event !== null) spec.onJob?.(state, event);
          return state;
        },
      });
    },
    save: (ctx) => ({
      // The world itself saves through its store; this only marks that a load happened.
      key: `${spec.id}.restored`,
      snapshot: () => 1,
      hydrate: () => {
        restorePending(ctx).value = true;
      },
    }),
    update(ctx, dt) {
      const world = of(ctx);
      const pending = restorePending(ctx);
      const restored = new Set<string>();
      if (pending.value) {
        pending.value = false;
        const built = world.instances().filter((instance) => instance.ready);
        // Whatever onRestored put back is not reported again as newly built this frame.
        if (built.length > 0 && spec.onRestored !== undefined) {
          for (const instance of built) restored.add(instance.id);
          spec.onRestored(ctx, built);
        }
      }
      const result = world.tick(dt, spec.input?.(ctx) ?? {});
      for (const instance of result.ready ?? []) if (!restored.has(instance.id)) spec.onReady?.(ctx, instance);
      for (const removed of result.removed ?? []) spec.onRemoved?.(ctx, removed);
      for (const entry of result.landed ?? []) spec.onLanded?.(ctx, entry.action, entry.target);
      for (const event of result.jobs) spec.onJob?.(ctx, event);
    },
  });

  return { id: spec.id, def, system, store, of, emit: (ctx, event) => void of(ctx).emit(event) };
}

function placement(input: GameSpecPlaceInput) {
  return { ...(input.slot !== undefined ? { slot: input.slot } : {}), ...(input.cell !== undefined ? { cell: input.cell } : {}) };
}

function namedHooks(def: WorldModelDef): string[] {
  const out = new Set<string>();
  const add = (hook: string | undefined) => {
    if (hook !== undefined) out.add(hook);
  };
  for (const declared of Object.values(def.ripples ?? {})) for (const ripple of [declared].flat()) add(ripple.hook);
  for (const trigger of Object.values(def.triggers ?? {})) add(trigger.hook);
  for (const job of Object.values(def.jobs ?? {})) add(job.hook);
  for (const kind of Object.values(def.kinds ?? {})) add(kind.hook);
  for (const action of Object.values(def.actions ?? {})) add(action.hook);
  return [...out];
}
