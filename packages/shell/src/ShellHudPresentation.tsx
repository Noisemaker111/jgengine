import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";

import type { PointerAxisState } from "@jgengine/core/input/pointerAxis";
import type { ActionStateTracker } from "@jgengine/core/input/actionBindings";
import { playControlsActive } from "@jgengine/core/game/controlGate";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { GameViewportProvider } from "@jgengine/react/gameViewport";
import type { TouchScheme } from "@jgengine/core/input/touchScheme";

import { HudOnlyDriver } from "./drivers/HudOnlyDriver";
import type { RuntimeDiagnostic } from "./diagnostics/RuntimeDiagnostics";
import type { ShellMultiplayer } from "./multiplayer";
import type { PlayableGame } from "./registry";
import { createShellKeyHandlers, ShellDebugOverlays, ShellGameUiChrome } from "./ShellChrome";
import { TouchPlaySurface } from "./touch/TouchControlsOverlay";

export function ShellHudPresentation({
  playable,
  ctx,
  multiplayer,
  tracker,
  pointerAxisRef,
  gateRef,
  wrapperRef,
  f2HeldRef,
  yawRef,
  pitchRef,
  touchScheme,
  touchSink,
  orientationGate,
  orientationGateEl,
  coarsePointer,
  uiScale,
  diagnostics,
  devtoolsEnabled,
  devtoolsOpen,
  setDevtoolsOpen,
  reportRuntimeError,
  trackPointerAxis,
  deactivatePointerAxis,
  onPointerResumeAudio,
}: {
  playable: PlayableGame;
  ctx: GameContext;
  multiplayer: ShellMultiplayer | null;
  tracker: ActionStateTracker<string>;
  pointerAxisRef: MutableRefObject<PointerAxisState | null>;
  gateRef: MutableRefObject<boolean>;
  wrapperRef: RefObject<HTMLDivElement | null>;
  f2HeldRef: MutableRefObject<boolean>;
  yawRef: MutableRefObject<number>;
  pitchRef: MutableRefObject<number>;
  touchScheme: TouchScheme | null;
  touchSink: { onCodeDown: (code: string) => void; onCodeUp: (code: string) => void };
  orientationGate: boolean;
  orientationGateEl: React.ReactNode;
  coarsePointer: boolean;
  uiScale: number;
  diagnostics: RuntimeDiagnostic[];
  devtoolsEnabled: boolean;
  devtoolsOpen: boolean;
  setDevtoolsOpen: Dispatch<SetStateAction<boolean>>;
  reportRuntimeError: (error: unknown, phase: string, componentStack?: string) => void;
  trackPointerAxis: (event: { clientX: number; clientY: number }) => void;
  deactivatePointerAxis: () => void;
  onPointerResumeAudio: () => void;
}) {
  const GameUI = playable.GameUI;
  const keys = createShellKeyHandlers({
    f2HeldRef,
    tracker,
    devtoolsEnabled,
    setDevtoolsOpen,
    controlsActive: () => playControlsActive(ctx),
  });

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      className="relative h-full w-full bg-neutral-950 outline-none"
      onKeyDown={keys.onKeyDown}
      onKeyUp={keys.onKeyUp}
      onBlur={keys.onBlur}
      onPointerDown={onPointerResumeAudio}
      onPointerMove={trackPointerAxis}
      onPointerLeave={deactivatePointerAxis}
      onPointerCancel={deactivatePointerAxis}
    >
      <GameViewportProvider platforms={playable.platforms}>
        <HudOnlyDriver
          ctx={ctx}
          playable={playable}
          tracker={tracker}
          pointerAxisRef={pointerAxisRef}
          gateRef={gateRef}
          onRuntimeError={reportRuntimeError}
        />
        {!orientationGate &&
        coarsePointer &&
        touchScheme !== null &&
        touchScheme.gestures !== null &&
        playControlsActive(ctx) ? (
          <TouchPlaySurface
            scheme={touchScheme}
            sink={touchSink}
            yawRef={yawRef}
            pitchRef={pitchRef}
            maxPitch={0}
            onPrimaryTap={() => undefined}
          />
        ) : null}
        <ShellGameUiChrome
          ctx={ctx}
          playable={playable}
          GameUI={GameUI}
          uiScale={uiScale}
          orientationGate={orientationGate}
          onRuntimeError={reportRuntimeError}
        />
        {orientationGateEl}
        <ShellDebugOverlays
          ctx={ctx}
          playable={playable}
          multiplayer={multiplayer}
          diagnostics={diagnostics}
          devtoolsEnabled={devtoolsEnabled}
          devtoolsOpen={devtoolsOpen}
        />
      </GameViewportProvider>
    </div>
  );
}
