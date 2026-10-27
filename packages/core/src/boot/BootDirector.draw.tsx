// @skill jgengine-ui
import { useEffect, useSyncExternalStore } from "react";

import { pagePrefetch } from "@jgengine/core/boot/assetPrefetch";
import { pageBoot } from "@jgengine/core/boot/bootSequence";
import { BootLoadingScreen, bootLoadingAreas, useBootStep } from "@jgengine/core/boot/bootScreen.view";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { modelLoadIdleMs } from "@jgengine/core/model/modelLoad.draw";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { warmupCovering, type SceneWarmupStore } from "@jgengine/core/scene/SceneWarmupGate.draw";

const noSubscribe = (): (() => void) => () => undefined;

/** How long the model loader must stay idle after Play before the entering screen lifts. */
export const ENTER_QUIET_MS = 250;

/** What the boot reads each check: the game's phase, the scene warmup, the prefetch and the model loader. */
export interface BootSignals {
  phase: ReturnType<typeof gamePhase>;
  /** The scene warmup still covers the canvas. */
  warming: boolean;
  /** Every near file the game named has been fetched. */
  nearReady: boolean;
  /** Ms the shared model loader has been idle; 0 while a model is in flight. */
  loaderIdleMs: number;
  /** World pieces still loading behind a boot guard. */
  areasLoading: number;
}

/**
 * The boot step the game's state asks for. A game in its menu phase is at its menu (its intro, when
 * it entered one, holds until it moves on itself). A game playing from boot loads until its scene is
 * warm and its world is in. A Play press enters at once when the files near the player are fetched
 * and the world is in; otherwise it shows the entering screen until they are and the loader is quiet.
 * @internal
 */
export function nextBootStep(step: ReturnType<typeof pageBoot.step>, signals: BootSignals): ReturnType<typeof pageBoot.step> {
  if (step === "playing") return step;
  if (signals.phase !== "playing") return step === "intro" ? "intro" : "menu";
  const worldIn = !signals.warming && signals.areasLoading === 0;
  if (step === "open" || step === "loading") return worldIn ? "playing" : "loading";
  if (step !== "entering" && signals.nearReady && worldIn) return "playing";
  return signals.nearReady && worldIn && signals.loaderIdleMs >= ENTER_QUIET_MS ? "playing" : "entering";
}

/**
 * Moves the page's boot from the game's own state, and draws the entering screen with the real
 * share of near files fetched. Mounted once per game view.
 * @internal
 */
export function BootDirector({ ctx, warmup }: { ctx: GameContext; warmup?: SceneWarmupStore }) {
  const step = useBootStep();
  const prefetch = useSyncExternalStore(pagePrefetch.subscribe, pagePrefetch.state, pagePrefetch.state);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const check = (): void => {
      if (pageBoot.done()) {
        if (timer !== undefined) clearInterval(timer);
        return;
      }
      pageBoot.enter(
        nextBootStep(pageBoot.step(), {
          phase: gamePhase(ctx),
          warming: warmup === undefined ? false : warmupCovering(warmup.get()),
          nearReady: pagePrefetch.nearReady(),
          loaderIdleMs: modelLoadIdleMs(),
          areasLoading: bootLoadingAreas(),
        }),
        "game state",
      );
    };
    check();
    // The loader's idle time grows without an event, so the boot is checked on a short interval until play starts.
    timer = setInterval(check, 50);
    const stopWarmup = warmup?.subscribe(check);
    const stopPrefetch = pagePrefetch.subscribe(check);
    return () => {
      if (timer !== undefined) clearInterval(timer);
      stopWarmup?.();
      stopPrefetch();
    };
  }, [ctx, warmup]);
  const warming = useSyncExternalStore(warmup?.subscribe ?? noSubscribe, () => (warmup === undefined ? false : warmupCovering(warmup.get())));
  // While the scene warms its own cover is the loading screen; after it, a world still loading shows this one.
  if (step !== "entering" && !(step === "loading" && !warming)) return null;
  const share = prefetch.nearTotal === 0 ? null : prefetch.nearDone / prefetch.nearTotal;
  return <BootLoadingScreen over label="Entering world" progress={share} detail={prefetch.nearTotal === 0 ? undefined : `${prefetch.nearDone} of ${prefetch.nearTotal} files`} />;
}
