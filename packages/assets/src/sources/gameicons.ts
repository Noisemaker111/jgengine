import type { AssetSource } from "../manifest";

/**
 * game-icons.net (https://game-icons.net) — ~4,000 CC BY 3.0 SVG item/ability
 * icons from 40+ contributing artists, mirrored as one GitHub repo
 * (github.com/game-icons/icons). `HEAD` resolves the default branch without
 * pinning a name or commit, so this always mirrors the current set; the
 * per-artist `license.txt` files inside the repo carry the individual
 * credits behind this pack's single collective `author` field.
 */
export const gameiconsSources: readonly AssetSource[] = [
  {
    id: "gameicons-icons",
    kind: "sprite",
    provider: "gameicons",
    title: "Game-Icons.net — Icon Library",
    license: "CC BY 3.0",
    author: "game-icons.net contributors (Lorc, Delapouite, and 40+ others — see homepage for per-icon credit)",
    categories: ["icon", "item", "ability", "ui"],
    download: { url: "https://codeload.github.com/game-icons/icons/zip/HEAD" },
    homepage: "https://game-icons.net",
  },
];
