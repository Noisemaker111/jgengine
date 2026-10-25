import { engineActions, useGameEngineState, type GameEngine } from "@/runtime/gameEngine";
import { useEffect } from "react";

/**
 * Drives the engine's time-bounded client state with precise one-shot timers
 * instead of a periodic poll. Live gameplay numbers (money, tokens, income, heat)
 * are reactive via Convex / the game clock and update on their own; these effects
 * exist only so transient celebration / pulse cues clear themselves and so a timed
 * tutorial step can complete — each schedules a single setTimeout for exactly when
 * it is due, so an idle world performs no work and triggers no re-renders.
 */
export function useEngineEphemeralTimers(engine: GameEngine) {
  const launchCelebrationUntil = useGameEngineState(engine, (state) => state.effects.launchCelebrationUntil);
  const spendPulseUntil = useGameEngineState(engine, (state) => state.effects.spendPulse?.until ?? null);
  const unlockSuccessUntil = useGameEngineState(engine, (state) => state.effects.unlockSuccess?.until ?? null);
  const actionUntil = useGameEngineState(engine, (state) => state.gameplay.tutorial.actionUntil);
  const isPaused = useGameEngineState(engine, (state) => state.player.isPaused);

  useEffect(() => {
    if (launchCelebrationUntil === null) return;
    const id = window.setTimeout(
      () => engine.dispatch(engineActions.clearLaunchCelebration()),
      Math.max(0, launchCelebrationUntil - Date.now()),
    );
    return () => window.clearTimeout(id);
  }, [engine, launchCelebrationUntil]);

  useEffect(() => {
    if (spendPulseUntil === null) return;
    const id = window.setTimeout(
      () => engine.dispatch(engineActions.clearSpendPulse()),
      Math.max(0, spendPulseUntil - Date.now()),
    );
    return () => window.clearTimeout(id);
  }, [engine, spendPulseUntil]);

  useEffect(() => {
    if (unlockSuccessUntil === null) return;
    const id = window.setTimeout(
      () => engine.dispatch(engineActions.clearUnlockSuccess()),
      Math.max(0, unlockSuccessUntil - Date.now()),
    );
    return () => window.clearTimeout(id);
  }, [engine, unlockSuccessUntil]);

  useEffect(() => {
    if (actionUntil === null || isPaused) return;
    const id = window.setTimeout(
      () => engine.actions.tick(Date.now()),
      Math.max(0, actionUntil - Date.now()),
    );
    return () => window.clearTimeout(id);
  }, [actionUntil, engine, isPaused]);
}
