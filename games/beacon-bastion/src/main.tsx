import { createRoot } from "react-dom/client";
import { GameHost } from "@jgengine/shell/GameHost";
import { game } from "./game.config";
import "./index.css";

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
createRoot(root).render(<GameHost playable={game} gameId="beacon-bastion" editor={() => import("@jgengine/editor")} />);
