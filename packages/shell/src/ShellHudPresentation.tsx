import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";

import type { PointerAxisState } from "@jgengine/core/input/pointerAxis";
import type { ActionStateTracker } from "@jgengine/core/input/actionBindings";
import { playControlsActive } from "@jgengine/core/game/controlGate";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { BindingOverrides } from "@jgengine/core/input/bindingOverrides";
import { BUILT_IN_SETTING_CATEGORIES, type GameSettingsConfig, type SettingsStore } from "@jgengine/core/settings/settingsModel";
import { SettingsProvider, type SettingsActionView } from "@jgengine/react/settings";
import { GameViewportProvider } from "@jgengine/react/gameViewport";
import type { TouchScheme } from "@jgengine/core/input/touchScheme";

import { HudOnlyDriver } from "./drivers/HudOnlyDriver";
import type { RuntimeDiagnostic } from "./diagnostics/RuntimeDiagnostics";
import type { ShellMultiplayer } from "./multiplayer";
import type { PlayableGame } from "./registry";
import { createShellKeyHandlers, ShellDebugOverlays, ShellGameUiChrome } from "./ShellChrome";
import type { AudioEngine } from "./audio/audioEngine";
import { AudioSettingsBridge } from "./settings/appliedSettings";
import { SettingsRuntime } from "./settings/SettingsRuntime";
import { SettingsChrome } from "./settings/SettingsChrome";
import { TouchPlaySurface } from "./touch/TouchControlsOverlay";

/**
 * Marks a HUD-only page ready for capture (`data-jg-capture="ready"`) unless a capture host already
 * owns the flag. A HUD game has no `<canvas>`, so capture tools that wait for one would time out.
 * @internal
 */
export function markHudCaptureReady(root: { dataset: DOMStringMap }): void {
  if (root.dataset.jgCapture === undefined) root.dataset.jgCapture = "ready";
}

/** HUD-only play surface for non-3D shells. @internal */
export function ShellHudPresentation({
  playable,
  ctx,
  multiplayer,
  serverIdRef,
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
  settingsStore,
  bindingOverrides,
  rebindAction,
  resetActionBinding,
  audioEngine,
  poster,
}: {
  playable: PlayableGame;
  ctx: GameContext;
  multiplayer: ShellMultiplayer | null;
  serverIdRef: MutableRefObject<string | null>;
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
  settingsStore: SettingsStore;
  bindingOverrides: BindingOverrides;
  rebindAction: (action: string, code: string) => void;
  resetActionBinding: (action: string) => void;
  audioEngine: AudioEngine;
  poster: boolean;
}) {
  const GameUI = playable.GameUI;
  useEffect(() => {
    // Two frames so the first GameUI paint has landed before tools capture.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => markHudCaptureReady(document.documentElement));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);
  const keys = createShellKeyHandlers({
    f2HeldRef,
    tracker,
    devtoolsEnabled,
    setDevtoolsOpen,
    controlsActive: () => playControlsActive(ctx),
  });

  const settingsDisabled = playable.settings === false;
  const settingsConfig: GameSettingsConfig = playable.settings === false || playable.settings === undefined ? {} : playable.settings;
  const settingsActions: SettingsActionView[] = (settingsConfig.actions ?? []).map((action) => ({
    id: action.id,
    label: action.label,
    kind: action.kind ?? "default",
    description: action.description,
    run: () => action.run(ctx),
  }));

  return (
    <SettingsProvider store={settingsStore}>
      <AudioSettingsBridge store={settingsStore} engine={audioEngine} buses={playable.audio?.buses} />
      <SettingsRuntime
        variant={settingsConfig.variant ?? "panel"}
        surface={settingsDisabled ? false : settingsConfig.surface ?? false}
        actions={settingsActions}
        input={playable.game.input ?? {}}
        buses={playable.audio?.buses}
        extra={settingsConfig.extra ?? []}
        categories={settingsConfig.categories ?? []}
        hide={settingsDisabled ? BUILT_IN_SETTING_CATEGORIES : settingsConfig.hide ?? []}
        fovEnabled={false}
        graphics={playable.graphics}
        hideBindings={settingsConfig.hideBindings ?? []}
        touchStyle={coarsePointer && touchScheme !== null && (touchScheme.joystick !== null || touchScheme.buttons.length > 0)}
        overrides={bindingOverrides}
        rebind={rebindAction}
        resetBinding={resetActionBinding}
      >
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
              multiplayer={multiplayer}
              serverIdRef={serverIdRef}
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
            {poster ? null : <SettingsChrome />}
          </GameViewportProvider>
        </div>
      </SettingsRuntime>
    </SettingsProvider>
  );
}
