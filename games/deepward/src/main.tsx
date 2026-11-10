/** @jsxImportSource @jgengine/core/ui/jsx */
import "./style.css";
import { createRoot } from "@jgengine/core/ui/jsx/client.view";
import { GameHost } from "@jgengine/shell/GameHost";
import { game } from "./game";

const root = document.getElementById("root");
if (root === null) throw new Error("Deepward: missing #root");
createRoot(root).render(<GameHost playable={game} gameId="deepward" editor={() => import("@jgengine/editor")} />);
