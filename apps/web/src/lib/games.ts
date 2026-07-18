import { GAME_CREDITS, GAME_IDS } from "virtual:jgengine-games";

export { GAME_IDS };

/** Attribution for a game, sourced from its own `export const credit` in game.config.ts. */
export interface GameCredit {
  readonly text: string;
  readonly url?: string;
  readonly handle?: string;
}

/** The game's authored attribution, or `null` when it declares none. */
export function gameCredit(id: string): GameCredit | null {
  return GAME_CREDITS[id] ?? null;
}

/** "the-robots" → "The Robots" — display fallback; the game's own menu shows its real title. */
export function gameTitle(id: string): string {
  return id
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function isGameId(id: string): boolean {
  return GAME_IDS.includes(id);
}
