/** @jsxImportSource @jgengine/core/ui/jsx */
import { createRoot } from "@jgengine/core/ui/jsx/client.view";
import { GameHost } from "@jgengine/shell/GameHost";
import { game } from "./game.config";

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
createRoot(root).render(<GameHost playable={game} gameId="beacon-bastion" editor={() => import("@jgengine/editor")} />);
