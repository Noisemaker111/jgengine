import "./style.css";
import { createRoot } from "react-dom/client";
import { GameHost } from "@jgengine/shell/GameHost";
import { game } from "./game";

const root = document.getElementById("root");
if (root === null) throw new Error("Deepward: missing #root");
createRoot(root).render(<GameHost playable={game} gameId="deepward" editor={() => import("@jgengine/editor")} />);
