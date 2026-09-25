declare module "virtual:jgengine-games" {
  /** Directory names under Games/* with a src/index.tsx entry, sorted. */
  export const GAME_IDS: readonly string[];

  /** Per-game attribution parsed from each game's `export const credit`, keyed by game id. */
  export const GAME_CREDITS: Readonly<
    Record<string, { readonly text: string; readonly url?: string; readonly handle?: string }>
  >;

  /** Title + one-line description per game id from the games repo README table. */
  export const GAME_META: Readonly<Record<string, { readonly title: string; readonly blurb: string }>>;

  /** Game ids with a committed `public/covers/<id>.webp` cover. */
  export const GAME_THUMBS: readonly string[];
}
