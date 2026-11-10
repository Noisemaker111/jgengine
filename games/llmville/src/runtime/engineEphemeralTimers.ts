import { useEffect, useMemo } from "@jgengine/core/ui/jsx";

import { createTimerSet } from "@jgengine/core/time/timerSet";
import { engineActions, type GameEngine, type GameEngineState } from "./gameEngine";

/** Each timed cue: when it is due, and what clears it. A cue with no deadline is not timing. */
const CUES: readonly { id: string; until: (state: GameEngineState) => number | null; expire: (engine: GameEngine) => void }[] = [
  { id: "launchCelebration", until: (s) => s.effects.launchCelebrationUntil, expire: (e) => e.dispatch(engineActions.clearLaunchCelebration()) },
  { id: "spendPulse", until: (s) => s.effects.spendPulse?.until ?? null, expire: (e) => e.dispatch(engineActions.clearSpendPulse()) },
  { id: "unlockSuccess", until: (s) => s.effects.unlockSuccess?.until ?? null, expire: (e) => e.dispatch(engineActions.clearUnlockSuccess()) },
  // A timed tutorial step waits while play is paused; resuming shifts its deadline.
  { id: "tutorialStep", until: (s) => (s.player.isPaused ? null : s.gameplay.tutorial.actionUntil), expire: (e) => e.actions.tick(Date.now()) },
];

/**
 * Clears transient cues (launch celebration, spend pulse, unlock success) and completes timed tutorial
 * steps when they are due. The deadlines live in engine state; a timer set holds one timer per cue and a
 * single timeout wakes at the soonest, so an idle world schedules nothing.
 */
export function useEngineEphemeralTimers(engine: GameEngine): void {
  const timers = useMemo(() => createTimerSet(), [engine]);

  useEffect(() => {
    const deadlines = new Map<string, number>();
    let wake: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (wake !== null) clearTimeout(wake);
      wake = null;
      let soonest = Number.POSITIVE_INFINITY;
      for (const timer of timers.list()) if (timer.running) soonest = Math.min(soonest, timer.remainingMs);
      if (soonest !== Number.POSITIVE_INFINITY) wake = setTimeout(fire, soonest);
    };
    const fire = () => {
      for (const id of timers.poll()) {
        timers.remove(id);
        deadlines.delete(id);
        CUES.find((cue) => cue.id === id)?.expire(engine);
      }
      schedule();
    };
    const sync = () => {
      const state = engine.getState();
      for (const cue of CUES) {
        const until = cue.until(state);
        if (until === deadlines.get(cue.id)) continue;
        if (until === null) {
          timers.remove(cue.id);
          deadlines.delete(cue.id);
        } else {
          timers.start(cue.id, { durationMs: until - Date.now() });
          deadlines.set(cue.id, until);
        }
      }
      fire();
    };

    sync();
    const unsubscribe = engine.subscribe(sync);
    return () => {
      unsubscribe();
      if (wake !== null) clearTimeout(wake);
      for (const id of timers.ids()) timers.remove(id);
    };
  }, [engine, timers]);
}
