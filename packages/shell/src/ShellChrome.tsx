import type { ComponentType } from "react";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { HudViewportProvider } from "@jgengine/react/hudViewport";
import { GameProvider } from "@jgengine/react/provider";

import { DevtoolsOverlay } from "./devtools/DevtoolsOverlay";
import {
  DiagnosticOverlay,
  GameUiErrorBoundary,
  type RuntimeDiagnostic,
} from "./diagnostics/RuntimeDiagnostics";
import { GamePhaseStamp } from "./GamePhaseStamp";
import type { ShellMultiplayer } from "./multiplayer";
import type { PlayableGame } from "./registry";

/** Shared GameUI mount: error boundary → GameProvider → phase stamp → HudViewport. */
export function ShellGameUiChrome({
  ctx,
  playable,
  GameUI,
  uiScale,
  orientationGate,
  onRuntimeError,
}: {
  ctx: GameContext;
  playable: PlayableGame;
  GameUI: ComponentType;
  uiScale: number;
  orientationGate: boolean;
  onRuntimeError: (error: unknown, phase: string, componentStack?: string) => void;
}) {
  return (
    <GameUiErrorBoundary onRuntimeError={onRuntimeError}>
      <GameProvider context={ctx}>
        <GamePhaseStamp />
        <HudViewportProvider
          platforms={playable.platforms}
          config={playable.hudFit}
          userScale={uiScale}
        >
          {orientationGate ? null : <GameUI />}
        </HudViewportProvider>
      </GameProvider>
    </GameUiErrorBoundary>
  );
}

/** Devtools + diagnostic overlays shared by HUD and 3D presentation paths. */
export function ShellDebugOverlays({
  ctx,
  playable,
  multiplayer,
  diagnostics,
  devtoolsEnabled,
  devtoolsOpen,
  hideDiagnostics = false,
}: {
  ctx: GameContext;
  playable: PlayableGame;
  multiplayer: ShellMultiplayer | null;
  diagnostics: RuntimeDiagnostic[];
  devtoolsEnabled: boolean;
  devtoolsOpen: boolean;
  hideDiagnostics?: boolean;
}) {
  return (
    <>
      {devtoolsEnabled ? (
        <DevtoolsOverlay open={devtoolsOpen} ctx={ctx} playable={playable} multiplayer={multiplayer} />
      ) : null}
      {hideDiagnostics ? null : (
        <DiagnosticOverlay diagnostics={diagnostics} gameName={playable.game.name} />
      )}
    </>
  );
}

export type ShellKeyHandlers = {
  onKeyDown: (event: { code: string; preventDefault: () => void }) => void;
  onKeyUp: (event: { code: string }) => void;
  onBlur: () => void;
};

/** F2 chord + gameplay action tracker key handlers shared by both presentation paths. */
export function createShellKeyHandlers({
  f2HeldRef,
  tracker,
  devtoolsEnabled,
  setDevtoolsOpen,
  controlsActive,
  exitPointerLockOnDevtools = false,
}: {
  f2HeldRef: { current: boolean };
  tracker: { handleDown: (code: string) => void; handleUp: (code: string) => void; reset: () => void };
  devtoolsEnabled: boolean;
  setDevtoolsOpen: (update: boolean | ((current: boolean) => boolean)) => void;
  controlsActive: () => boolean;
  /** 3D path exits pointer lock when opening devtools. */
  exitPointerLockOnDevtools?: boolean;
}): ShellKeyHandlers {
  return {
    onKeyDown: (event) => {
      if (event.code === "F2") {
        event.preventDefault();
        f2HeldRef.current = true;
        return;
      }
      if (f2HeldRef.current) {
        if (event.code === "KeyD" && devtoolsEnabled) {
          event.preventDefault();
          if (exitPointerLockOnDevtools) document.exitPointerLock?.();
          setDevtoolsOpen((current) => !current);
        }
        return;
      }
      if (event.code === "Tab" || event.code === "Space") event.preventDefault();
      if (controlsActive()) tracker.handleDown(event.code);
    },
    onKeyUp: (event) => {
      if (event.code === "F2") {
        f2HeldRef.current = false;
        return;
      }
      if (controlsActive()) tracker.handleUp(event.code);
    },
    onBlur: () => {
      f2HeldRef.current = false;
      tracker.reset();
    },
  };
}
