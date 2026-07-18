/**
 * Runner entry: pick one of the four app roots from the URL and mount it.
 * All discovery, capture protocol, and per-mode UI live in sibling modules —
 * this file is only the router. `./appEnv` runs the boot-time installs on
 * import, so it must come first.
 */
import { createRoot } from "react-dom/client";

import { EDITOR_STANDALONE, GAME_ID, PREVIEW } from "./appEnv";
import { DevApp } from "./DevApp";
import { GamePicker } from "./GamePicker";
import { PreviewApp } from "./PreviewApp";
import { StandaloneEditorApp } from "./StandaloneEditorApp";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  EDITOR_STANDALONE ? (
    <StandaloneEditorApp />
  ) : PREVIEW !== null && GAME_ID !== null ? (
    <PreviewApp gameId={GAME_ID} stateKey={PREVIEW} />
  ) : GAME_ID === null ? (
    <GamePicker />
  ) : (
    <DevApp gameId={GAME_ID} />
  ),
);
