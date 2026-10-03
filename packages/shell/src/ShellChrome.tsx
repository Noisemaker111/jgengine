import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { HudViewportProvider } from "@jgengine/react/hudViewport";
import { GameProvider } from "@jgengine/react/provider";

import {
  DiagnosticOverlay,
  GameUiErrorBoundary,
  type RuntimeDiagnostic,
} from "./diagnostics/RuntimeDiagnostics";
import { DevtoolsRuntime } from "./devtools/DevtoolsRuntime";
import { GamePhaseStamp } from "./GamePhaseStamp";
import { SettingsPlayControlGate } from "./settings/SettingsRuntime";
import type { ShellMultiplayer } from "./multiplayer";
import type { PlayableGame } from "./registry";

const DevtoolsOverlay = lazy(() =>
  import("./devtools/DevtoolsOverlay").then((module) => ({ default: module.DevtoolsOverlay })),
);

/** Shared GameUI mount: error boundary → GameProvider → phase stamp → HudViewport. @internal */
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
        <SettingsPlayControlGate ctx={ctx} />
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

/** Devtools + diagnostic overlays shared by HUD and 3D presentation paths. @internal */
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
  const [openedOnce, setOpenedOnce] = useState(false);
  useEffect(() => { if (devtoolsOpen) setOpenedOnce(true); }, [devtoolsOpen]);
  return (
    <>
      {devtoolsEnabled ? <DevtoolsRuntime ctx={ctx} playable={playable} /> : null}
      {devtoolsEnabled && (devtoolsOpen || openedOnce) ? (
        <Suspense fallback={devtoolsOpen ? <div role="status" style={{ position: "absolute", right: 16, top: 16, zIndex: 90, color: "#e2e8f0", background: "#0f172a", padding: "10px 14px", borderRadius: 8 }}>Loading developer tools…</div> : null}>
          <DevtoolsOverlay open={devtoolsOpen} ctx={ctx} playable={playable} multiplayer={multiplayer} />
        </Suspense>
      ) : null}
      {hideDiagnostics ? null : (
        <DiagnosticOverlay diagnostics={diagnostics} gameName={playable.game.name} />
      )}
    </>
  );
}

/** Key handler bundle shared by HUD and 3D presentation paths. @internal */
export type ShellKeyHandlers = {
  onKeyDown: (event: { code: string; target?: EventTarget | null; defaultPrevented?: boolean; preventDefault: () => void }) => void;
  onKeyUp: (event: { code: string; target?: EventTarget | null }) => void;
  onBlur: () => void;
};

/** F2 chord + gameplay action tracker key handlers shared by both presentation paths. @internal */
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
      if (event.defaultPrevented) {
        f2HeldRef.current = false;
        tracker.reset();
        return;
      }
      const target = event.target as HTMLElement | null | undefined;
      if (target?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable=false])")) {
        f2HeldRef.current = false;
        tracker.reset();
        return;
      }
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
      if (target?.closest?.('button, a[href], [role="button"], [role="link"], [role="dialog"], [role="menu"], [role="listbox"], [role="grid"], [role="gridcell"], [role="toolbar"]')) {
        tracker.reset();
        return;
      }
      if (controlsActive()) {
        if (event.code === "Tab" || event.code === "Space") event.preventDefault();
        tracker.handleDown(event.code);
      }
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
