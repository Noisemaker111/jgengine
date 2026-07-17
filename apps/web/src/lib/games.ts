import { GAME_IDS } from "virtual:jgengine-games";

export { GAME_IDS };

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
