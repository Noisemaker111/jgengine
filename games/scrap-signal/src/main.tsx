import { createRoot } from "@jgengine/core/ui/jsx/client.view";
import { GameHost } from "@jgengine/shell/GameHost";
import { game } from "./game.config";
import "./index.css";

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
createRoot(root).render(<GameHost playable={game} gameId="scrap-signal" editor={() => import("@jgengine/editor")} />);
