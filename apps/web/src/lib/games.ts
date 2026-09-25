import { GAME_CREDITS, GAME_IDS, GAME_META, GAME_THUMBS } from "virtual:jgengine-games";

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

/** The README title, else "the-robots" → "The Robots". */
export function gameTitle(id: string): string {
  return (
    GAME_META[id]?.title ??
    id
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

/** One-line description from the games repo README, or null. */
export function gameBlurb(id: string): string | null {
  return GAME_META[id]?.blurb ?? null;
}

/** Public path of the committed cover screenshot, or null. */
export function gameCover(id: string): string | null {
  return GAME_THUMBS.includes(id) ? `/covers/${id}.webp` : null;
}

export function isGameId(id: string): boolean {
  return GAME_IDS.includes(id);
}
