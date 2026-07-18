import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  createActionStateTracker,
  toActionStateBindingMap,
} from "@jgengine/core/input/actionBindings";
import { RESERVED_INPUT_ACTIONS } from "./boundActionDispatch";
import { deriveTouchScheme, withTouchCodes, DEFAULT_TOUCH_STYLE } from "@jgengine/core/input/touchScheme";
import { normalizePointerToAxis, type PointerAxisState } from "@jgengine/core/input/pointerAxis";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import type { PresencePoseRow } from "@jgengine/core/runtime/transport";
import { useDisplayProfile } from "@jgengine/react/display";
import { RotateDeviceScreen } from "@jgengine/react/rotateDevice";
import { createSettingsStore } from "@jgengine/core/settings/settingsModel";
import {
  applyBindingOverrides,
  clearBindingOverride,
  loadBindingOverrides,
  saveBindingOverride,
  type BindingOverrides,
} from "@jgengine/core/input/bindingOverrides";
import {
  orientationGateActive,
  orientationHintActive,
  resolveOrientationRequirement,
  type LayoutOrientation,
} from "@jgengine/core/ui/orientation";
import { armFallbackSeams } from "@jgengine/core/devtools/fallbackSeams";

import { createAudioEngine } from "./audio/audioEngine";
import { attachAudioEventWire } from "./audio/audioWire";
import { installAgentBridge } from "./devtools/agentBridge";
import { withDevtoolsLatency } from "./devtools/DevtoolsOverlay";
import { resolveRigKind } from "./camera";
import { contextModels } from "./render/resolveModel";
import type { ShellMultiplayer } from "./multiplayer";
import type { PlayableGame } from "./registry";
import { OrientationHint } from "./touch/OrientationHint";
import { useTouchStyle, useGraphicsSettings } from "./settings/appliedSettings";
import {
  logRuntimeError,
  type RuntimeDiagnostic,
} from "./diagnostics/RuntimeDiagnostics";
import { EMPTY_RESERVED } from "./shellConstants";
import { useShellMultiplayerSync } from "./useShellMultiplayerSync";
import { ShellHudPresentation } from "./ShellHudPresentation";
import { Shell3dPresentation } from "./Shell3dPresentation";

const DEV_USER_ID = "dev-player";

export { applyMotionImpulses } from "@jgengine/core/runtime/motionIntents";
export { nearbyObstacles } from "@jgengine/core/movement/movementModel";
export { resolvePhysicsTuning } from "@jgengine/core/movement/playerMovement";
export { hasEnvironmentTerrain } from "@jgengine/core/world/terrain";

/**
 * The shell body `GameHost` renders after resolving multiplayer. Hosts that resolve their own
 * sessions (the dev runner) render it directly; games mount through `GameHost`.
 * @internal
 */
export function GamePlayerShell({
  playable,
  multiplayer: rawMultiplayer = null,
  poster = false,
  onContextReady,
}: {
  playable: PlayableGame;
  multiplayer?: ShellMultiplayer | null;
  poster?: boolean;
  /** Called once per boot after onInit/onNewPlayer with the live GameContext — a staging seam for screenshots, tests, analytics. */
  onContextReady?: (ctx: GameContext) => void;
}) {
  const multiplayer = useMemo(
    () => (rawMultiplayer === null ? null : withDevtoolsLatency(rawMultiplayer)),
    [rawMultiplayer],
  );
  const devtoolsEnabled = playable.devtools !== false && !poster;
  armFallbackSeams(devtoolsEnabled);
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);
  const devtoolsOpenRef = useRef(false);
  devtoolsOpenRef.current = devtoolsOpen;
  useEffect(
    () =>
      installAgentBridge({
        playable,
        devtoolsEnabled,
        isDevtoolsOpen: () => devtoolsOpenRef.current,
        setDevtoolsOpen,
      }),
    [playable, devtoolsEnabled],
  );
  const [posterFrozen, setPosterFrozen] = useState(false);
  const posterSettledRef = useRef(false);
  const [ctx, setCtx] = useState<GameContext | null>(null);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostic[]>([]);
  const [remotePlayers, setRemotePlayers] = useState<PresencePoseRow[]>([]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const serverIdRef = useRef<string | null>(null);
  const cameraDraggingRef = useRef(false);
  const primaryClickRef = useRef(false);
  const pointerAxisRef = useRef<PointerAxisState | null>(null);
  const f2HeldRef = useRef(false);
  const settingsStore = useMemo(() => createSettingsStore(), []);
  const [bindingOverrides, setBindingOverrides] = useState<BindingOverrides>(() =>
    loadBindingOverrides(playable.game.name),
  );
  useEffect(() => {
    setBindingOverrides(loadBindingOverrides(playable.game.name));
  }, [playable]);
  const effectiveInput = useMemo(
    () => applyBindingOverrides(playable.game.input ?? {}, bindingOverrides),
    [playable, bindingOverrides],
  );
  const rebindAction = useCallback(
    (action: string, code: string) => setBindingOverrides(saveBindingOverride(playable.game.name, action, [code])),
    [playable],
  );
  const resetActionBinding = useCallback(
    (action: string) => setBindingOverrides(clearBindingOverride(playable.game.name, action)),
    [playable],
  );
  const tracker = useMemo(
    () => createActionStateTracker(toActionStateBindingMap(withTouchCodes(effectiveInput))),
    [effectiveInput],
  );
  const graphics = useGraphicsSettings(settingsStore, playable.shadows ?? true);
  const trackPointerAxis = (event: { clientX: number; clientY: number }) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect === undefined) return;
    pointerAxisRef.current = normalizePointerToAxis(event.clientX, event.clientY, rect);
  };
  const deactivatePointerAxis = () => {
    const state = pointerAxisRef.current;
    if (state !== null && state.active) pointerAxisRef.current = { ...state, active: false };
  };
  const touchScheme = useMemo(
    () =>
      deriveTouchScheme(playable.game.input, {
        reserved:
          resolveRigKind(playable.camera) === "none" || playable.presentation === "hud"
            ? EMPTY_RESERVED
            : RESERVED_INPUT_ACTIONS,
        firstPerson: resolveRigKind(playable.camera) === "first",
        config: playable.touch,
      }),
    [playable],
  );
  const touchStyle = useTouchStyle(settingsStore, touchScheme?.style ?? DEFAULT_TOUCH_STYLE);
  const { coarsePointer, portrait, compact } = useDisplayProfile();
  const touchSink = useMemo(
    () => ({ onCodeDown: (code: string) => tracker.handleDown(code), onCodeUp: (code: string) => tracker.handleUp(code) }),
    [tracker],
  );
  const gateRef = useRef(false);
  const orientationPlatform = coarsePointer ? "mobile" : "desktop";
  const orientationRequirement = useMemo(
    () => resolveOrientationRequirement(playable.orientation, orientationPlatform),
    [playable, orientationPlatform],
  );
  const liveOrientation: LayoutOrientation = portrait ? "portrait" : "landscape";
  const orientationGate = !poster && coarsePointer && orientationGateActive(orientationRequirement, liveOrientation);
  const orientationHint = !poster && coarsePointer && orientationHintActive(orientationRequirement, liveOrientation);
  gateRef.current = orientationGate;
  const orientationGateEl = orientationGate ? (
    <RotateDeviceScreen
      requiredOrientation={orientationRequirement.required ?? "landscape"}
      title={orientationRequirement.required === "portrait" ? "Turn your phone upright" : "Turn your phone sideways"}
      description={`${playable.game.name} is built for ${orientationRequirement.required ?? "landscape"} play.`}
    />
  ) : orientationHint && orientationRequirement.preferred !== null ? (
    <OrientationHint wanted={orientationRequirement.preferred} />
  ) : null;
  const audioEngine = useMemo(
    () =>
      createAudioEngine({
        sounds: playable.audio?.sounds,
        buses: playable.audio?.buses,
        music: playable.audio?.music,
        musicBus: playable.audio?.musicBus,
      }),
    [playable],
  );
  useEffect(() => () => audioEngine.dispose(), [audioEngine]);
  useEffect(() => {
    if (ctx === null) return;
    return attachAudioEventWire(ctx.game.events, audioEngine);
  }, [ctx, audioEngine]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.jgPresentation = playable.presentation ?? "3d";
    return () => {
      delete document.documentElement.dataset.jgPresentation;
    };
  }, [playable]);
  useEffect(() => {
    if (ctx === null || typeof document === "undefined") return;
    const hud = resolveRigKind(playable.camera) === "none" || playable.presentation === "hud";
    if (!hud) return;
    const frame = requestAnimationFrame(() => {
      document.documentElement.dataset.jgFrameReady = "1";
    });
    return () => {
      cancelAnimationFrame(frame);
      delete document.documentElement.dataset.jgFrameReady;
    };
  }, [ctx, playable]);
  const userId = multiplayer?.userId ?? DEV_USER_ID;
  const reportRuntimeError = (error: unknown, phase: string, componentStack?: string) => {
    const diagnostic = logRuntimeError(error, phase, componentStack);
    setDiagnostics((current) => [...current.slice(-4), { ...diagnostic, id: Date.now() + current.length }]);
  };

  useEffect(() => {
    setDiagnostics([]);
    try {
      const models = contextModels(playable);
      const context = createGameContext({
        definition: playable.game,
        content: playable.content,
        player: { userId, isNew: true },
        ...(models === undefined ? {} : { models }),
      });
      playable.loop.onInit(context);
      playable.loop.onNewPlayer(context);
      onContextReady?.(context);
      setCtx(context);
    } catch (error) {
      reportRuntimeError(error, "init");
      setCtx(null);
    }
    return () => {
      setCtx(null);
    };
  }, [playable, userId]);

  useShellMultiplayerSync(ctx, multiplayer, playable, serverIdRef, setRemotePlayers);

  useEffect(() => {
    wrapperRef.current?.focus();
  }, [ctx]);

  useSyncExternalStore(
    ctx?.subscribe ?? (() => () => undefined),
    ctx?.version ?? (() => 0),
    ctx?.version ?? (() => 0),
  );

  if (ctx === null) return <div className="h-full w-full bg-neutral-950" />;

  const cameraConfig =
    playable.camera?.followEntityId !== undefined
      ? playable.camera
      : { ...playable.camera, followEntityId: ctx.player.possession.active(userId) };
  const rigKind = resolveRigKind(cameraConfig);
  const shared = {
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
    diagnostics,
    devtoolsEnabled,
    devtoolsOpen,
    setDevtoolsOpen,
    reportRuntimeError,
    trackPointerAxis,
    deactivatePointerAxis,
  } as const;

  if (rigKind === "none" || playable.presentation === "hud") {
    return (
      <ShellHudPresentation
        {...shared}
        uiScale={graphics.uiScale}
        onPointerResumeAudio={() => audioEngine.resume()}
      />
    );
  }

  return (
    <Shell3dPresentation
      {...shared}
      primaryClickRef={primaryClickRef}
      cameraDraggingRef={cameraDraggingRef}
      serverIdRef={serverIdRef}
      remotePlayers={remotePlayers}
      touchStyle={touchStyle}
      compact={compact}
      graphics={graphics}
      settingsStore={settingsStore}
      bindingOverrides={bindingOverrides}
      rebindAction={rebindAction}
      resetActionBinding={resetActionBinding}
      audioEngine={audioEngine}
      poster={poster}
      posterFrozen={posterFrozen}
      onPosterSettled={() => {
        if (posterSettledRef.current) return;
        posterSettledRef.current = true;
        setPosterFrozen(true);
      }}
    />
  );
}
