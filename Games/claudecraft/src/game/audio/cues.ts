import type { GameContext } from "@jgengine/core/runtime/gameContext";

/** Fire a non-positional SFX cue by id. */
export function cue(ctx: GameContext, id: string): void {
  ctx.game.audio.play(id);
}

/** Map an ability school to its cast/impact SFX id. */
export function schoolCue(school: string): string {
  switch (school) {
    case "fire":
    case "nature":
      return "fire";
    case "frost":
    case "ice":
      return "frost";
    case "physical":
      return "melee_hit";
    default:
      return "arcane";
  }
}
