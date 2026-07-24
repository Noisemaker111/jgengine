import "./index.css";

import { createRoot } from "react-dom/client";

import { GameHost } from "@jgengine/shell/gameKit";

import { game } from "./game.config";

const root = document.getElementById("root");
if (root === null) throw new Error("main: missing #root mount element");
createRoot(root).render(
  <GameHost playable={game} gameId="tower-guard" editor={() => import("@jgengine/editor")} />,
);
