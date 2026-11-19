import { createElement } from "@jgengine/core/ui/jsx";
import { createRoot } from "@jgengine/core/ui/jsx/client.view";

import { GamePlayer, type GamePlayerProps } from "./GamePlayer";

export interface MountGamePlayerOptions extends Omit<GamePlayerProps, "loading"> {
  loadingText?: string;
}

/** @capability host-mount run a game inside a page built with any UI library by mounting the player into an element */
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
