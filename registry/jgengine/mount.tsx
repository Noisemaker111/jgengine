/** @jsxImportSource @jgengine/core/ui/jsx */
import { createRoot } from "@jgengine/core/ui/jsx/client.view";

import { GameHost } from "@jgengine/core/shell/GameHost.draw";
import type { PlayableGame } from "@jgengine/core/shell/registry.draw";

export function mountGame(game: PlayableGame): void {
  const root = document.getElementById("root");
  if (root === null) throw new Error("mountGame: missing #root mount element");
  createRoot(root).render(<GameHost playable={game} />);
}
