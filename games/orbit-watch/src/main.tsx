import "./index.css";

import { createRoot } from "react-dom/client";

import { GameHost } from "@jgengine/shell/gameKit";

import { game } from "./game.config";
import { idea } from "./game/idea";

const root = document.getElementById("root");
if (root === null) throw new Error("main: missing #root mount element");
createRoot(root).render(<GameHost playable={game} gameId={idea.id} editor={() => import("@jgengine/editor")} />);
