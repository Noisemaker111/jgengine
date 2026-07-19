import { Canvas } from "@react-three/fiber";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type MutableRefObject,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react";

import {
  contextVerbInput,
  type ContextMenu,
  type ContextVerb,
} from "@jgengine/core/interaction/contextMenu";
import type { PointerAxisState } from "@jgengine/core/input/pointerAxis";
import type { ActionStateTracker } from "@jgengine/core/input/actionBindings";
import type { BindingOverrides } from "@jgengine/core/input/bindingOverrides";
import type { TouchScheme, TouchStyle } from "@jgengine/core/input/touchScheme";
import type { Aim } from "@jgengine/core/scene/spatial";
import {
  createSelectionSet,
  isMarquee,
  screenRect,
  selectWithinRect,
  type ScreenRect,
} from "@jgengine/core/scene/selection";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { DEFAULT_PICKUP_RADIUS } from "@jgengine/core/game/worldItem";
import type { PointerConfig } from "@jgengine/core/game/playableGame";
import { CAMERA_FRUSTUM_DEFAULTS } from "@jgengine/core/game/playableGame";
import type { GameSettingsConfig } from "@jgengine/core/settings/settingsModel";
import {
  BUILT_IN_SETTING_CATEGORIES,
  type GraphicsQuality,
  type SettingsStore,
} from "@jgengine/core/settings/settingsModel";
import { playControlsActive } from "@jgengine/core/game/controlGate";
import { sky as resolveSkyDescriptor } from "@jgengine/core/world/features";
import { resolveGameLook } from "@jgengine/core/render/lookPreset";
import type { PresencePoseRow } from "@jgengine/core/runtime/transport";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { GameViewportProvider } from "@jgengine/react/gameViewport";
import { GameProvider } from "@jgengine/react/provider";
import { SettingsProvider, type SettingsActionView } from "@jgengine/react/settings";

import { resolveWorldSky } from "./worldSky";
import { pointerAimFor, pointerContextMenu } from "./shellPointer";
import { AudioListener, EntityAudioEmitters, ObjectAudioEmitters } from "./audio/AudioComponents";
import type { AudioEngine } from "./audio/audioEngine";
import { PostProcessing } from "./postfx/PostProcessing";
import { EnvironmentLighting } from "./render/EnvironmentLighting";
import { CollisionDebugWorld } from "./devtools/CollisionDebugWorld";
import { DevtoolsRendererProbe } from "./devtools/DevtoolsOverlay";
import {
  CAMERA_TRANSPARENT_USERDATA,
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
import { Reticle, WorldEntityBars, WorldNameplates } from "./world/WorldHud";
import { GridWorldScene } from "./world/GridWorldScene";
import { PlaceScene } from "./world/PlaceScene";
import { WorldItems } from "./world/WorldItems";
import type { ShellMultiplayer } from "./multiplayer";
import type { PlayableGame } from "./registry";
import { TouchControlsDock, TouchPlaySurface, touchDockClearance } from "./touch/TouchControlsOverlay";
import { SettingsRuntime } from "./settings/SettingsRuntime";
import { SettingsChrome } from "./settings/SettingsChrome";
import { AudioSettingsBridge } from "./settings/appliedSettings";
import { ConfiguredLighting, BackdropFog } from "./render/SceneLighting";
import { WorldView, RemotePlayers } from "./world/WorldScene";
import { FrameDriver } from "./drivers/FrameDriver";
import type { RuntimeDiagnostic } from "./diagnostics/RuntimeDiagnostics";
import { createShellKeyHandlers, ShellDebugOverlays, ShellGameUiChrome } from "./ShellChrome";
import { CombatPresentation } from "./CombatPresentation";
import {
  resolvePresentationEffects,
  resolveWorldOverlayBars,
} from "./presentationResolve";

const PRIMARY_CLICK_MOVE_THRESHOLD_PX = 6;
const DEFAULT_BACKGROUND_COLOR = "#14161b";

/** 3D play surface: canvas, world overlays, and shared chrome. @internal */
export function Shell3dPresentation({
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
  primaryClickRef,
  cameraDraggingRef,
  serverIdRef,
  remotePlayers,
  touchScheme,
  touchSink,
  touchStyle,
  orientationGate,
  orientationGateEl,
  coarsePointer,
  compact,
  graphics,
  settingsStore,
  bindingOverrides,
  rebindAction,
  resetActionBinding,
  diagnostics,
  devtoolsEnabled,
  devtoolsOpen,
  setDevtoolsOpen,
  reportRuntimeError,
  trackPointerAxis,
  deactivatePointerAxis,
  audioEngine,
  poster,
  posterFrozen,
  onPosterSettled,
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
  primaryClickRef: MutableRefObject<boolean>;
  cameraDraggingRef: MutableRefObject<boolean>;
  serverIdRef: MutableRefObject<string | null>;
  remotePlayers: PresencePoseRow[];
  touchScheme: TouchScheme | null;
  touchSink: { onCodeDown: (code: string) => void; onCodeUp: (code: string) => void };
  touchStyle: TouchStyle;
  orientationGate: boolean;
  orientationGateEl: React.ReactNode;
  coarsePointer: boolean;
  compact: boolean;
  graphics: { shadows: boolean; dpr: number; uiScale: number; quality: GraphicsQuality };
  settingsStore: SettingsStore;
  bindingOverrides: BindingOverrides;
  rebindAction: (action: string, code: string) => void;
  resetActionBinding: (action: string) => void;
  diagnostics: RuntimeDiagnostic[];
  devtoolsEnabled: boolean;
  devtoolsOpen: boolean;
  setDevtoolsOpen: Dispatch<SetStateAction<boolean>>;
  reportRuntimeError: (error: unknown, phase: string, componentStack?: string) => void;
  trackPointerAxis: (event: { clientX: number; clientY: number }) => void;
  deactivatePointerAxis: () => void;
  audioEngine: AudioEngine;
  poster: boolean;
  posterFrozen: boolean;
  onPosterSettled: () => void;
}) {
  const GameUI = playable.GameUI;
  const WorldOverlay = playable.WorldOverlay;
  const pointerService = useMemo(() => createPointerService(), []);
  const selection = useMemo(() => createSelectionSet(), [playable]);
  const controlledEntityId = ctx.player.possession.active(ctx.player.userId);
  const cameraConfig =
    playable.camera?.followEntityId !== undefined
      ? playable.camera
      : { ...playable.camera, followEntityId: controlledEntityId };
  const rigKind = resolveRigKind(cameraConfig);
  const firstPerson = rigKind === "first";
  const showReticle =
    (firstPerson && playable.camera?.firstPerson?.reticle !== false) || rigKind === "shoulder";
  const rtsPanKeysEnabled = !rtsPanKeysConflict(playable.game.input);
  const bars = resolveWorldOverlayBars(playable.worldHealthBars);
  const nameplates = resolveWorldOverlayBars(playable.nameplates);
  const effects = resolvePresentationEffects(playable.presentationEffects);
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
      : world?.kind === "place"
        ? () => <PlaceScene feature={world} />
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

  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<ScreenRect | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<{ menu: ContextMenu; x: number; y: number } | null>(null);

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

  /** DOM UI sits in the same wrapper as the canvas — only canvas-targeted clicks are world input. */
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

  const keys = createShellKeyHandlers({
    f2HeldRef,
    tracker,
    devtoolsEnabled,
    setDevtoolsOpen,
    controlsActive: () => playControlsActive(ctx),
    exitPointerLockOnDevtools: true,
  });

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
            onKeyDown={keys.onKeyDown}
            onKeyUp={keys.onKeyUp}
            onBlur={keys.onBlur}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={deactivatePointerAxis}
            onPointerCancel={deactivatePointerAxis}
            onContextMenu={handleContextMenu}
            onWheel={(event) => {
              if (!event.shiftKey) return;
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
                dpr={[Math.min(1, graphics.dpr), graphics.dpr]}
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
                  {WorldOverlay !== undefined ? (
                    // Author decor is presentation dressing, not collision geometry — mark it
                    // camera-transparent so the orbit spring-arm never yanks toward it. A child
                    // that should block the camera opts back in with userData.jgCameraCollide.
                    <group userData={CAMERA_TRANSPARENT_USERDATA}>
                      <WorldOverlay ctx={ctx} />
                    </group>
                  ) : null}
                  {bars !== null ? (
                    <WorldEntityBars
                      statId={bars.statId}
                      roles={bars.roles}
                      resolveRole={resolveEntityRole}
                      {...(bars.maxDistance === undefined ? {} : { maxDistance: bars.maxDistance })}
                    />
                  ) : null}
                  {nameplates !== null ? (
                    <WorldNameplates
                      statId={nameplates.statId}
                      roles={nameplates.roles}
                      resolveRole={resolveEntityRole}
                      {...(nameplates.maxDistance === undefined ? {} : { maxDistance: nameplates.maxDistance })}
                    />
                  ) : null}
                  <WorldItems config={playable.worldItem} />
                  <CombatPresentation effects={effects} />
                  {devtoolsEnabled ? <CollisionDebugWorld /> : null}
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
                  onPosterSettled={onPosterSettled}
                />
                <DevtoolsRendererProbe />
                {resolvedLook.postProcessing !== undefined && resolvedLook.postProcessing.enabled !== false ? (
                  <PostProcessing config={resolvedLook.postProcessing} quality={graphics.quality} />
                ) : null}
              </Canvas>
              {!poster &&
              !orientationGate &&
              coarsePointer &&
              controlsActive &&
              touchScheme !== null &&
              (touchScheme.gestures !== null || touchScheme.look) ? (
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
              <ShellGameUiChrome
                ctx={ctx}
                playable={playable}
                GameUI={GameUI}
                uiScale={graphics.uiScale}
                orientationGate={orientationGate}
                onRuntimeError={reportRuntimeError}
              />
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
              <ShellDebugOverlays
                ctx={ctx}
                playable={playable}
                multiplayer={multiplayer}
                diagnostics={diagnostics}
                devtoolsEnabled={devtoolsEnabled}
                devtoolsOpen={devtoolsOpen}
                hideDiagnostics={poster}
              />
              {poster || orthographic || settingsHostsFov ? null : <PlayerFovSlider />}
              {poster ? null : <SettingsChrome />}
            </GameViewportProvider>
          </div>
        </SettingsRuntime>
      </PlayerFovProvider>
    </SettingsProvider>
  );
}
