import { Canvas } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  createActionStateTracker,
  toActionStateBindingMap,
} from "@jgengine/core/input/actionBindings";
import { RESERVED_INPUT_ACTIONS } from "./boundActionDispatch";
import { resolveWorldSky } from "./worldSky";
import { pointerAimFor, pointerContextMenu } from "./shellPointer";
import { deriveTouchScheme, withTouchCodes, DEFAULT_TOUCH_STYLE } from "@jgengine/core/input/touchScheme";
import {
  contextVerbInput,
  type ContextMenu,
  type ContextVerb,
} from "@jgengine/core/interaction/contextMenu";
import { normalizePointerToAxis, type PointerAxisState } from "@jgengine/core/input/pointerAxis";
import type { Aim } from "@jgengine/core/scene/spatial";
import {
  createSelectionSet,
  isMarquee,
  screenRect,
  selectWithinRect,
  type ScreenRect,
} from "@jgengine/core/scene/selection";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { DEFAULT_PICKUP_RADIUS } from "@jgengine/core/game/worldItem";
import { useDisplayProfile } from "@jgengine/react/display";
import { HudViewportProvider } from "@jgengine/react/hudViewport";
import { GameViewportProvider } from "@jgengine/react/gameViewport";
import { RotateDeviceScreen } from "@jgengine/react/rotateDevice";
import { GameProvider } from "@jgengine/react/provider";
import type { PresencePoseRow } from "@jgengine/core/runtime/transport";

import type { PointerConfig } from "@jgengine/core/game/playableGame";
import { CAMERA_FRUSTUM_DEFAULTS } from "@jgengine/core/game/playableGame";
import type { GameSettingsConfig } from "@jgengine/core/settings/settingsModel";
import { createSettingsStore } from "@jgengine/core/settings/settingsModel";
import {
  applyBindingOverrides,
  clearBindingOverride,
  loadBindingOverrides,
  saveBindingOverride,
  type BindingOverrides,
} from "@jgengine/core/input/bindingOverrides";
import { playControlsActive } from "@jgengine/core/game/controlGate";
import {
  orientationGateActive,
  orientationHintActive,
  resolveOrientationRequirement,
  type LayoutOrientation,
} from "@jgengine/core/ui/orientation";
import { sky as resolveSkyDescriptor } from "@jgengine/core/world/features";
import { resolveGameLook } from "@jgengine/core/render/lookPreset";

import { AudioListener, EntityAudioEmitters, ObjectAudioEmitters } from "./audio/AudioComponents";
import { createAudioEngine } from "./audio/audioEngine";
import { attachAudioEventWire } from "./audio/audioWire";
import { PostProcessing } from "./postfx/PostProcessing";
import { EnvironmentLighting } from "./render/EnvironmentLighting";
import { CollisionDebugWorld } from "./devtools/CollisionDebugWorld";
import { DevtoolsOverlay, DevtoolsRendererProbe, withDevtoolsLatency } from "./devtools/DevtoolsOverlay";
import { installAgentBridge } from "./devtools/agentBridge";
import {
  GameCameraRig,
  PlayerFovProvider,
  PlayerFovSlider,
  resolveRigKind,
  rtsPanKeysConflict,
} from "./camera";
import { CullingProvider } from "./visibility/CullingProvider";
import { SkyDaylight, TimeOfDayDaylight } from "./environment";
import { resolveSkyLightOwnership, skyEmitsLights } from "./environment/skyLightingPolicy";
import { EnvironmentScene } from "./environment/EnvironmentScene";
import { PointerProbe } from "./pointer/PointerProbe";
import { MarqueeBox, ContextMenuView } from "./pointer/PointerOverlays";
import { createPointerService } from "./pointer/pointerService";
import {
  CombatCameraShake,
  ProjectileTracers,
  Reticle,
  WorldEntityBars,
  WorldFloatText,
  WorldNameplates,
  WorldTelegraphs,
} from "./world/WorldHud";
import { WorldSpellVfx } from "./world/WorldVfx";
import { GridWorldScene } from "./world/GridWorldScene";
import { WorldItems } from "./world/WorldItems";
import type { ShellMultiplayer } from "./multiplayer";
import type { PlayableGame } from "./registry";
import { OrientationHint } from "./touch/OrientationHint";
import { TouchControlsDock, TouchPlaySurface, touchDockClearance } from "./touch/TouchControlsOverlay";
import { BUILT_IN_SETTING_CATEGORIES } from "@jgengine/core/settings/settingsModel";
import { SettingsProvider, type SettingsActionView } from "@jgengine/react/settings";
import { SettingsRuntime } from "./settings/SettingsRuntime";
import { SettingsChrome } from "./settings/SettingsChrome";
import { AudioSettingsBridge, useGraphicsSettings, useTouchStyle } from "./settings/appliedSettings";

import { ConfiguredLighting, BackdropFog } from "./render/SceneLighting";
import { WorldView, RemotePlayers } from "./world/WorldScene";
import { FrameDriver } from "./drivers/FrameDriver";
import { HudOnlyDriver } from "./drivers/HudOnlyDriver";
import {
  DiagnosticOverlay,
  GameUiErrorBoundary,
  logRuntimeError,
  type RuntimeDiagnostic,
} from "./diagnostics/RuntimeDiagnostics";
import { GamePhaseStamp } from "./GamePhaseStamp";
import { EMPTY_RESERVED } from "./shellConstants";
import { useShellMultiplayerSync } from "./useShellMultiplayerSync";

const DEV_USER_ID = "dev-player";
const PRIMARY_CLICK_MOVE_THRESHOLD_PX = 6;
const DEFAULT_BACKGROUND_COLOR = "#14161b";

export { applyMotionImpulses } from "@jgengine/core/runtime/motionIntents";
export { nearbyObstacles } from "@jgengine/core/movement/movementModel";
export { resolvePhysicsTuning } from "@jgengine/core/movement/playerMovement";
export { hasEnvironmentTerrain } from "@jgengine/core/world/terrain";

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
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const pointerAxisRef = useRef<PointerAxisState | null>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const f2HeldRef = useRef(false);
  const pointerService = useMemo(() => createPointerService(), []);
  const selection = useMemo(() => createSelectionSet(), [playable]);
  const [marquee, setMarquee] = useState<ScreenRect | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<{ menu: ContextMenu; x: number; y: number } | null>(null);
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
      const context = createGameContext({
        definition: playable.game,
        content: playable.content,
        player: { userId, isNew: true },
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

  const GameUI = playable.GameUI;
  const WorldOverlay = playable.WorldOverlay;
  const controlledEntityId = ctx.player.possession.active(userId);
  const cameraConfig =
    playable.camera?.followEntityId !== undefined
      ? playable.camera
      : { ...playable.camera, followEntityId: controlledEntityId };
  const rigKind = resolveRigKind(cameraConfig);

  if (rigKind === "none" || playable.presentation === "hud") {
    const GameUI = playable.GameUI;
    return (
      <div
        ref={wrapperRef}
        tabIndex={0}
        className="relative h-full w-full bg-neutral-950 outline-none"
        onKeyDown={(event) => {
          if (event.code === "F2") {
            event.preventDefault();
            f2HeldRef.current = true;
            return;
          }
          if (f2HeldRef.current) {
            if (event.code === "KeyD" && devtoolsEnabled) {
              event.preventDefault();
              setDevtoolsOpen((current) => !current);
            }
            return;
          }
          if (event.code === "Tab" || event.code === "Space") event.preventDefault();
          if (playControlsActive(ctx)) tracker.handleDown(event.code);
        }}
        onKeyUp={(event) => {
          if (event.code === "F2") {
            f2HeldRef.current = false;
            return;
          }
          if (playControlsActive(ctx)) tracker.handleUp(event.code);
        }}
        onBlur={() => {
          f2HeldRef.current = false;
          tracker.reset();
        }}
        onPointerDown={() => audioEngine.resume()}
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
        {!orientationGate && coarsePointer && touchScheme !== null && touchScheme.gestures !== null && playControlsActive(ctx) ? (
          <TouchPlaySurface
            scheme={touchScheme}
            sink={touchSink}
            yawRef={yawRef}
            pitchRef={pitchRef}
            maxPitch={0}
            onPrimaryTap={() => undefined}
          />
        ) : null}
        <GameUiErrorBoundary onRuntimeError={reportRuntimeError}>
          <GameProvider context={ctx}>
            <GamePhaseStamp />
            <HudViewportProvider
              platforms={playable.platforms}
              config={playable.hudFit}
              userScale={graphics.uiScale}
            >
              {orientationGate ? null : <GameUI />}
            </HudViewportProvider>
          </GameProvider>
        </GameUiErrorBoundary>
        {orientationGateEl}
        {devtoolsEnabled ? (
          <DevtoolsOverlay open={devtoolsOpen} ctx={ctx} playable={playable} multiplayer={multiplayer} />
        ) : null}
        <DiagnosticOverlay diagnostics={diagnostics} gameName={playable.game.name} />
        </GameViewportProvider>
      </div>
    );
  }

  const firstPerson = rigKind === "first";
  const showReticle =
    (firstPerson && playable.camera?.firstPerson?.reticle !== false) || rigKind === "shoulder";
  const rtsPanKeysEnabled = !rtsPanKeysConflict(playable.game.input);
  const worldBars = playable.worldHealthBars;
  const barsStatId =
    worldBars === undefined || worldBars === false
      ? null
      : worldBars === true
        ? "health"
        : worldBars.statId ?? "health";
  const barsRoles =
    worldBars === undefined || worldBars === true || worldBars === false ? undefined : worldBars.roles;
  const barsMaxDistance =
    worldBars === undefined || worldBars === true || worldBars === false
      ? undefined
      : worldBars.maxDistance;
  const nameplates = playable.nameplates;
  const nameplatesStatId =
    nameplates === undefined || nameplates === false
      ? null
      : nameplates === true
        ? "health"
        : nameplates.statId ?? "health";
  const nameplatesRoles =
    nameplates === undefined || nameplates === true || nameplates === false ? undefined : nameplates.roles;
  const nameplatesMaxDistance =
    nameplates === undefined || nameplates === true || nameplates === false ? undefined : nameplates.maxDistance;
  const resolveEntityRole = (entity: SceneEntity) => playable.content.entityById?.(entity.name)?.role;

  const pointer: PointerConfig | undefined = playable.pointer;
  const pointerUsesLeft = pointer !== undefined && (pointer.select === true || pointer.moveCommand !== undefined);
  const selectFilter = pointer?.selectFilter;
  const worldSky = resolveWorldSky(playable.game.world);
  const world = playable.game.world;
  const biomeBands = world?.kind === "environment" ? world.terrain?.biomeBands : undefined;
  const AutoEnvironment =
    playable.environment ??
    (world?.kind === "environment"
      ? () => <EnvironmentScene feature={world} />
      : world?.kind === "biomes" || world?.kind === "voxel" || world?.kind === "plots" || world?.kind === "tilemap"
        ? () => <GridWorldScene feature={world} />
        : undefined);
  const resolvedLook = resolveGameLook({
    look: playable.look,
    lighting: playable.lighting,
    backdrop: playable.backdrop,
    postProcessing: playable.postProcessing,
    hasWorldSky: worldSky !== undefined,
  });
  const cinematicLook = (playable.look ?? "cinematic") !== "flat";
  const backdrop = resolvedLook.backdrop;
  const backdropSky = backdrop?.sky !== undefined ? resolveSkyDescriptor(backdrop.sky) : undefined;
  const effectiveSky = backdropSky ?? worldSky;
  const backgroundColor = backdrop?.background ?? (effectiveSky === undefined ? DEFAULT_BACKGROUND_COLOR : undefined);
  const lighting = resolvedLook.lighting;
  const orthographic = playable.camera?.projection === "orthographic";

  const localXY = (event: { clientX: number; clientY: number }) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    return rect === undefined
      ? { x: event.clientX, y: event.clientY }
      : { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const commitSelection = (ids: string[]) => {
    selection.replace(ids);
    setSelectedIds(new Set(ids));
  };

  const finishMarquee = (rect: ScreenRect) => {
    const candidates: { id: string; x: number; y: number }[] = [];
    for (const entity of ctx.scene.entity.list()) {
      if (selectFilter !== undefined && !selectFilter(entity.id)) continue;
      const screen = pointerService.screenOf(entity.position);
      if (screen !== null) candidates.push({ id: entity.id, x: screen.x, y: screen.y });
    }
    commitSelection(selectWithinRect(candidates, rect));
  };

  /** DOM UI (menus, HUD buttons) sits in the same wrapper as the canvas — only canvas-targeted clicks are world input. */
  const isWorldPointerTarget = (event: { target: EventTarget | null }) =>
    event.target instanceof HTMLCanvasElement;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isWorldPointerTarget(event)) wrapperRef.current?.focus();
    trackPointerAxis(event);
    audioEngine.resume();
    if (contextMenu !== null) setContextMenu(null);
    if (event.button === 0 && isWorldPointerTarget(event)) {
      const point = localXY(event);
      pointerDownRef.current = point;
      if (pointer?.select === true) marqueeStartRef.current = point;
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    trackPointerAxis(event);
    if (pointer?.select !== true) return;
    const start = marqueeStartRef.current;
    if (start === null || (event.buttons & 1) === 0) return;
    const point = localXY(event);
    setMarquee(screenRect(start.x, start.y, point.x, point.y));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || pointerDownRef.current === null) return;
    const start = pointerDownRef.current;
    pointerDownRef.current = null;
    marqueeStartRef.current = null;
    const end = localXY(event);
    const rect = screenRect(start.x, start.y, end.x, end.y);
    const wasMarquee = marquee !== null && isMarquee(rect, PRIMARY_CLICK_MOVE_THRESHOLD_PX);
    setMarquee(null);
    if (pointer?.select === true && wasMarquee) {
      finishMarquee(rect);
      return;
    }
    if (cameraDraggingRef.current) return;
    if (pointer?.grabWorldItems === true) {
      const hit = pointerService.worldHit();
      const itemInstanceId = hit?.entity ?? null;
      const record = itemInstanceId === null ? null : ctx.scene.worldItem.get(itemInstanceId);
      if (record !== null && itemInstanceId !== null) {
        const itemEntity = ctx.scene.entity.get(itemInstanceId);
        const localPlayer = ctx.scene.entity.get(ctx.player.userId);
        const pickupRadius = playable.worldItem?.pickupRadius ?? DEFAULT_PICKUP_RADIUS;
        const withinRadius =
          itemEntity !== null &&
          localPlayer !== null &&
          Math.hypot(
            localPlayer.position[0] - itemEntity.position[0],
            localPlayer.position[1] - itemEntity.position[1],
            localPlayer.position[2] - itemEntity.position[2],
          ) <= pickupRadius;
        if (withinRadius) {
          ctx.scene.worldItem.pickup(itemInstanceId, ctx.player.userId);
          return;
        }
      }
    }
    if (pointer?.select === true) {
      const hit = pointerService.worldHit();
      if (hit !== null && hit.entity !== null && (selectFilter === undefined || selectFilter(hit.entity))) {
        commitSelection([hit.entity]);
      } else {
        commitSelection([]);
      }
      return;
    }
    if (pointer?.moveCommand !== undefined) {
      const hit = pointerService.worldHit();
      if (hit !== null && ctx.game.commands.has(pointer.moveCommand)) {
        ctx.game.commands.run(pointer.moveCommand, { point: hit.point, entity: hit.entity, object: hit.object });
      }
      return;
    }
    const moved = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
    if (moved <= PRIMARY_CLICK_MOVE_THRESHOLD_PX * PRIMARY_CLICK_MOVE_THRESHOLD_PX) primaryClickRef.current = true;
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (pointer === undefined) return;
    if (!isWorldPointerTarget(event)) return;
    event.preventDefault();
    const hit = pointerService.worldHit();
    if (hit === null) return;
    if (pointer.contextMenu === true && (hit.entity !== null || hit.object !== null)) {
      const menu = pointerContextMenu(ctx, playable, hit);
      if (menu !== null) {
        const point = localXY(event);
        setContextMenu({ menu, x: point.x, y: point.y });
        return;
      }
    }
    if (pointer.select === true && pointer.orderCommand !== undefined && selection.size() > 0) {
      if (ctx.game.commands.has(pointer.orderCommand)) {
        ctx.game.commands.run(pointer.orderCommand, { selection: selection.list(), point: hit.point });
      }
      return;
    }
    if (pointer.secondaryCommand !== undefined && ctx.game.commands.has(pointer.secondaryCommand)) {
      const aim: Aim = (pointer.aim === true ? pointerAimFor(ctx, pointerService) : undefined) ?? {
        yaw: yawRef.current,
        pitch: pitchRef.current,
      };
      ctx.game.commands.run(pointer.secondaryCommand, { point: hit.point, entity: hit.entity, object: hit.object, aim });
    }
  };

  const handleVerbPick = (verb: ContextVerb) => {
    const state = contextMenu;
    setContextMenu(null);
    if (state !== null && ctx.game.commands.has(verb.command)) {
      ctx.game.commands.run(verb.command, contextVerbInput(state.menu, verb));
    }
  };

  const controlsActive = playControlsActive(ctx);
  const settingsDisabled = playable.settings === false;
  const settingsConfig: GameSettingsConfig =
    playable.settings === false || playable.settings === undefined ? {} : playable.settings;
  const settingsSurface = settingsDisabled ? false : settingsConfig.surface ?? false;
  const settingsVariant = settingsConfig.variant ?? "panel";
  const hideCategories = settingsDisabled ? BUILT_IN_SETTING_CATEGORIES : settingsConfig.hide ?? [];
  const fovControlEnabled = !orthographic && playable.camera?.playerFov?.control !== false;
  const settingsHostsFov = !settingsDisabled && !hideCategories.includes("gameplay") && fovControlEnabled;
  const settingsActions: SettingsActionView[] = settingsDisabled
    ? []
    : (settingsConfig.actions ?? []).map((action) => ({
        id: action.id,
        label: action.label,
        kind: action.kind ?? "default",
        description: action.description,
        run: () => action.run(ctx),
      }));
  const touchScale = compact ? 0.88 : 1;
  const dockMounted =
    !poster &&
    !orientationGate &&
    coarsePointer &&
    controlsActive &&
    touchScheme !== null &&
    (touchScheme.joystick !== null || touchScheme.buttons.length > 0);

  return (
    <SettingsProvider store={settingsStore}>
    <PlayerFovProvider config={playable.camera} orthographic={orthographic}>
    <AudioSettingsBridge store={settingsStore} engine={audioEngine} buses={playable.audio?.buses} />
    <SettingsRuntime
      variant={settingsVariant}
      surface={settingsSurface}
      actions={settingsActions}
      input={playable.game.input ?? {}}
      buses={playable.audio?.buses}
      extra={settingsConfig.extra ?? []}
      categories={settingsConfig.categories ?? []}
      hide={hideCategories}
      fovEnabled={fovControlEnabled}
      hideBindings={settingsConfig.hideBindings ?? []}
      touchStyle={
        coarsePointer &&
        touchScheme !== null &&
        (touchScheme.joystick !== null || touchScheme.buttons.length > 0)
      }
      overrides={bindingOverrides}
      rebind={rebindAction}
      resetBinding={resetActionBinding}
    >
    <div
      ref={wrapperRef}
      tabIndex={0}
      {...(poster && posterFrozen ? { "data-poster-ready": "" } : {})}
      className="relative h-full w-full bg-neutral-950 outline-none"
      style={
        {
          "--jg-hud-dock-clearance": `${dockMounted ? touchDockClearance(touchScheme, touchScale) : 0}px`,
        } as CSSProperties
      }
      onKeyDown={(event) => {
        if (event.code === "F2") {
          event.preventDefault();
          f2HeldRef.current = true;
          return;
        }
        if (f2HeldRef.current) {
          if (event.code === "KeyD" && devtoolsEnabled) {
            event.preventDefault();
            document.exitPointerLock?.();
            setDevtoolsOpen((current) => !current);
          }
          return;
        }
        if (event.code === "Tab" || event.code === "Space") event.preventDefault();
        if (playControlsActive(ctx)) tracker.handleDown(event.code);
      }}
      onKeyUp={(event) => {
        if (event.code === "F2") {
          f2HeldRef.current = false;
          return;
        }
        if (playControlsActive(ctx)) tracker.handleUp(event.code);
      }}
      onBlur={() => {
        f2HeldRef.current = false;
        tracker.reset();
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={deactivatePointerAxis}
      onPointerCancel={deactivatePointerAxis}
      onContextMenu={handleContextMenu}
      onWheel={(event) => {
        if (ctx === null || !event.shiftKey) return;
        event.preventDefault();
        if (event.deltaY < 0 && ctx.game.commands.has("ui.hotbarScrollNext")) {
          ctx.game.commands.run("ui.hotbarScrollNext", {});
        } else if (event.deltaY > 0 && ctx.game.commands.has("ui.hotbarScrollPrev")) {
          ctx.game.commands.run("ui.hotbarScrollPrev", {});
        }
      }}
    >
      <GameViewportProvider platforms={playable.platforms}>
      <Canvas
        frameloop={poster && posterFrozen ? "demand" : "always"}
        orthographic={orthographic}
        camera={
          orthographic
            ? {
                zoom: playable.camera?.frustum?.zoom ?? CAMERA_FRUSTUM_DEFAULTS.zoom,
                near: playable.camera?.frustum?.near ?? CAMERA_FRUSTUM_DEFAULTS.near,
                far: playable.camera?.frustum?.far ?? CAMERA_FRUSTUM_DEFAULTS.far,
              }
            : {
                fov: playable.camera?.frustum?.fov ?? CAMERA_FRUSTUM_DEFAULTS.fov,
                near: playable.camera?.frustum?.near ?? CAMERA_FRUSTUM_DEFAULTS.near,
                far: playable.camera?.frustum?.far ?? CAMERA_FRUSTUM_DEFAULTS.far,
              }
        }
        shadows={graphics.shadows}
        dpr={graphics.dpr}
        gl={{ preserveDrawingBuffer: true }}
        style={{ touchAction: "none" }}
      >
        {backgroundColor !== undefined ? <color attach="background" args={[backgroundColor]} /> : null}
        {cinematicLook ? <EnvironmentLighting /> : null}
        {lighting !== undefined ? (
          <ConfiguredLighting lighting={lighting} />
        ) : effectiveSky === undefined ? (
          <>
            <ambientLight intensity={0.55} />
            <directionalLight position={[10, 16, 6]} intensity={1.3} />
          </>
        ) : null}
        {effectiveSky !== undefined ? (
          effectiveSky.timeOfDay ? (
            <TimeOfDayDaylight
              sky={effectiveSky}
              clock={ctx.time}
              bands={effectiveSky === worldSky ? biomeBands : undefined}
              lights={skyEmitsLights(resolveSkyLightOwnership(lighting !== undefined))}
            />
          ) : (
            <SkyDaylight
              sky={effectiveSky}
              bands={effectiveSky === worldSky ? biomeBands : undefined}
              lights={skyEmitsLights(resolveSkyLightOwnership(lighting !== undefined))}
            />
          )
        ) : null}
        <BackdropFog fog={backdrop?.fog} />
        <GameProvider context={ctx}>
          <CullingProvider config={playable.visibility}>
            <WorldView
              entitySprites={playable.entitySprites}
              entityModels={playable.entityModels}
              objectModels={playable.objectModels}
              objectStyles={playable.objectStyles}
              environment={AutoEnvironment}
              assets={playable.game.assets}
              renderEntity={playable.renderEntity}
              renderObject={playable.renderObject}
              selectedIds={selectedIds}
              hideLocalActor={firstPerson}
            />
          </CullingProvider>
          {WorldOverlay !== undefined ? <WorldOverlay ctx={ctx} /> : null}
          {barsStatId !== null ? (
            <WorldEntityBars
              statId={barsStatId}
              roles={barsRoles}
              resolveRole={resolveEntityRole}
              {...(barsMaxDistance === undefined ? {} : { maxDistance: barsMaxDistance })}
            />
          ) : null}
          {nameplatesStatId !== null ? (
            <WorldNameplates
              statId={nameplatesStatId}
              roles={nameplatesRoles}
              resolveRole={resolveEntityRole}
              {...(nameplatesMaxDistance === undefined ? {} : { maxDistance: nameplatesMaxDistance })}
            />
          ) : null}
          <WorldItems config={playable.worldItem} />
          <WorldTelegraphs />
          <WorldSpellVfx />
          <WorldFloatText />
          <ProjectileTracers />
          {devtoolsEnabled ? <CollisionDebugWorld /> : null}
          <CombatCameraShake />
          <AudioListener engine={audioEngine} />
          <EntityAudioEmitters engine={audioEngine} entitySounds={playable.entitySounds} />
          <ObjectAudioEmitters engine={audioEngine} objectSounds={playable.objectSounds} />
          <GameCameraRig
            yawRef={yawRef}
            pitchRef={pitchRef}
            config={cameraConfig}
            viewmodel={playable.viewmodel}
            pointerControls={pointerUsesLeft}
            panKeysEnabled={rtsPanKeysEnabled}
            director={ctx.camera}
            onDragChange={(dragging) => {
              cameraDraggingRef.current = dragging;
            }}
          />
          <PointerProbe service={pointerService} />
        </GameProvider>
        <RemotePlayers rows={remotePlayers} />
        <FrameDriver
          ctx={ctx}
          playable={playable}
          tracker={tracker}
          yawRef={yawRef}
          pitchRef={pitchRef}
          primaryClickRef={primaryClickRef}
          pointerAxisRef={pointerAxisRef}
          gateRef={gateRef}
          onRuntimeError={reportRuntimeError}
          multiplayer={multiplayer}
          serverIdRef={serverIdRef}
          pointerService={pointerService}
          pointerAim={pointer?.aim === true}
          pingCommand={pointer?.pingCommand}
          poster={poster}
          onPosterSettled={() => {
            if (posterSettledRef.current) return;
            posterSettledRef.current = true;
            setPosterFrozen(true);
          }}
        />
        <DevtoolsRendererProbe />
        {resolvedLook.postProcessing !== undefined && resolvedLook.postProcessing.enabled !== false ? (
          <PostProcessing config={resolvedLook.postProcessing} />
        ) : null}
      </Canvas>
      {!poster && !orientationGate && coarsePointer && controlsActive && touchScheme !== null && (touchScheme.gestures !== null || touchScheme.look) ? (
        <TouchPlaySurface
          scheme={touchScheme}
          sink={touchSink}
          yawRef={yawRef}
          pitchRef={pitchRef}
          maxPitch={playable.camera?.firstPerson?.maxPitch ?? 1.45}
          onPrimaryTap={() => {
            primaryClickRef.current = true;
          }}
        />
      ) : null}
      <GameUiErrorBoundary onRuntimeError={reportRuntimeError}>
        <GameProvider context={ctx}>
          <GamePhaseStamp />
          <HudViewportProvider
            platforms={playable.platforms}
            config={playable.hudFit}
            userScale={graphics.uiScale}
          >
            {orientationGate ? null : <GameUI />}
          </HudViewportProvider>
        </GameProvider>
      </GameUiErrorBoundary>
      {!poster && !orientationGate && showReticle ? <Reticle /> : null}
      {dockMounted && touchScheme !== null ? (
        <TouchControlsDock scheme={touchScheme} sink={touchSink} style={touchStyle} scale={touchScale} />
      ) : null}
      {orientationGateEl}
      {marquee !== null ? <MarqueeBox rect={marquee} /> : null}
      {contextMenu !== null ? (
        <ContextMenuView
          menu={contextMenu.menu}
          x={contextMenu.x}
          y={contextMenu.y}
          onPick={handleVerbPick}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
      {devtoolsEnabled ? (
        <DevtoolsOverlay open={devtoolsOpen} ctx={ctx} playable={playable} multiplayer={multiplayer} />
      ) : null}
      {poster ? null : <DiagnosticOverlay diagnostics={diagnostics} gameName={playable.game.name} />}
      {poster || orthographic || settingsHostsFov ? null : <PlayerFovSlider />}
      {poster ? null : <SettingsChrome />}
      </GameViewportProvider>
    </div>
    </SettingsRuntime>
    </PlayerFovProvider>
    </SettingsProvider>
  );
}
