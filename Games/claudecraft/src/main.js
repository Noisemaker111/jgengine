import { jsx as _jsx } from "react/jsx-runtime";
import "./index.css";
import { createRoot } from "react-dom/client";
import { GameHost } from "@jgengine/shell/GameHost";
import { game } from "./game.config";
const root = document.getElementById("root");
if (root === null)
    throw new Error("main: missing #root mount element");
createRoot(root).render(_jsx(GameHost, { playable: game }));
