import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";

import type { EditorCatalogDefinition, EditorDocument, EditorLayersInput } from "@jgengine/core/editor/index";
import { editorDocumentBounds, findEditorMarker } from "@jgengine/core/editor/index";
import { getSaveEndpoint } from "@jgengine/core/devtools/saveEndpoint";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import type { WorldFeature } from "@jgengine/core/world/features";
import type { GuideRegion } from "@jgengine/core/world/terrainGuides";
import type { EditorUiPanelLayout } from "@jgengine/core/ui/hudDocument";
import { listActiveHudLayouts, subscribeActiveHudLayouts } from "@jgengine/core/ui/hudLayout";
import { HudLayoutPersistProvider } from "@jgengine/react/hudLayoutPersist";
import { useGameContext } from "@jgengine/react/provider";
import { GamePlayerShell } from "@jgengine/shell/GamePlayerShell";
import type { PlayableGame } from "@jgengine/shell/registry";

import { assetsFromCatalog, type EditorAssetEntry } from "./AssetBrowser";
import { EditorCameraDriver } from "./EditorCameraDriver";
import { EditorChrome } from "./EditorChrome";
import { EditorLayerOverlays, PathDraftPreview } from "./DebugDraw";
import { MaterialDropZone } from "./MaterialDropZone";
import { PerfProbe } from "./PerfProbe";
import { ScatterPreview } from "./ScatterPreview";
import { CityPreview } from "./CityPreview";
import { SelectionGizmo, ViewportSelect } from "./SelectionGizmo";
import { TerrainReadout } from "./TerrainReadout";
import { TerrainReadoutHud } from "./TerrainReadoutHud";
import { TerrainSculpt } from "./TerrainSculpt";
import { createTerrainReadoutStore, type TerrainReadoutStore } from "./terrainReadoutStore";
import { RuntimePlayInspectorChrome, RuntimePlayPublisher } from "./RuntimePlayBridge";
import { createEditorHost, type EditorHostApi, type EditorRunMode } from "./session";
import { createEditorUiStore, type EditorUiStore, type GizmoSpace, type SnapMode } from "./uiStore";
import { useF2Chord } from "./useF2Chord";
import { shallowArrayEqual, useStoreSelector } from "./useStoreSelector";

/** Props for mounting the scene editor over a playable game. */
export interface EditorAppProps {
  gameId: string;
  playable: PlayableGame;
  /** Layers to open. Defaults to `playable.editorLayers`, so a game shipping its document via `defineGame({ editorLayers })` needs no extra wiring. */
  layers?: EditorLayersInput;
  /** Game-exported gameplay catalog definitions (schemas + defaults) for the Data panel / catalog RPC. */
  catalogs?: readonly EditorCatalogDefinition[];
  save?: EditorSaveFn;
  /** Skin for the play/walk escape chip. Omit for the default pill; pass `null` to hide it (F2+E still exits); pass a component to place the game's own. */
  modeChip?: ComponentType<{ mode: EditorRunMode; onExit: () => void }> | null;
}

/** Persists an exported document JSON; resolves with where it landed or why it failed. */
export type EditorSaveFn = (json: string) => Promise<{ ok: boolean; path?: string; error?: string }>;

function endpointSaver(gameId: string): EditorSaveFn | undefined {
  const endpoint = getSaveEndpoint();
  if (endpoint === null) return undefined;
  return async (json) => {
    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "editor-document", gameId, json }),
      });
      return (await response.json()) as { ok: boolean; path?: string; error?: string };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };
}

interface StoredEditorPrefs {
  visibility?: Record<string, boolean>;
  gizmoSpace?: GizmoSpace;
  snapMode?: SnapMode;
  gridSize?: number;
  rotationSnapDeg?: number | null;
  scaleSnap?: number | null;
  showGrid?: boolean;
  showContours?: boolean;
  showSurfaceGrid?: boolean;
  showElevation?: boolean;
}

function prefsKey(gameId: string): string {
  return `jgeditor:prefs:${gameId}`;
}

function draftKey(gameId: string): string {
  return `jgeditor:draft:${gameId}`;
}

function readDraft(gameId: string): string | null {
  try {
    return localStorage.getItem(draftKey(gameId));
  } catch {
    return null;
  }
}

function writeDraft(gameId: string, json: string | null): void {
  try {
    if (json === null) localStorage.removeItem(draftKey(gameId));
    else localStorage.setItem(draftKey(gameId), json);
  } catch {
    return;
  }
}

const DRAFT_DEBOUNCE_MS = 800;

function loadPrefs(gameId: string): StoredEditorPrefs {
  try {
    const raw = localStorage.getItem(prefsKey(gameId));
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as StoredEditorPrefs;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function savePrefs(gameId: string, prefs: StoredEditorPrefs): void {
  try {
    localStorage.setItem(prefsKey(gameId), JSON.stringify(prefs));
  } catch {
    return;
  }
}

/** Default readout region half-extent when a world declares no terrain bounds. */
const DEFAULT_READOUT_HALF = 64;

/**
 * Derives the XZ region the terrain-readability overlay samples: the sculpt snapshot's rect if the
 * world carries one, else the terrain descriptor's centered bounds, else a default square. Guides are
 * editor visualization, not authored content — the region is inferred, never stored in the scene.
 */
function readoutRegionFor(world: WorldFeature | undefined): GuideRegion {
  if (world !== undefined && world.kind === "environment") {
    const sculpt = world.sculpt;
    if (sculpt !== undefined) {
      return { minX: sculpt.bounds.minX, minZ: sculpt.bounds.minZ, maxX: sculpt.bounds.maxX, maxZ: sculpt.bounds.maxZ };
    }
    const bounds = world.terrain?.bounds;
    if (bounds !== undefined) {
      return { minX: -bounds.w / 2, minZ: -bounds.d / 2, maxX: bounds.w / 2, maxZ: bounds.d / 2 };
    }
  }
  return { minX: -DEFAULT_READOUT_HALF, minZ: -DEFAULT_READOUT_HALF, maxX: DEFAULT_READOUT_HALF, maxZ: DEFAULT_READOUT_HALF };
}

/** Idle window before the terrain overlay rebuilds off the edited field — bounds rebuild frequency during sculpting. */
const READOUT_REBUILD_MS = 250;

function EditorWorldOverlay({
  api,
  ui,
  world,
  readout,
}: {
  api: EditorHostApi;
  ui: EditorUiStore;
  world?: WorldFeature;
  readout: TerrainReadoutStore;
}) {
  const session = api.getSession();
  const ctx = useGameContext();
  const visibilityStore = useMemo(
    () => ({ getState: api.getVisibility, subscribe: api.subscribeVisibility }),
    [api],
  );

  const document = useStoreSelector(session, (s) => s.document);
  const selection = useStoreSelector(session, (s) => s.selection, shallowArrayEqual);
  const visibility = useStoreSelector(visibilityStore, (v) => v);
  const showGrid = useStoreSelector(ui, (s) => s.showGrid);
  const showContours = useStoreSelector(ui, (s) => s.showContours);
  const showSurfaceGrid = useStoreSelector(ui, (s) => s.showSurfaceGrid);
  const showElevation = useStoreSelector(ui, (s) => s.showElevation);
  const pathPoint = useStoreSelector(ui, (s) => s.pathPoint);
  const pathDraft = useStoreSelector(ui, (s) => s.pathDraft);
  const groundHeightAt = useCallback((x: number, z: number) => ctx.world.groundHeightAt(x, z), [ctx.world]);

  // Publish the live composed ground field so the `bake_minimap` RPC can rasterize authored terrain.
  // Only available while the viewport is mounted; the cleanup nulls it so headless callers get null.
  useEffect(() => {
    api.setTerrainSampler(ctx.world.ground);
    return () => api.setTerrainSampler(null);
  }, [api, ctx.world]);

  const readoutRegion = useMemo(() => readoutRegionFor(world), [world]);
  const readoutActive = showContours || showSurfaceGrid || showElevation;
  // Debounced terrain version: rebuilds the overlay after sculpt edits settle, not every stroke frame.
  const [terrainVersion, setTerrainVersion] = useState(0);
  useEffect(() => {
    if (!readoutActive) return;
    setTerrainVersion((value) => value + 1);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = session.subscribe(() => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => setTerrainVersion((value) => value + 1), READOUT_REBUILD_MS);
    });
    return () => {
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
    };
  }, [session, readoutActive]);

  return (
    <>
      <PerfProbe api={api} />
      <EditorCameraDriver api={api} />
      <ViewportSelect api={api} ui={ui} />
      <MaterialDropZone api={api} />
      <TerrainSculpt api={api} ui={ui} world={world} />
      <ScatterPreview api={api} />
      <CityPreview api={api} />
      {showGrid ? <gridHelper args={[400, 80, "#3b4252", "#20242e"]} position={[0, 0.05, 0]} /> : null}
      {readoutActive ? (
        <TerrainReadout
          groundHeightAt={groundHeightAt}
          region={readoutRegion}
          showContours={showContours}
          showSurfaceGrid={showSurfaceGrid}
          version={terrainVersion}
          readout={readout}
        />
      ) : null}
      <EditorLayerOverlays
        document={document}
        visibility={visibility}
        selection={selection}
        onSelect={(id) => session.dispatch({ type: "select", ids: [id] })}
        activePathPoint={pathPoint}
        groundHeightAt={groundHeightAt}
      />
      {pathDraft.length > 0 ? <PathDraftPreview points={pathDraft} /> : null}
      <SelectionGizmo session={session} ui={ui} groundSnap={groundHeightAt} />
    </>
  );
}

/** Default skin for the play/walk escape chip; swap via `EditorAppProps.modeChip`, or pass `null` to hide it (F2+E still exits). */
function EditorModeChip({ mode, onExit }: { mode: EditorRunMode; onExit: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-50 flex justify-center">
      <button
        type="button"
        className="pointer-events-auto rounded-full border border-white/10 bg-black/70 px-4 py-1.5 text-[11px] text-neutral-100 shadow-lg shadow-black/40 backdrop-blur-md transition-colors hover:bg-black/90"
        onClick={onExit}
      >
        {mode === "play" ? "▶ Playing" : "🚶 Walking"} — back to editor (F2+E)
      </button>
    </div>
  );
}

/** Headless placement: wires the F2+E exit chord and renders `chip` (the default skin, a
 * game-supplied override, or nothing when `chip` is `null`) — the chord always works either way. */
function EditorModeChipHost({
  api,
  mode,
  chip,
}: {
  api: EditorHostApi;
  mode: EditorRunMode;
  chip: ComponentType<{ mode: EditorRunMode; onExit: () => void }> | null;
}) {
  const onExit = useCallback(() => api.setMode("edit"), [api]);
  useF2Chord("KeyE", onExit);
  if (chip === null) return null;
  const Chip = chip;
  return <Chip mode={mode} onExit={onExit} />;
}

/**
 * HUD-layout authoring surface, mounted in `hud` run mode over the game's real `HudCanvas`.
 * Enables drag/resize editing on every mounted HUD layout (including ones that mount after this
 * opens), so panel placement is reachable straight from the editor — no separate F2+C chord. Layout
 * edits flow through the injected `HudLayoutPersistProvider` (`onPanelCommit` → undoable
 * `setUiPanel`). When the author finishes (the canvas "Done" button, Esc, or F2+C toggles editing
 * off), HUD mode exits back to edit. F2+E also exits. Editing is turned back off for every layout on
 * unmount.
 */
function HudLayoutEditingHost({ api }: { api: EditorHostApi }) {
  const exit = useCallback(() => api.setMode("edit"), [api]);
  useF2Chord("KeyE", exit);
  useEffect(() => {
    const tracked = new Map<ReturnType<typeof listActiveHudLayouts>[number], () => void>();
    let disposed = false;
    const arm = (layout: ReturnType<typeof listActiveHudLayouts>[number]) => {
      if (tracked.has(layout)) return;
      // Force editing on first, then watch: a later transition back to `editing: false`
      // (author pressed Done/Esc/F2+C) is the signal to leave HUD mode.
      layout.setEditing(true);
      const unsubscribe = layout.subscribe((state) => {
        if (!disposed && !state.editing) exit();
      });
      tracked.set(layout, unsubscribe);
    };
    const sync = () => {
      for (const layout of listActiveHudLayouts()) arm(layout);
    };
    sync();
    const unsubscribeRegistry = subscribeActiveHudLayouts(sync);
    return () => {
      disposed = true;
      unsubscribeRegistry();
      for (const [layout, unsubscribe] of tracked) {
        unsubscribe();
        layout.setEditing(false);
      }
    };
  }, [exit]);
  const hasPanels = listActiveHudLayouts().length > 0;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[60] flex justify-center">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-black/80 px-4 py-1.5 text-[11px] text-neutral-100 shadow-lg shadow-black/40 backdrop-blur-md">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
          {hasPanels ? "HUD layout — drag panels to place; edits save to the scene" : "This game mounts no HUD panels to lay out"}
        </span>
        <button
          type="button"
          className="rounded-full bg-white/[0.06] px-2.5 py-1 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/15"
          onClick={exit}
        >
          Done (F2+E)
        </button>
      </div>
    </div>
  );
}

/** Prefer a grounded spawn for the first shot — full-world framing clips past default far=300. */
function resolveEditorCamera(document: EditorDocument): {
  target: { x: number; y: number; z: number };
  span: number;
  far: number;
} {
  const spawn =
    findEditorMarker(document, "player_spawn") ??
    findEditorMarker(document, "car_start") ??
    document.markers[0];
  const bounds = editorDocumentBounds(document);
  const worldSpan =
    bounds === null
      ? 200
      : Math.max(80, Math.hypot(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) * 0.55);

  if (spawn !== undefined) {
    return {
      target: { x: spawn.position.x, y: spawn.position.y + 8, z: spawn.position.z },
      span: Math.min(180, Math.max(60, worldSpan * 0.12)),
      far: Math.max(4000, worldSpan * 4),
    };
  }
  if (bounds === null) {
    return { target: { x: 0, y: 12, z: 0 }, span: 80, far: 4000 };
  }
  return {
    target: {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2 + 12,
      z: (bounds.min.z + bounds.max.z) / 2,
    },
    span: Math.min(220, worldSpan),
    far: Math.max(4000, worldSpan * 4),
  };
}

/** Top-level scene editor: author spawns/zones/paths/notes visually over edit, walk, or play modes. */
export function EditorApp({ gameId, playable, layers, catalogs, save, modeChip }: EditorAppProps) {
  const resolvedModeChip = modeChip === undefined ? EditorModeChip : modeChip;
  const saveFn = useMemo(() => save ?? endpointSaver(gameId), [save, gameId]);
  const uiStoreRef = useRef<EditorUiStore | null>(null);
  if (uiStoreRef.current === null) uiStoreRef.current = createEditorUiStore();
  const ui = uiStoreRef.current;
  const readoutStoreRef = useRef<TerrainReadoutStore | null>(null);
  if (readoutStoreRef.current === null) readoutStoreRef.current = createTerrainReadoutStore();
  const readout = readoutStoreRef.current;
  const [mode, setModeState] = useState<EditorRunMode>("edit");

  const catalogAssets = useMemo(() => {
    try {
      const ids = playable.game.assets.ids();
      return assetsFromCatalog(ids, (id) => playable.game.assets.resolve(id));
    } catch {
      return [] as EditorAssetEntry[];
    }
  }, [playable]);

  const resolvedLayers = layers ?? playable.editorLayers;
  const host = useMemo(() => {
    const created = createEditorHost({
      gameId,
      layers: resolvedLayers,
      catalogs,
      assets: catalogAssets,
    });
    return {
      ...created,
      baselineJson: created.session.exportJson(true),
      baselineDocument: created.session.getState().document,
    };
  }, [gameId, resolvedLayers, catalogs, catalogAssets]);

  useEffect(() => host.dispose, [host]);

  useEffect(() => host.api.subscribeMode(setModeState), [host]);

  const [pendingDraft, setPendingDraft] = useState<string | null>(null);

  useEffect(() => {
    const draft = readDraft(gameId);
    if (draft !== null && draft !== host.baselineJson) setPendingDraft(draft);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = host.session.subscribe(() => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        const json = host.session.exportJson(true);
        writeDraft(gameId, json === host.baselineJson ? null : json);
      }, DRAFT_DEBOUNCE_MS);
    });
    return () => {
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
    };
  }, [gameId, host]);

  const restoreDraft = () => {
    if (pendingDraft === null) return;
    try {
      host.session.dispatch({ type: "importJson", json: pendingDraft });
    } catch {
      writeDraft(gameId, null);
    }
    setPendingDraft(null);
  };
  const discardDraft = () => {
    writeDraft(gameId, null);
    setPendingDraft(null);
  };

  useEffect(() => {
    const prefs = loadPrefs(gameId);
    if (prefs.visibility !== undefined) {
      host.api.setVisibility({ ...host.api.getVisibility(), ...prefs.visibility });
    }
    ui.patch({
      ...(prefs.gizmoSpace === undefined ? {} : { gizmoSpace: prefs.gizmoSpace }),
      ...(prefs.snapMode === undefined ? {} : { snapMode: prefs.snapMode }),
      ...(prefs.gridSize === undefined ? {} : { gridSize: prefs.gridSize }),
      ...(prefs.rotationSnapDeg === undefined ? {} : { rotationSnapDeg: prefs.rotationSnapDeg }),
      ...(prefs.scaleSnap === undefined ? {} : { scaleSnap: prefs.scaleSnap }),
      ...(prefs.showGrid === undefined ? {} : { showGrid: prefs.showGrid }),
      ...(prefs.showContours === undefined ? {} : { showContours: prefs.showContours }),
      ...(prefs.showSurfaceGrid === undefined ? {} : { showSurfaceGrid: prefs.showSurfaceGrid }),
      ...(prefs.showElevation === undefined ? {} : { showElevation: prefs.showElevation }),
    });
    const persist = () => {
      const state = ui.getState();
      savePrefs(gameId, {
        visibility: host.api.getVisibility(),
        gizmoSpace: state.gizmoSpace,
        snapMode: state.snapMode,
        gridSize: state.gridSize,
        rotationSnapDeg: state.rotationSnapDeg,
        scaleSnap: state.scaleSnap,
        showGrid: state.showGrid,
        showContours: state.showContours,
        showSurfaceGrid: state.showSurfaceGrid,
        showElevation: state.showElevation,
      });
    };
    const unsubscribeVisibility = host.api.subscribeVisibility(persist);
    const unsubscribeUi = ui.subscribe(persist);
    return () => {
      unsubscribeVisibility();
      unsubscribeUi();
    };
  }, [gameId, host, ui]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.jgEditor = "1";
    document.documentElement.dataset.jgEditorGame = gameId;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.dataset.jgFrameReady = "1";
        if (document.documentElement.dataset.jgCapture === "preparing") {
          document.documentElement.dataset.jgCapture = "ready";
        }
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      delete document.documentElement.dataset.jgEditor;
      delete document.documentElement.dataset.jgEditorGame;
    };
  }, [gameId]);

  const initialCamera = useMemo(
    () => resolveEditorCamera(host.session.getState().document),
    [host],
  );

  const editorPlayable: PlayableGame = useMemo(() => {
    const frozenLoop = {
      onInit: playable.loop.onInit,
      onNewPlayer: playable.loop.onNewPlayer,
      onTick: () => {
        // Placement/walk views freeze combat/AI so the frame isn't burned on sim.
      },
      onPlayerLeave: playable.loop.onPlayerLeave,
      onReset: playable.loop.onReset,
      onDispose: playable.loop.onDispose,
    };

    const { target, span, far } = initialCamera;
    // Free-orbit inspection camera shared by edit and HUD-layout modes: no pointer lock, so the HUD
    // panels stay draggable while the authored world renders behind them.
    const inspectionCamera = {
      rig: "inspection" as const,
      frustum: { fov: 55, near: 0.5, far },
      inspection: {
        target,
        initialDistance: span,
        initialPosition: {
          x: target.x + span * 0.35,
          y: target.y + span * 0.55,
          z: target.z + span * 0.75,
        },
        minDistance: 4,
        maxDistance: Math.max(far * 0.9, span * 8),
        pan: true,
        rotateSpeed: 0.7,
        zoomSpeed: 1.1,
        minPolarAngle: 0.15,
        maxPolarAngle: Math.PI * 0.48,
      },
    };

    if (mode === "hud") {
      const BaseUI = playable.GameUI;
      return {
        ...playable,
        GameUI: function EditorHudUi() {
          return (
            <>
              {BaseUI !== undefined ? <BaseUI /> : null}
              <HudLayoutEditingHost api={host.api} />
            </>
          );
        },
        WorldOverlay: function EditorHudOverlay() {
          return <PerfProbe api={host.api} />;
        },
        shadows: false,
        loop: frozenLoop,
        camera: inspectionCamera,
      };
    }

    if (mode === "play") {
      const BaseUI = playable.GameUI;
      const BaseOverlay = playable.WorldOverlay;
      const useBuiltinPlayChrome = resolvedModeChip === EditorModeChip;
      return {
        ...playable,
        GameUI: function EditorPlayUi() {
          const onExit = useCallback(() => host.api.setMode("edit"), []);
          useF2Chord("KeyE", onExit);
          return (
            <>
              {BaseUI !== undefined ? <BaseUI /> : null}
              {useBuiltinPlayChrome ? (
                <RuntimePlayInspectorChrome api={host.api} onExit={onExit} />
              ) : (
                <EditorModeChipHost api={host.api} mode="play" chip={resolvedModeChip} />
              )}
            </>
          );
        },
        WorldOverlay: function EditorPlayOverlay({ ctx }: WorldOverlayProps) {
          return (
            <>
              {BaseOverlay !== undefined ? <BaseOverlay ctx={ctx} /> : null}
              <PerfProbe api={host.api} />
              <RuntimePlayPublisher api={host.api} />
            </>
          );
        },
      };
    }

    if (mode === "walk") {
      return {
        ...playable,
        GameUI: function EditorWalkUi() {
          return <EditorModeChipHost api={host.api} mode="walk" chip={resolvedModeChip} />;
        },
        WorldOverlay: function EditorWalkOverlay() {
          const ctx = useGameContext();
          return (
            <>
              <PerfProbe api={host.api} />
              <EditorLayerOverlays
                document={host.api.getSession().getState().document}
                visibility={host.api.getVisibility()}
                selection={host.api.getSession().getState().selection}
                onSelect={() => {}}
                groundHeightAt={(x, z) => ctx.world.groundHeightAt(x, z)}
              />
            </>
          );
        },
        loop: frozenLoop,
      };
    }

    const WorldOverlay: ComponentType = function EditorOverlay() {
      return <EditorWorldOverlay api={host.api} ui={ui} world={playable.game.world} readout={readout} />;
    };
    const GameUI: ComponentType = function EditorUi() {
      return <EditorChrome gameId={gameId} session={host.api.getSession()} api={host.api} assets={catalogAssets} ui={ui} baselineDocument={host.baselineDocument} save={saveFn} />;
    };
    return {
      ...playable,
      GameUI,
      WorldOverlay,
      shadows: false,
      loop: frozenLoop,
      // Drop FPS gun chrome; keep world only.
      // WorldOverlay above is the editor layers, not PandoraViewmodel.
      camera: inspectionCamera,
    };
  }, [playable, host, gameId, initialCamera, catalogAssets, ui, readout, mode, saveFn, resolvedModeChip]);

  const showElevation = useStoreSelector(ui, (s) => s.showElevation);

  const onPanelCommit = useCallback(
    (id: string, panel: EditorUiPanelLayout) => {
      host.session.dispatch({ type: "setUiPanel", id, patch: panel });
    },
    [host],
  );

  return (
    <div className="relative h-full w-full bg-neutral-950" data-jg-editor="1" data-jg-editor-game={gameId}>
      <HudLayoutPersistProvider onPanelCommit={onPanelCommit}>
        <GamePlayerShell playable={editorPlayable} />
      </HudLayoutPersistProvider>
      {mode === "edit" && showElevation ? <TerrainReadoutHud readout={readout} /> : null}
      {pendingDraft !== null && mode === "edit" ? (
        <div className="absolute left-1/2 top-14 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-950/90 px-4 py-2 text-xs text-amber-100 shadow-2xl shadow-black/50 backdrop-blur-md">
          <span>Unsaved edits from a previous session found.</span>
          <button type="button" className="rounded-md bg-gradient-to-b from-amber-500 to-amber-600 px-2.5 py-1 font-semibold text-white shadow-md shadow-amber-950/50 transition-colors hover:from-amber-400 hover:to-amber-500" onClick={restoreDraft}>Restore</button>
          <button type="button" className="rounded-md bg-white/[0.07] px-2.5 py-1 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/15" onClick={discardDraft}>Discard</button>
        </div>
      ) : null}
    </div>
  );
}
