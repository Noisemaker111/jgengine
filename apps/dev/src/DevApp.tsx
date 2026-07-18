import { useEffect, useState } from "react";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { GamePlayerShell } from "@jgengine/shell/GamePlayerShell";
import { GameUiPreview, type UiPreviewScenario } from "@jgengine/shell/GameUiPreview";
import { resolveConvexMultiplayer } from "@jgengine/convex/resolveConvexMultiplayer";
import {
  resolvePeerShellMultiplayer,
  resolveShellMultiplayer,
  type ShellMultiplayer,
} from "@jgengine/shell/multiplayer";
import type { PlayableGame } from "@jgengine/shell/registry";

import { CONVEX_URL, MODE, P2P_ROLE, RUN, STAGE, STATE_PARAM, WS_URL } from "./appEnv";
import { ErrorPanel, LoadingPanel, formatLoadError } from "./appShared";
import {
  armCaptureReady,
  captureArmed,
  createCaptureContextReady,
  resolveCaptureRun,
  setCaptureStatus,
} from "./captureReady";
import { EditorModeApp } from "./EditorModeApp";
import { useEditorSummon, useRuntimeError } from "./hooks";
import { discoverGameTunables, gameRegistry, loadGameStyle, uiScenarioRegistry, withCameraPreset } from "./registries";

export function DevApp({ gameId }: { gameId: string }) {
  const [playable, setPlayable] = useState<PlayableGame | null>(null);
  const [multiplayer, setMultiplayer] = useState<ShellMultiplayer | null>(null);
  const [scenario, setScenario] = useState<UiPreviewScenario | undefined>(undefined);
  const [scenarioPending, setScenarioPending] = useState(STAGE && MODE !== "ui" && MODE !== "editor");
  const [loadError, setLoadError] = useState<string | null>(null);
  const editorSummoned = useEditorSummon(MODE);
  const runtimeError = useRuntimeError();
  useEffect(() => {
    if (MODE === "play" && playable === null && captureArmed()) {
      setCaptureStatus("preparing");
      return;
    }
    return armCaptureReady(MODE, playable?.capture?.settleMs);
  }, [playable]);
  useEffect(() => {
    if (!captureArmed()) return;
    if (loadError !== null) setCaptureStatus("error", loadError);
    else if (runtimeError !== null) setCaptureStatus("error", runtimeError);
  }, [loadError, runtimeError]);
  useEffect(() => {
    const load = gameRegistry[gameId];
    if (load === undefined) {
      setLoadError(`Unknown game "${gameId}" — known ids: ${Object.keys(gameRegistry).sort().join(", ")}`);
      return;
    }
    void load()
      .then(async (loaded) => {
        await loadGameStyle(gameId);
        await discoverGameTunables(gameId, loaded.game.name);
        if (MODE === "poster" || MODE === "editor") {
          setMultiplayer(null);
        } else if (P2P_ROLE === "host" || P2P_ROLE === "join") {
          void resolvePeerShellMultiplayer({ gameId, role: P2P_ROLE }).then(setMultiplayer);
        } else {
          setMultiplayer(
            resolveConvexMultiplayer({
              game: loaded.game,
              gameId,
              url: CONVEX_URL,
              force: CONVEX_URL !== undefined,
            }) ??
              resolveShellMultiplayer({
                game: loaded.game,
                gameId,
                url: WS_URL,
                force: WS_URL !== undefined,
              }),
          );
        }
        setPlayable(withCameraPreset(loaded));
      })
      .catch((error: unknown) => {
        const message = formatLoadError(error);
        console.error(`[jgengine/play] failed to load ${gameId}`, error);
        setLoadError(message);
      });
    const loadScenario = uiScenarioRegistry[gameId];
    if ((MODE === "ui" || STAGE) && loadScenario !== undefined) {
      void loadScenario()
        .then((resolved) => {
          setScenario(() => resolved);
          setScenarioPending(false);
        })
        .catch((error: unknown) => {
          console.error(`[jgengine/play] failed to load ui scenario ${gameId}`, error);
          setScenarioPending(false);
        });
    } else {
      setScenarioPending(false);
    }
  }, [gameId]);
  if (loadError !== null) {
    return <ErrorPanel title={`Failed to load ${gameId}`} detail={loadError} />;
  }
  if (runtimeError !== null) {
    return <ErrorPanel title={`Runtime error in ${gameId}`} detail={runtimeError} />;
  }
  if (playable === null) return <LoadingPanel label="Loading game…" />;
  if (MODE === "ui") return <GameUiPreview playable={playable} scenario={scenario} />;
  if (MODE === "poster") return <GamePlayerShell playable={playable} poster />;
  if (MODE === "editor" || editorSummoned) return <EditorModeApp gameId={gameId} playable={playable} />;
  if (scenarioPending) return <LoadingPanel label="Staging scenario…" />;
  const stageScenario =
    STAGE && scenario !== undefined ? (ctx: GameContext) => scenario(ctx, playable) : undefined;
  const { captureRun, error: captureRunError } = resolveCaptureRun({
    capture: playable.capture,
    stateParam: STATE_PARAM,
    run: RUN,
    mode: MODE,
    gameId,
  });
  if (captureRunError !== null && captureArmed()) setCaptureStatus("error", captureRunError);
  const onContextReady = createCaptureContextReady({
    captureRun,
    probe: playable.capture?.probe,
    stageScenario,
    gameId,
  });
  return <GamePlayerShell playable={playable} multiplayer={multiplayer} onContextReady={onContextReady} />;
}
