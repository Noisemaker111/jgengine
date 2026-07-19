import { defineGame, defineSystem } from "@jgengine/shell/gameKit";
import { hazardCycleAt, type HazardCycleConfig } from "@jgengine/core/combat/telegraph";

// The joint: one authored hazard config drives BOTH the fairness contract (when it
// actually hits) and the tell (how full the windup bar is). Sample it each tick from
// the same config the HUD reads — no duplicated timers.
const slam: HazardCycleConfig = { windupMs: 1200, activeMs: 400, cooldownMs: 2000 };

let elapsedMs = 0;
const boss = defineSystem({
  id: "boss",
  tick: { type: "frame" },
  update(_ctx, dt) {
    elapsedMs += dt * 1000;
    const sample = hazardCycleAt(slam, elapsedMs);
    // sample.phase: "windup" | "active" | "cooldown"; during windup sample.fraction (0..1)
    // is the telegraph decal fill the HUD draws. Apply the hit only while it is active.
    if (sample.phase === "active") {
      // deal the slam's damage this frame
    }
  },
});

export const game = defineGame({ name: "Boss", systems: [boss] });
// <GameHost playable={game} />  ·  HUD windup fill = hazardCycleAt(slam, nowMs).fraction while phase === "windup"
