import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { activeTouchControlsMode } from "@jgengine/core/input/touchControlsMode";
import { normalizePointerToAxis, type PointerAxisState } from "@jgengine/core/input/pointerAxis";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { localPlayers } from "@jgengine/core/runtime/localPlayers";
import { actionContextStack, activeActionCodes } from "@jgengine/core/game/controlGate";
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
import { devtools } from "@jgengine/core/devtools/devtools";
import { armFallbackSeams } from "@jgengine/core/devtools/fallbackSeams";
import { armTextureErrors } from "@jgengine/core/devtools/textureErrors";
import { readUrlFlag, subscribeUrlChange, writeUrlParam } from "@jgengine/core/devtools/urlFlags";

import { createAudioEngine } from "./audio/audioEngine";
import { attachAudioEventWire } from "./audio/audioWire";
import { installAgentBridge } from "./devtools/agentBridge";
import { withDevtoolsLatency } from "./devtools/latencyInstrumentation";
import { resolveRigKind } from "./camera/rigResolve";
import { contextModels } from "./render/resolveModel";
import type { ShellMultiplayer } from "./multiplayer";
import type { PlayableGame } from "./registry";
import { OrientationHint } from "./touch/OrientationHint";
import { useTouchStyle, useTouchJoystickVariant, useGraphicsSettings } from "./settings/appliedSettings";
import {
  logRuntimeError,
  type RuntimeDiagnostic,
} from "./diagnostics/RuntimeDiagnostics";
import { EMPTY_RESERVED } from "./shellConstants";
import { JoinGate } from "./JoinGate";
import { useShellMultiplayerSync } from "./useShellMultiplayerSync";
import { ShellHudPresentation } from "./ShellHudPresentation";
import { isServerAuthoritative } from "@jgengine/core/runtime/adapter";
import { playControlsActive } from "@jgengine/core/game/controlGate";
import { resolveInputSink } from "./inputSink";
import { observableShellTracker, attachShellInputPublication } from "./shellInputPublication";
import { attachShellControlSuspension } from "./shellControlSuspension";
import { LazyShell3dPresentation } from "./lazyShell3dPresentation";
import { PhotoControls } from "./PhotoControls";
import { createPresentationDiagnosticOwnership, createPlaySurfaceFocusOwnership, PresentationRecovery, type PresentationRecoveryEvent } from "./presentationRecovery";

const DEV_USER_ID = "dev-player";

/** The query param that mirrors the devtools overlay into the URL — present = open. */
const DEBUG_PARAM = "debug";

const NO_SUBSCRIBE = () => () => undefined;
const ZERO_VERSION = () => 0;

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
  armTextureErrors(devtoolsEnabled);
  // `?debug` mirrors the devtools overlay into the URL: open with a link, strip the param to close.
  const [devtoolsOpen, setDevtoolsOpen] = useState(() => devtoolsEnabled && readUrlFlag(DEBUG_PARAM));
  const devtoolsOpenRef = useRef(false);
  devtoolsOpenRef.current = devtoolsOpen;
  useEffect(() => {
    if (!devtoolsEnabled) return;
    writeUrlParam(DEBUG_PARAM, devtoolsOpen ? "1" : null);
  }, [devtoolsEnabled, devtoolsOpen]);
  useEffect(() => {
    if (!devtoolsEnabled) return;
    return subscribeUrlChange(() => setDevtoolsOpen(readUrlFlag(DEBUG_PARAM)));
  }, [devtoolsEnabled]);
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
  const diagnosticSequence = useRef(0);
  const presentationDiagnostics = useRef(createPresentationDiagnosticOwnership());
  const [remotePlayers, setRemotePlayers] = useState<PresencePoseRow[]>([]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const recoveredFocus = useRef(createPlaySurfaceFocusOwnership<GameContext>());
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
  // Render-time reset (no stale-keybinds frame): reload persisted overrides once per playable change.
  const [overridesPlayable, setOverridesPlayable] = useState(playable);
  if (overridesPlayable !== playable) {
    setOverridesPlayable(playable);
    setBindingOverrides(loadBindingOverrides(playable.game.name));
  }
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
  const contextStack = ctx === null ? null : actionContextStack(ctx);
  const contextVersion = useSyncExternalStore(
    contextStack?.subscribe ?? NO_SUBSCRIBE,
    contextStack?.version ?? ZERO_VERSION,
    contextStack?.version ?? ZERO_VERSION,
  );
  const activeInput = useMemo(
    () => (ctx === null ? effectiveInput : activeActionCodes(ctx, effectiveInput)),
    // contextVersion re-derives the layered map when a context is pushed or popped mid-game.
    [ctx, effectiveInput, contextVersion],
  );
  const activeBindingMap = useMemo(() => toActionStateBindingMap(withTouchCodes(activeInput)), [activeInput]);
  // One tracker per context, rebound in place so keys held across a context swap stay held.
  const tracker = useMemo(() => observableShellTracker(createActionStateTracker<string>(activeBindingMap)), [ctx]);
  const boundMapRef = useRef(activeBindingMap);
  if (boundMapRef.current !== activeBindingMap) {
    boundMapRef.current = activeBindingMap;
    tracker.rebind(activeBindingMap);
  }
  const graphics = useGraphicsSettings(settingsStore, playable.shadows ?? true, playable.graphics);
  const trackPointerAxis = (event: { clientX: number; clientY: number }) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect === undefined) return;
    pointerAxisRef.current = normalizePointerToAxis(event.clientX, event.clientY, rect);
  };
  const deactivatePointerAxis = () => {
    const state = pointerAxisRef.current;
    if (state !== null && state.active) {
      pointerAxisRef.current = { ...state, active: false };
      tracker.notify("discrete");
    }
  };
  // Reads fresh every render: the ctx-version useSyncExternalStore below re-renders on store
  // writes, so a gameplay setTouchControlsMode("car") swaps the visible control set that frame.
  const touchMode = ctx === null ? null : activeTouchControlsMode(ctx);
  const touchScheme = useMemo(
    () =>
      deriveTouchScheme(playable.game.input, {
        reserved:
          resolveRigKind(playable.camera) === "none" || playable.presentation === "hud"
            ? EMPTY_RESERVED
            : RESERVED_INPUT_ACTIONS,
        firstPerson: resolveRigKind(playable.camera) === "first",
        config: playable.touch,
        mode: touchMode,
      }),
    [playable, touchMode],
  );
  const touchStyle = useTouchStyle(settingsStore, touchScheme?.style ?? DEFAULT_TOUCH_STYLE);
  const touchJoystickVariant = useTouchJoystickVariant(settingsStore);
  const { coarsePointer, portrait, compact } = useDisplayProfile();
  const analogRef = useRef<Readonly<Record<string, number>> | null>(null);
  const touchSink = useMemo(
    () => ({
      onCodeDown: (code: string) => tracker.handleDown(code),
      onCodeUp: (code: string) => tracker.handleUp(code),
      onAnalog: (values: Readonly<Record<string, number>> | null) => {
        analogRef.current = values;
        tracker.notify("analog");
      },
    }),
    [tracker],
  );
  useLayoutEffect(() => {
    if (ctx === null) return;
    return attachShellControlSuspension({
      ctx, tracker, pointerAxisRef, analogRef, primaryClickRef, cameraDraggingRef, f2HeldRef,
    });
  }, [ctx, tracker]);
  const gateRef = useRef(false);
  useLayoutEffect(() => {
    if (ctx === null || poster) return;
    return attachShellInputPublication({
      ctx, tracker,
      active: () => !gateRef.current && playControlsActive(ctx),
      analog: () => analogRef.current,
      pointer: () => pointerAxisRef.current,
      sink: () => resolveInputSink({
        serverAuthoritative: isServerAuthoritative(playable.game.multiplayer) && multiplayer !== null,
        backend: multiplayer?.backend ?? null, serverId: serverIdRef.current,
      }),
    });
  }, [ctx, tracker, multiplayer, playable, poster]);
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
    const id = ++diagnosticSequence.current;
    presentationDiagnostics.current.register(error, id, phase);
    setDiagnostics((current) => [...current.slice(-4), { ...diagnostic, id }]);
  };

  const recoveryTrace = useRef<Array<Record<string, unknown>>>([]);
  const traceRecovery = (event: PresentationRecoveryEvent | { phase: string }) => {
    if (!devtoolsEnabled) return;
    const wrapper = wrapperRef.current;
    const active = document.activeElement;
    const rect = wrapper?.getBoundingClientRect();
    recoveryTrace.current.push({ ...event, at: performance.now(), connected: wrapper?.isConnected ?? false,
      rects: wrapper?.getClientRects().length ?? 0, width: rect?.width ?? null, height: rect?.height ?? null,
      display: wrapper === null ? null : getComputedStyle(wrapper).display,
      active: active?.tagName ?? null, ownsFocus: active === wrapper, focusInside: wrapper?.contains(active) ?? false });
  };
  useEffect(() => {
    recoveryTrace.current = [];
    if (!devtoolsEnabled) return;
    return devtools.probes.register("presentationRecovery", () => recoveryTrace.current);
  }, [ctx, devtoolsEnabled]);

  const revealRecoveredPresentation = () => {
    if (ctx === null) return;
    traceRecovery({ phase: "shell-reveal-layout" });
    recoveredFocus.current.reveal(ctx, wrapperRef.current, document.activeElement, document.body);
    traceRecovery({ phase: "shell-focus-result" });
  };

  const retireRecoveredPresentation = (error: unknown) => {
    traceRecovery({ phase: "shell-recovered-callback" });
    const owned = presentationDiagnostics.current.recovered(error);
    setDiagnostics((current) => current.filter((diagnostic) => !owned.has(diagnostic.id)));
    if (ctx !== null) recoveredFocus.current.request(ctx);
    revealRecoveredPresentation();
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
      if (playable.localPlayers !== undefined) localPlayers(context).retune(playable.localPlayers);
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

  const authoritativeFrameRef = useRef<import("./worldSync").AuthoritativeFrameHandler | null>(null);
  const join = useShellMultiplayerSync(ctx, multiplayer, playable, serverIdRef, setRemotePlayers, authoritativeFrameRef);

  useEffect(() => {
    wrapperRef.current?.focus();
  }, [ctx]);

  useSyncExternalStore(
    ctx?.subscribe ?? (() => () => undefined),
    ctx?.version ?? (() => 0),
    ctx?.version ?? (() => 0),
  );

  if (ctx === null) return <div className="h-full w-full bg-neutral-950" />;
  if (join.status !== "joined") return <JoinGate {...join} />;

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
    touchJoystickVariant,
    analogRef,
    inputBindings: activeInput,
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
      <PresentationRecovery ctx={ctx} onRuntimeError={reportRuntimeError} onRetryCommitted={() => wrapperRef.current?.focus({ preventScroll: true })} onRecoveredDraw={retireRecoveredPresentation} onRecoveryEvent={traceRecovery}>
        <ShellHudPresentation
          {...shared}
          serverIdRef={serverIdRef}
          uiScale={graphics.uiScale}
          onPointerResumeAudio={() => audioEngine.resume()}
          settingsStore={settingsStore}
          bindingOverrides={bindingOverrides}
          rebindAction={rebindAction}
          resetActionBinding={resetActionBinding}
          audioEngine={audioEngine}
          poster={poster}
        />
      </PresentationRecovery>
    );
  }

  return (
    <PresentationRecovery ctx={ctx} onRuntimeError={reportRuntimeError} onRetryCommitted={() => wrapperRef.current?.focus({ preventScroll: true })} onRecoveredDraw={retireRecoveredPresentation} onRecoveryEvent={traceRecovery}>
      <LazyShell3dPresentation
        {...shared}
        onPresentationReveal={revealRecoveredPresentation}
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
        authoritativeFrameRef={authoritativeFrameRef}
      />
      <PhotoControls ctx={ctx} playSurface={wrapperRef} />
    </PresentationRecovery>
  );
}
