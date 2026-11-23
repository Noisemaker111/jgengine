import type { GameContext } from "@jgengine/core/runtime/gameContext";
import {
  broodView,
  obeliskPrompts,
} from "../broodmother";
import {
  BROOD_PHASES,
} from "../data/bosses";
import type { ProbeFrame } from "./frame";

/** What proofs and flows read about broodmother: its part of the capture probe. */
export function broodmotherProbe(ctx: GameContext, { sight }: ProbeFrame) {
  const brood = broodView(ctx);
  return {
    // The Broodmother: 0 nothing summoned, 1 the portal counting down, 2 the fight, 3 won and waiting to go back;
    // 1 while the survivor is in her lair; her health and phase (1-3) and her Araneo alive; 1 while webbed;
    // the tames in the fight with the survivor; 1 at the obelisk's terminal.
    brood: ["idle", "portal", "fight", "victory"].indexOf(brood.phase),
    inLair: brood.inside ? 1 : 0,
    broodHealth: brood.boss === null ? -1 : Math.round(brood.boss.health * 1000) / 10,
    broodPhase: brood.boss?.phase === null || brood.boss === null ? 0 : BROOD_PHASES.findIndex((phase) => phase.id === brood.boss!.phase) + 1,
    araneo: brood.brood,
    // Where she stands, and 1 while her phase tell is on screen.
    ...sight("brood", brood.boss?.at ?? null),
    broodTell: brood.tell === null ? 0 : 1,
    lairTames: brood.companions,
    atObelisk: obeliskPrompts(ctx).length > 0 ? 1 : 0,
  };
}
