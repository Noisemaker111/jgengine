declare module "virtual:jgengine-games" {
  /** Directory names under Games/* with a src/index.tsx entry, sorted. */
  export const GAME_IDS: readonly string[];

  /** Per-game attribution parsed from each game's `export const credit`, keyed by game id. */
  export const GAME_CREDITS: Readonly<
    Record<string, { readonly text: string; readonly url?: string; readonly handle?: string }>
  >;
}
