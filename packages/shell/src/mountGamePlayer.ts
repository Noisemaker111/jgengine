import { createElement } from "@jgengine/core/ui/jsx";
import { createRoot } from "@jgengine/core/ui/jsx/client.view";

import { GamePlayer, type GamePlayerProps } from "./GamePlayer";

/** What a host page passes to {@link mountGamePlayer}. */
export interface MountGamePlayerOptions extends Omit<GamePlayerProps, "loading"> {
  /** Shown, centred, while the game's code loads. */
  loadingText?: string;
}

/**
 * Run a game inside any page: mounts the registry-driven player into `container` and returns the
 * function that takes it down. This is how a host written in another UI library (a React, Next or
 * TanStack app, a plain page) embeds the engine: give it an element and call this from the host's
 * own mount hook. Call it again with new options after unmounting to switch games.
 *
 * ```ts
 * useEffect(() => mountGamePlayer(ref.current, { gameId: "deepward", registry }), []);
 * ```
 *
 * @capability host-mount run a game inside a page built with any UI library by mounting the player into an element
 */
export function mountGamePlayer(container: Element, options: MountGamePlayerOptions): () => void {
  const { loadingText, ...player } = options;
  const loading =
    loadingText === undefined
      ? null
      : createElement(
          "div",
          { style: { display: "flex", height: "100%", alignItems: "center", justifyContent: "center", background: "#0a0a0a", color: "#999", fontSize: "0.875rem" } },
          loadingText,
        );
  const root = createRoot(container);
  root.render(createElement(GamePlayer, { ...player, loading }));
  return () => root.unmount();
}
