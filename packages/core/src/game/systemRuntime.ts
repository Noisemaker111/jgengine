import type { GameLoop, LoopPlayer } from "./defineGame";
import type { SystemDefinition } from "./defineSystem";
import {
  compileSystemSchedule,
  type CompiledSystemSchedule,
  type CompileSystemScheduleOptions,
} from "./systemSchedule";
import type { GameContext } from "../runtime/gameContext";
import type { SnapshotModule } from "../runtime/worldSnapshot";

/** @internal */
export interface SystemModuleRegistration {
  registerSave(module: SnapshotModule): void;
  registerReplicate(module: SnapshotModule): void;
}

/** @internal */
export interface InstalledSystems {
  readonly schedule: CompiledSystemSchedule;
  /** Advance fixed/frame/interval systems for one game-time step of `dt` seconds. */
  tick(ctx: GameContext, dt: number): void;
  /** Invoke every system's `reset` (scenario/run wipe). */
  reset(ctx: GameContext): void;
  /** Invoke every system's `dispose` in reverse install order. */
  dispose(ctx: GameContext): void;
  /** Run one manual system by id (no-op if missing or not manual). */
  runManual(ctx: GameContext, id: string, dt?: number): void;
}

function resolveModule(
  spec: SnapshotModule | ((ctx: GameContext) => SnapshotModule | undefined) | undefined,
  ctx: GameContext,
): SnapshotModule | undefined {
  if (spec === undefined) return undefined;
  return typeof spec === "function" ? spec(ctx) : spec;
}

/**
 * Install systems on a live context: `create` → bind events → register save/replicate → `start`.
 * Call once per world boot (from the composed loop's `onInit`).
 * @internal
 */
export function installSystems(
  ctx: GameContext,
  systems: readonly SystemDefinition[],
  options?: CompileSystemScheduleOptions & {
    modules?: SystemModuleRegistration;
  },
): InstalledSystems {
  const schedule = compileSystemSchedule(systems, options);
  const list = systems;
  const unsubs: Array<() => void> = [];
  const intervalAcc = new Map<string, number>();
  const fixedAcc = new Map<number, number>();

  for (const system of list) {
    system.create?.(ctx);
  }

  for (const system of list) {
    if (system.events !== undefined) {
      for (const [name, handler] of Object.entries(system.events)) {
        if (handler === undefined) continue;
        const off = ctx.game.events.on(name as never, ((event: unknown) => {
          handler(ctx, event);
        }) as never);
        unsubs.push(off);
      }
    }
    const save = resolveModule(system.save, ctx);
    if (save !== undefined) options?.modules?.registerSave(save);
    const replicate = resolveModule(system.replicate, ctx);
    if (replicate !== undefined) options?.modules?.registerReplicate(replicate);
  }

  for (const system of list) {
    system.start?.(ctx);
  }

  for (const group of schedule.fixed) {
    fixedAcc.set(group.rate, 0);
  }
  for (const interval of schedule.intervals) {
    intervalAcc.set(interval.id, 0);
  }

  function runIds(ctx: GameContext, ids: readonly string[], dt: number): void {
    for (const id of ids) {
      schedule.systemsById.get(id)?.update?.(ctx, dt);
    }
  }

  function tick(ctx: GameContext, dt: number): void {
    if (!(dt > 0)) return;

    for (const group of schedule.fixed) {
      const step = 1 / group.rate;
      let acc = (fixedAcc.get(group.rate) ?? 0) + dt;
      while (acc >= step) {
        runIds(ctx, group.order, step);
        acc -= step;
      }
      fixedAcc.set(group.rate, acc);
    }

    runIds(ctx, schedule.frameOrder, dt);

    for (const interval of schedule.intervals) {
      const every = interval.every ?? 1;
      let acc = (intervalAcc.get(interval.id) ?? 0) + dt;
      while (acc >= every) {
        schedule.systemsById.get(interval.id)?.update?.(ctx, every);
        acc -= every;
      }
      intervalAcc.set(interval.id, acc);
    }
  }

  function reset(ctx: GameContext): void {
    for (const system of list) system.reset?.(ctx);
    for (const group of schedule.fixed) fixedAcc.set(group.rate, 0);
    for (const interval of schedule.intervals) intervalAcc.set(interval.id, 0);
  }

  function dispose(ctx: GameContext): void {
    for (const off of unsubs) off();
    unsubs.length = 0;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      list[i]?.dispose?.(ctx);
    }
  }

  function runManual(ctx: GameContext, id: string, dt = 0): void {
    if (!schedule.manual.includes(id)) return;
    schedule.systemsById.get(id)?.update?.(ctx, dt);
  }

  return { schedule, tick, reset, dispose, runManual };
}

const installedByCtx = new WeakMap<GameContext, InstalledSystems>();

/**
 * Look up systems installed on `ctx` (if any). Used by hosts that need `reset`/`dispose` after boot.
 * @internal
 */
export function systemsOf(ctx: GameContext): InstalledSystems | undefined {
  return installedByCtx.get(ctx);
}

/** @internal */
export interface ComposeGameLoopOptions extends CompileSystemScheduleOptions {
  /**
   * When true, the user loop's `onTick` runs before system ticks (default: systems first, then
   * residual loop work — the incremental-migration path).
   */
  loopBeforeSystems?: boolean;
}

/**
 * Merge a system list with an optional classic `GameLoop` into one loop the shell/runners drive.
 * Systems install on first `onInit`; classic hooks still run for incremental migration.
 *
 * @capability compose-game-loop fold composable systems into the game loop without a manual tick fan-out
 */
export function composeGameLoop(
  systems: readonly SystemDefinition[] | undefined,
  loop: GameLoop<GameContext> | undefined,
  options?: ComposeGameLoopOptions,
): GameLoop<GameContext> {
  if (systems === undefined || systems.length === 0) {
    return loop ?? {};
  }

  let installed: InstalledSystems | undefined;
  const loopBefore = options?.loopBeforeSystems === true;

  return {
    onInit(ctx) {
      const modules: SystemModuleRegistration | undefined =
        ctx.game.registerSave !== undefined && ctx.game.registerReplicate !== undefined
          ? {
              registerSave: (m) => ctx.game.registerSave!(m),
              registerReplicate: (m) => ctx.game.registerReplicate!(m),
            }
          : undefined;
      installed = installSystems(ctx, systems, { ...options, modules });
      installedByCtx.set(ctx, installed);
      loop?.onInit?.(ctx);
    },
    onNewPlayer(ctx, player?: LoopPlayer) {
      loop?.onNewPlayer?.(ctx, player);
    },
    onTick(ctx, dt) {
      if (loopBefore) {
        loop?.onTick?.(ctx, dt);
        installed?.tick(ctx, dt);
      } else {
        installed?.tick(ctx, dt);
        loop?.onTick?.(ctx, dt);
      }
    },
    onPlayerLeave(ctx, player) {
      loop?.onPlayerLeave?.(ctx, player);
    },
    onReset(ctx) {
      installed?.reset(ctx);
      loop?.onReset?.(ctx);
    },
    onDispose(ctx) {
      installed?.dispose(ctx);
      installedByCtx.delete(ctx);
      loop?.onDispose?.(ctx);
    },
  };
}
