/**
 * Runner entry: pick one of the app roots from the URL and mount it. Each root is its own chunk,
 * so a game page downloads and parses the game runner only, not the picker, fixtures, previews
 * or the standalone editor. `./appEnv` runs the boot-time installs on import, so it must come
 * first.
 */
import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";

import { EDITOR_STANDALONE, FIXTURE, GAME_ID, PREVIEW } from "./appEnv";
import "./index.css";

const DevApp = lazy(() => import("./DevApp").then((module) => ({ default: module.DevApp })));
const FixturesApp = lazy(() => import("./FixturesApp").then((module) => ({ default: module.FixturesApp })));
const GamePicker = lazy(() => import("./GamePicker").then((module) => ({ default: module.GamePicker })));
const PreviewApp = lazy(() => import("./PreviewApp").then((module) => ({ default: module.PreviewApp })));
const StandaloneEditorApp = lazy(() => import("./StandaloneEditorApp").then((module) => ({ default: module.StandaloneEditorApp })));

createRoot(document.getElementById("root")!).render(
  <Suspense fallback={null}>
    {EDITOR_STANDALONE ? (
      <StandaloneEditorApp />
    ) : FIXTURE !== null ? (
      <FixturesApp name={FIXTURE} />
    ) : PREVIEW !== null && GAME_ID !== null ? (
      <PreviewApp gameId={GAME_ID} stateKey={PREVIEW} />
    ) : GAME_ID === null ? (
      <GamePicker />
    ) : (
      <DevApp gameId={GAME_ID} />
    )}
  </Suspense>,
);
