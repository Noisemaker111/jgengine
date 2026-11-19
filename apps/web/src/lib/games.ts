import { GAME_CREDITS, GAME_IDS, GAME_META, GAME_PARTS, GAME_SEEDS, GAME_THUMBS } from "virtual:jgengine-games";

import { DEMO_PARTS, type DemoKey } from "../live/demoParts";

export { GAME_IDS };

export interface GameCredit {
  readonly text: string;
  readonly url?: string;
  readonly handle?: string;
}

export function gameCredit(id: string): GameCredit | null {
  return GAME_CREDITS[id] ?? null;
}

export function gameTitle(id: string): string {
  return (
    GAME_META[id]?.title ??
    id
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

export function gameBlurb(id: string): string | null {
  return GAME_META[id]?.blurb ?? null;
}

export function gameCover(id: string): string | null {
  return GAME_THUMBS.includes(id) ? `/covers/${id}.webp` : null;
}

export function isGameId(id: string): boolean {
  return GAME_IDS.includes(id);
}

/** The one-line idea the game was first generated from, or null when it was designed by hand. */
export function gameSeed(id: string): string | null {
  return GAME_SEEDS[id] ?? null;
}

export function gameParts(id: string): readonly DemoKey[] {
  const used = GAME_PARTS[id] ?? [];
  return DEMO_PARTS.filter((part) => used.includes(part.key)).map((part) => part.key);
}

export const SEEDED_GAME_COUNT = GAME_IDS.filter((id) => GAME_SEEDS[id] !== undefined).length;
