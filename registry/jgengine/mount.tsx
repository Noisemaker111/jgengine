import { createRoot } from "react-dom/client";

import { GameHost } from "@jgengine/shell/GameHost";
import type { PlayableGame } from "@jgengine/shell/registry";

export function mountGame(game: PlayableGame): void {
  const root = document.getElementById("root");
  if (root === null) throw new Error("mountGame: missing #root mount element");
  createRoot(root).render(<GameHost playable={game} />);
}
