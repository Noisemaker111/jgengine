declare module "virtual:jgengine-game-public" {
  import type { PrefetchItem } from "@jgengine/core/boot/prefetchTier";

  /** The folder under the runner's base that serves each game's own files (`games`). */
  export const GAME_PUBLIC_FOLDER: string;
  /**
   * Per game, one lazy chunk: its own `public/` files as root-absolute paths (`/models/a.glb`), and
   * the files it names, near ones first, to fetch the moment it opens.
   */
  export const gamePublic: Record<string, () => Promise<{ files: readonly string[]; prefetch: readonly PrefetchItem[] }>>;
}
