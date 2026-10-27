import { defineSystem, type SystemDefinition } from "../game/defineSystem";
import { createMarkerSet, type MarkerSet } from "../map/markers";
import { createWaypointStore, type WaypointStore } from "../map/waypoints";
import { applyQuestRewards } from "../mission/quest";
import { createObjectiveBanner, type ObjectiveBannerController } from "../mission/objectiveBanner";
import type { GameContext } from "../runtime/gameContext";
import type { SnapshotModule } from "../runtime/worldSnapshot";
import { createOnboarding, validateOnboarding, type Onboarding, type OnboardingConfig, type OnboardingPoint, type OnboardingSnapshot, type OnboardingStep } from "./onboarding";

/** The id of the waypoint and minimap marker the onboarding owns. */
export const ONBOARDING_MARK = "onboarding";

/** Options for {@link createOnboardingSystem} beyond the declared steps. */
export interface OnboardingSystemOptions {
  /** Grant a step's `grants.xp`. Required when a step grants xp. */
  grantXp?(ctx: GameContext, userId: string, amount: number): void;
  /** Seconds between target lookups for the pointer. Default 0.25. */
  lookEvery?: number;
}

/** What the HUD and the world overlay read from a running onboarding. */
export interface OnboardingRuntime {
  readonly config: OnboardingConfig<GameContext>;
  /** One player's run; the local player's when `userId` is omitted. */
  run(userId?: string): Onboarding<GameContext>;
  /** The local player's pointer: one tracked waypoint at the current target. */
  readonly waypoints: WaypointStore;
  /** The local player's minimap marker for the current target. */
  readonly markers: MarkerSet;
  /** Step-done banners for the local player. */
  readonly banner: ObjectiveBannerController;
  /** Where the pointer points now, or `null`. */
  pointing(): OnboardingPoint | null;
}

interface InstalledOnboarding extends OnboardingRuntime {
  tick(dt: number): void;
  save: SnapshotModule<Record<string, OnboardingSnapshot>>;
  reset(): void;
}

const runtimes = new WeakMap<GameContext, InstalledOnboarding>();

/** The onboarding running in `ctx`, or `null` when the game installed none. */
export function onboardingOf(ctx: GameContext): OnboardingRuntime | null {
  return runtimes.get(ctx) ?? null;
}

/**
 * The step text that locks `id` for the local player, or `null` when `id` is free. HUDs hide or grey locked UI with it.
 *
 * @capability onboarding-lock which onboarding step still locks a command or UI id, so a HUD can grey it out
 */
export function onboardingLock(ctx: GameContext, id: string): string | null {
  return onboardingOf(ctx)?.run().lockedBy(id)?.text ?? null;
}

function payloadUser(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const userId: unknown = Reflect.get(payload, "userId");
  return typeof userId === "string" ? userId : null;
}

function distanceSq(a: OnboardingPoint, b: OnboardingPoint): number {
  return (a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2;
}

/**
 * A game's onboarding as one system: declare the steps as data, and the engine completes them from
 * game events and conditions, refuses locked commands (`ctx.game.commands.gate`), hands out each
 * step's grants, announces finished steps on an objective banner, shows the steps as a quest in
 * `QuestTracker`, and keeps one waypoint and one minimap marker on the current step's target. It
 * saves per player, and `onboarding.skip` / `onboarding.next` commands skip it and press Next.
 * Render it with `OnboardingHud` and `OnboardingPointer`; read it with {@link onboardingOf}.
 *
 * @capability onboarding declared tutorial steps that point at world things (arrow, minimap marker, waypoint), complete from events or conditions, lock commands until done, grant on completion, skip and save — as a separate tutorial level, a teaching start area or hints blended into stage one
 */
export function createOnboardingSystem(config: OnboardingConfig<GameContext>, options: OnboardingSystemOptions = {}): SystemDefinition {
  validateOnboarding(config);
  if (options.grantXp === undefined && config.steps.some((step) => step.grants?.xp !== undefined)) {
    throw new Error(`onboarding "${config.id}": a step grants xp, so createOnboardingSystem needs grantXp`);
  }
  const lookEvery = options.lookEvery ?? 0.25;
  const events = [...new Set(config.steps.flatMap((step) => ("event" in step.done ? [step.done.event] : [])))];

  return defineSystem({
    id: "onboarding",
    tick: { type: "fixed", rate: 10 },
    create(ctx) {
      const runs = new Map<string, Onboarding<GameContext>>();
      const waypoints = createWaypointStore();
      const markers = createMarkerSet();
      const banner = createObjectiveBanner();
      let pointing: OnboardingPoint | null = null;
      let sinceLook = Number.POSITIVE_INFINITY;
      let lastStep: string | null = null;

      const run = (userId: string = ctx.player.userId): Onboarding<GameContext> => {
        let existing = runs.get(userId);
        if (existing === undefined) {
          existing = createOnboarding(config);
          // Every change, including one from a background tick, reaches the HUD through ctx.subscribe.
          existing.subscribe(() => ctx.touch());
          runs.set(userId, existing);
        }
        return existing;
      };

      const finish = (userId: string, steps: readonly OnboardingStep<GameContext>[]): void => {
        const last = steps.at(-1);
        if (last === undefined) return;
        for (const step of steps) {
          if (step.grants !== undefined) {
            const fail = applyQuestRewards(step.grants, {
              grantItems: (items) => {
                for (const item of items) {
                  const put = ctx.player.inventoryFor(userId).put(item.inventory, item.item, item.count);
                  if (put.status !== "ok") return { reason: put.reason };
                }
                return null;
              },
              grantXp: (amount) => options.grantXp?.(ctx, userId, amount),
              grantEconomy: (currency, amount) => ctx.game.economy.grant(userId, currency, amount),
              grantUnlock: (unlockId) => {
                if (ctx.game.unlocks === undefined) throw new Error(`onboarding "${config.id}": step "${step.id}" grants an unlock, so the game needs features.unlocks`);
                ctx.game.unlocks.grant(userId, unlockId);
              },
            });
            if (fail !== null) ctx.game.notices.push({ text: `Could not give the reward: ${fail.reason}`, tone: "deny" });
          }
        }
        const after = run(userId);
        if (userId === ctx.player.userId && config.style !== "blended") {
          const next = after.current();
          banner.announce({ title: last.text, subtitle: next === null ? "Done" : `Next: ${next.step.text}`, kind: "onboarding" });
        }
        if (after.isFinished()) config.finish?.(ctx, userId);
        sinceLook = Number.POSITIVE_INFINITY;
      };

      const look = (): void => {
        const me = ctx.scene.entity.get(ctx.player.userId);
        const view = run().current();
        let at: OnboardingPoint | null = null;
        let label = "";
        let showPointer = false;
        let showMarker = false;
        if (me !== null && view !== null) {
          const area = config.area;
          const outside = config.style === "teaching-area" && area !== undefined && (me.position[0] - area.center[0]) ** 2 + (me.position[2] - area.center[1]) ** 2 > area.radius ** 2;
          if (outside) {
            at = [area.center[0], ctx.world.groundHeightAt(area.center[0], area.center[1]), area.center[1]];
            label = `Back to ${area.label ?? "the start"}`;
            showPointer = showMarker = true;
          } else if (view.step.target !== undefined) {
            at = locate(ctx, config, view.step.target, me.position);
            label = view.step.text;
            showPointer = view.step.pointer !== false;
            showMarker = view.step.minimap !== false;
          }
        }
        pointing = at;
        if (at !== null && showPointer) {
          const placed = waypoints.get(ONBOARDING_MARK);
          if (placed === null || placed.label !== label || (placed.position[0] - at[0]) ** 2 + (placed.position[1] - at[2]) ** 2 > 0.25) {
            waypoints.place([at[0], at[2]], { id: ONBOARDING_MARK, kind: "objective", label, height: at[1] + 1.2, track: true });
          }
        } else if (waypoints.get(ONBOARDING_MARK) !== null) waypoints.remove(ONBOARDING_MARK);
        if (at !== null && showMarker) {
          const placed = markers.get(ONBOARDING_MARK);
          if (placed === null || placed.label !== label || distanceSq(placed.position, at) > 0.25) markers.add({ id: ONBOARDING_MARK, kind: "objective", position: at, label });
        } else if (markers.get(ONBOARDING_MARK) !== null) markers.remove(ONBOARDING_MARK);
      };

      for (const name of events) {
        ctx.game.events.on(name, (payload: unknown) => {
          const userId = payloadUser(payload) ?? ctx.player.userId;
          const step = run(userId).event(name, payload);
          if (step !== null) finish(userId, [step]);
        });
      }
      ctx.game.commands.gate((name) => {
        const step = run(ctx.game.commands.actor() ?? ctx.player.userId).lockedBy(name);
        return step === null ? null : { reason: "onboarding-locked", message: `First: ${step.text}` };
      });
      ctx.game.commands.define("onboarding.skip", {
        apply(state) {
          const userId = state.game.commands.actor() ?? state.player.userId;
          if (run(userId).skip()) {
            config.finish?.(state, userId);
            sinceLook = Number.POSITIVE_INFINITY;
          }
          return state;
        },
      });
      ctx.game.commands.define("onboarding.next", {
        apply(state) {
          const userId = state.game.commands.actor() ?? state.player.userId;
          const step = run(userId).acknowledge();
          if (step !== null) finish(userId, [step]);
          return state;
        },
      });
      runtimes.set(ctx, {
        config,
        run,
        waypoints,
        markers,
        banner,
        pointing: () => pointing,
        tick(dt) {
          for (const userId of ctx.game.players?.ids() ?? [ctx.player.userId]) finish(userId, run(userId).evaluate(ctx, userId));
          const stepNow = run().current()?.step.id ?? null;
          sinceLook += dt;
          if (stepNow !== lastStep || sinceLook >= lookEvery) {
            lastStep = stepNow;
            sinceLook = 0;
            look();
          }
        },
        save: {
          key: `onboarding.${config.id}`,
          snapshot: () => Object.fromEntries([...runs].map(([userId, entry]) => [userId, entry.snapshot()])),
          hydrate: (data: Record<string, OnboardingSnapshot>) => {
            for (const [userId, snapshot] of Object.entries(data)) run(userId).restore(snapshot);
            sinceLook = Number.POSITIVE_INFINITY;
          },
        },
        reset() {
          for (const entry of runs.values()) entry.reset();
          waypoints.clear();
          markers.clear();
          pointing = null;
          sinceLook = Number.POSITIVE_INFINITY;
        },
      });
    },
    update(ctx, dt) {
      runtimes.get(ctx)?.tick(dt);
    },
    save: (ctx) => runtimes.get(ctx)?.save,
    reset(ctx) {
      runtimes.get(ctx)?.reset();
    },
  });
}

/** Where a target is for a player standing at `from`, or `null` when nothing matches. */
function locate(ctx: GameContext, config: OnboardingConfig<GameContext>, target: NonNullable<OnboardingStep<GameContext>["target"]>, from: OnboardingPoint): OnboardingPoint | null {
  if ("at" in target) return target.at;
  if ("entity" in target) return ctx.scene.entity.get(target.entity)?.position ?? null;
  const within = target.within ?? 60;
  const finder = config.locate?.[target.kind];
  if (finder !== undefined) return finder(ctx, from, within);
  let best: OnboardingPoint | null = null;
  let bestSq = Number.POSITIVE_INFINITY;
  for (const id of ctx.scene.entity.inRadius([from[0], from[1], from[2]], within, (candidate) => ctx.scene.entity.get(candidate)?.name === target.kind)) {
    const at = ctx.scene.entity.get(id)?.position;
    if (at === undefined) continue;
    const sq = distanceSq(at, from);
    if (sq < bestSq) {
      bestSq = sq;
      best = at;
    }
  }
  return best;
}
