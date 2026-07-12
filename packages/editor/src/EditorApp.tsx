import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";

import type { EditorDocument, EditorLayersInput } from "@jgengine/core/editor/index";
import { editorDocumentBounds, findEditorMarker } from "@jgengine/core/editor/index";
import { useGameContext } from "@jgengine/react/provider";
import { GamePlayerShell } from "@jgengine/shell/GamePlayerShell";
import type { PlayableGame } from "@jgengine/shell/registry";

import { assetsFromCatalog, type EditorAssetEntry } from "./AssetBrowser";
import { EditorCameraDriver } from "./EditorCameraDriver";
import { EditorChrome } from "./EditorChrome";
import { EditorLayerOverlays } from "./DebugDraw";
import { PerfProbe } from "./PerfProbe";
import { SelectionGizmo, ViewportSelect, type GizmoMode } from "./SelectionGizmo";
import { createEditorHost, type EditorHostApi, type EditorRunMode } from "./session";

/** Props for mounting the scene editor over a playable game. */
export interface EditorAppProps {
  gameId: string;
  playable: PlayableGame;
  layers?: EditorLayersInput;
}

type GizmoStore = {
  mode: GizmoMode;
  listeners: Set<() => void>;
  setMode: (mode: GizmoMode) => void;
  subscribe: (listener: () => void) => () => void;
};

function createGizmoStore(initial: GizmoMode = "translate"): GizmoStore {
  const listeners = new Set<() => void>();
  const store: GizmoStore = {
    mode: initial,
    listeners,
    setMode(mode) {
      store.mode = mode;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return store;
}

function useGizmoMode(store: GizmoStore): GizmoMode {
  const [mode, setMode] = useState(store.mode);
  useEffect(() => store.subscribe(() => setMode(store.mode)), [store]);
  return mode;
}

function EditorWorldOverlay({ api, gizmoStore }: { api: EditorHostApi; gizmoStore: GizmoStore }) {
  const session = api.getSession();
  const ctx = useGameContext();
  const gizmoMode = useGizmoMode(gizmoStore);
  const [, setTick] = useState(0);
  useEffect(() => session.subscribe(() => setTick((value) => value + 1)), [session]);
  useEffect(() => api.subscribeVisibility(() => setTick((value) => value + 1)), [api]);
  const state = session.getState();

  return (
    <>
      <PerfProbe api={api} />
      <EditorCameraDriver api={api} />
      <ViewportSelect api={api} />
      <EditorLayerOverlays
        document={state.document}
        visibility={api.getVisibility()}
        selection={state.selection}
        onSelect={(id) => session.dispatch({ type: "select", ids: [id] })}
      />
      <SelectionGizmo
        session={session}
        mode={gizmoMode}
        groundSnap={(x, z) => ctx.world.groundHeightAt(x, z)}
      />
    </>
  );
}

function EditorHud({
  gameId,
  api,
  assets,
  gizmoStore,
}: {
  gameId: string;
  api: EditorHostApi;
  assets: readonly EditorAssetEntry[];
  gizmoStore: GizmoStore;
}) {
  const gizmoMode = useGizmoMode(gizmoStore);
  return (
    <EditorChrome
      gameId={gameId}
      session={api.getSession()}
      api={api}
      assets={assets}
      gizmoMode={gizmoMode}
      setGizmoMode={gizmoStore.setMode}
    />
  );
}

/** Escape hatch shown while playing/walking: F8 (or click) returns to the edit view. */
function EditorModeChip({ api, mode }: { api: EditorHostApi; mode: EditorRunMode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "F8") return;
      event.preventDefault();
      api.setMode("edit");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-50 flex justify-center">
      <button
        type="button"
        className="pointer-events-auto rounded-full border border-white/20 bg-black/70 px-3 py-1 text-[11px] text-neutral-100 backdrop-blur hover:bg-black/90"
        onClick={() => api.setMode("edit")}
      >
        {mode === "play" ? "▶ Playing" : "🚶 Walking"} — back to editor (F8)
      </button>
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

/** Top-level scene editor: place spawns/zones/paths visually over edit, walk, or play modes. */
export function EditorApp({ gameId, playable, layers }: EditorAppProps) {
  const gizmoStoreRef = useRef<GizmoStore | null>(null);
  if (gizmoStoreRef.current === null) gizmoStoreRef.current = createGizmoStore();
  const gizmoStore = gizmoStoreRef.current;
  const [mode, setModeState] = useState<EditorRunMode>("edit");

  const catalogAssets = useMemo(() => {
    try {
      const ids = playable.game.assets.ids();
      return assetsFromCatalog(ids, (id) => playable.game.assets.resolve(id));
    } catch {
      return [] as EditorAssetEntry[];
    }
  }, [playable]);

  const host = useMemo(
    () =>
      createEditorHost({
        gameId,
        layers,
        assets: catalogAssets,
      }),
    [gameId, layers, catalogAssets],
  );

  useEffect(() => host.dispose, [host]);

  useEffect(() => host.api.subscribeMode(setModeState), [host]);

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
    };

    if (mode === "play") {
      const BaseUI = playable.GameUI;
      const BaseOverlay = playable.WorldOverlay;
      return {
        ...playable,
        GameUI: function EditorPlayUi() {
          return (
            <>
              {BaseUI !== undefined ? <BaseUI /> : null}
              <EditorModeChip api={host.api} mode="play" />
            </>
          );
        },
        WorldOverlay: function EditorPlayOverlay() {
          return (
            <>
              {BaseOverlay !== undefined ? <BaseOverlay /> : null}
              <PerfProbe api={host.api} />
            </>
          );
        },
      };
    }

    if (mode === "walk") {
      return {
        ...playable,
        GameUI: function EditorWalkUi() {
          return <EditorModeChip api={host.api} mode="walk" />;
        },
        WorldOverlay: function EditorWalkOverlay() {
          return (
            <>
              <PerfProbe api={host.api} />
              <EditorLayerOverlays
                document={host.api.getSession().getState().document}
                visibility={host.api.getVisibility()}
                selection={host.api.getSession().getState().selection}
                onSelect={() => {}}
              />
            </>
          );
        },
        loop: frozenLoop,
      };
    }

    const WorldOverlay: ComponentType = function EditorOverlay() {
      return <EditorWorldOverlay api={host.api} gizmoStore={gizmoStore} />;
    };
    const GameUI: ComponentType = function EditorUi() {
      return (
        <EditorHud gameId={gameId} api={host.api} assets={catalogAssets} gizmoStore={gizmoStore} />
      );
    };
    const { target, span, far } = initialCamera;
    return {
      ...playable,
      GameUI,
      WorldOverlay,
      shadows: false,
      loop: frozenLoop,
      // Drop FPS gun chrome; keep world only.
      // WorldOverlay above is the editor layers, not PandoraViewmodel.
      camera: {
        rig: "inspection",
        frustum: {
          fov: 55,
          near: 0.5,
          far,
        },
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
      },
    };
  }, [playable, host, gameId, initialCamera, catalogAssets, gizmoStore, mode]);

  return (
    <div className="relative h-full w-full bg-neutral-950" data-jg-editor="1" data-jg-editor-game={gameId}>
      <GamePlayerShell playable={editorPlayable} />
    </div>
  );
}
