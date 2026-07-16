import { useEffect, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";

import { devtools } from "@jgengine/core/devtools/devtools";
import type { GameCameraConfig } from "@jgengine/core/game/playableGame";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { applyStoredDevtoolsOverrides } from "@jgengine/shell/devtools/DevtoolsOverlay";
import { GamePlayerShell } from "@jgengine/shell/GamePlayerShell";
import { GameUiPreview, type UiPreviewScenario } from "@jgengine/shell/GameUiPreview";
import { resolveConvexMultiplayer } from "@jgengine/convex/resolveConvexMultiplayer";
import {
  resolvePeerShellMultiplayer,
  resolveShellMultiplayer,
  type ShellMultiplayer,
} from "@jgengine/shell/multiplayer";
import type { GameRegistry, PlayableGame } from "@jgengine/shell/registry";

import { installSaveEndpoint } from "@jgengine/core/devtools/saveEndpoint";

import { armCaptureReady, captureArmed, installPlaytestProbe, setCaptureStatus } from "./captureReady";
import "./index.css";

const CAMERA_PRESETS: Record<string, GameCameraConfig> = {
  orbit: { rig: "orbit" },
  first: { rig: "first" },
  topdown: { rig: "topDown", topDown: { yaw: 0, pitch: 1.35, height: 20 } },
  iso: { rig: "topDown", topDown: { yaw: Math.PI / 4, pitch: 0.95, height: 18 } },
  rts: { rig: "rts", rts: { yaw: Math.PI / 5, pitch: 1.0, height: 22, panSpeed: 26 } },
  shoulder: { rig: "shoulder", shoulder: { shoulderOffset: 0.7, distance: 3.4, heightOffset: 1.6 } },
  lockon: { rig: "lockOn", lockOn: { distance: 5.5, height: 2.6, framingBias: 0.55 } },
  chase: { rig: "chase", chase: { distance: 6.5, height: 2.8, fov: { base: 55, max: 82, speedForMax: 12 } } },
  cockpit: { rig: "chase", chase: { view: "cockpit" } },
  rear: { rig: "chase", chase: { view: "rear" } },
  observer: {
    rig: "observer",
    observer: { bind: { kind: "entity", entityId: "sensor-showcase-culprit" }, distance: 7, height: 3.5, orbitSpeed: 0.3 },
  },
  side2d: { rig: "sideScroll", projection: "orthographic" },
};

const gameModules = import.meta.glob<{
  game: PlayableGame;
  uiScenario?: UiPreviewScenario;
  editorLayers?: import("@jgengine/core/editor/index").EditorLayersInput;
  editorCatalogs?: import("@jgengine/core/editor/index").EditorCatalogsInput;
}>("../../../Games/*/src/index.tsx");

const gameStyleModules = import.meta.glob<Record<string, unknown>>("../../../Games/*/src/style.css");

const gameSourceModules = import.meta.glob<Record<string, unknown>>([
  "../../../Games/*/src/**/*.{ts,tsx}",
  "!**/main.tsx",
  "!**/*.test.*",
]);

async function discoverGameTunables(gameId: string, gameName: string): Promise<void> {
  const prefix = `../../../Games/${gameId}/src/`;
  const loaders = Object.entries(gameSourceModules).filter(([path]) => path.startsWith(prefix));
  const loaded = await Promise.all(
    loaders.map(async ([path, loader]) => {
      try {
        return await loader();
      } catch (error) {
        console.warn(`[jgengine:devtools] skipped ${path} during tunable discovery`, error);
        return null;
      }
    }),
  );
  for (const moduleExports of loaded) {
    if (moduleExports !== null) devtools.discover.scanModule(moduleExports);
  }
  applyStoredDevtoolsOverrides(gameName);
}

const gameLoaders = Object.entries(gameModules).map(
  ([path, loader]) => [path.split("/").at(-3)!, loader] as const,
);

const gameEntries = Object.fromEntries(
  gameLoaders.map(([id, loader]) => [id, () => loader().then((module) => module.game)]),
);

const editorSceneModules = import.meta.glob<{ default: unknown }>(
  "../../../Games/*/src/editor.scene.json",
);

const editorSceneRegistry: Partial<Record<string, () => Promise<unknown>>> = Object.fromEntries(
  Object.entries(editorSceneModules).map(([path, loader]) => [
    path.split("/").at(-3)!,
    () => loader().then((module) => module.default),
  ]),
);

const editorLayerRegistry: Partial<
  Record<string, () => Promise<import("@jgengine/core/editor/index").EditorLayersInput | undefined>>
> = Object.fromEntries(
  gameLoaders.map(([id, loader]) => [
    id,
    async () => {
      const [module, editorModule, savedScene] = await Promise.all([
        loader(),
        import("@jgengine/core/editor/index"),
        editorSceneRegistry[id]?.() ?? Promise.resolve(undefined),
      ]);
      if (savedScene === undefined) return module.editorLayers;
      const base = editorModule.normalizeEditorLayers(module.editorLayers ?? null);
      const overlay = editorModule.normalizeEditorLayers(
        savedScene as import("@jgengine/core/editor/index").EditorLayersInput,
      );
      return editorModule.applyEditorDocumentOverlay(base, overlay);
    },
  ]),
);

const gameRegistry: GameRegistry = {
  demo: () => import("./demo/demoGame").then((module) => module.demoGame),
  "pointer-commander": () =>
    import("./demo/pointerDemo").then((module) => module.pointerDemoGame),
  "environment-showcase": () =>
    import("./demo/environmentShowcase").then((module) => module.environmentShowcaseGame),
  "survival-demo": () =>
    import("./demo/survivalDemo").then((module) => module.survivalDemoGame),
  "builder-sandbox": () =>
    import("./demo/builderDemo").then((module) => module.builderDemoGame),
  "hud-showcase": () =>
    import("./demo/hudDemo").then((module) => module.hudShowcaseGame),
  "bookcase-stage": () =>
    import("./demo/bookcaseStageDemo").then((module) => module.bookcaseStageGame),
  "extraction-map": () => import("./demo/mapDemo").then((module) => module.mapDemoGame),
  "sensor-showcase": () =>
    import("./demo/sensorShowcase").then((module) => module.sensorShowcaseGame),
  "social-hub": () =>
    import("./demo/socialHubDemo").then((module) => module.socialHubGame),
  ...gameEntries,
};

const uiScenarioRegistry: Partial<Record<string, () => Promise<UiPreviewScenario | undefined>>> =
  Object.fromEntries(
    gameLoaders.map(([id, loader]) => [id, () => loader().then((module) => module.uiScenario)]),
  );

const urlParams = new URLSearchParams(window.location.search);
/** Explicit game only — bare `/` shows the picker so demo is never a silent surprise. */
const GAME_ID = urlParams.get("game") ?? (import.meta.env.VITE_GAME_ID as string | undefined) ?? null;
/** Gameless scene editor — the site embeds this at /editor via /play/?editor=standalone. */
const EDITOR_STANDALONE = urlParams.get("editor") === "standalone";
const STATE_PARAM = urlParams.get("state");
const MODE = STATE_PARAM !== null ? "play" : (urlParams.get("mode") ?? "play");
if (import.meta.env.DEV && GAME_ID !== null) installSaveEndpoint("/__jgengine/save", GAME_ID);
const PREVIEW = urlParams.get("preview");
const STAGE = urlParams.get("stage") === "1";
const RUN = (urlParams.get("run") ?? "")
  .split(",")
  .map((name) => name.trim())
  .filter((name) => name.length > 0);
const CAM = urlParams.get("cam");
const WS_URL = import.meta.env.VITE_JG_WS_URL as string | undefined;
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string | undefined;
const P2P_ROLE = urlParams.get("p2p");

const FEATURED_GAMES = ["the-robots", "loopline", "vice-isle", "claudecraft"] as const;

function GamePicker() {
  const ids = Object.keys(gameRegistry).sort();
  const featured = FEATURED_GAMES.filter((id) => ids.includes(id));
  const rest = ids.filter((id) => !FEATURED_GAMES.includes(id as (typeof FEATURED_GAMES)[number]));
  const href = (id: string, mode?: string) => {
    const params = new URLSearchParams({ game: id });
    if (mode !== undefined) params.set("mode", mode);
    return `?${params.toString()}`;
  };
  return (
    <div className="flex h-full flex-col overflow-auto bg-neutral-950 px-6 py-8 text-neutral-100">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-xl font-semibold text-cyan-300">JGengine dev runner</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Pick a game. Bare <code className="text-neutral-300">/</code> no longer auto-loads the capsule demo.
        </p>
        <div className="mt-6">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Featured</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {featured.map((id) => (
              <div key={id} className="rounded border border-white/10 bg-neutral-900/80 p-3">
                <div className="font-medium text-neutral-100">{id}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a className="rounded bg-cyan-700/80 px-2 py-1 text-xs hover:bg-cyan-600" href={href(id)}>
                    Play
                  </a>
                  <a
                    className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                    href={href(id, "editor")}
                  >
                    Editor
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-8">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">All games</div>
          <div className="flex flex-wrap gap-1.5">
            {rest.map((id) => (
              <a
                key={id}
                className="rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-neutral-300 hover:border-cyan-700/50 hover:text-cyan-200"
                href={href(id)}
              >
                {id}
              </a>
            ))}
          </div>
        </div>
        <div className="mt-8">
          <a
            className="inline-flex items-center gap-2 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
            href="?editor=standalone"
          >
            🧊 Open the standalone scene editor
          </a>
        </div>
        <p className="mt-6 text-[11px] text-neutral-500">
          Direct URLs: <code className="text-neutral-400">?game=the-robots</code> ·{" "}
          <code className="text-neutral-400">?game=the-robots&amp;mode=editor</code> ·{" "}
          <code className="text-neutral-400">?editor=standalone</code>
        </p>
      </div>
    </div>
  );
}

function withCameraPreset(game: PlayableGame): PlayableGame {
  if (CAM === null) return game;
  const preset = CAMERA_PRESETS[CAM];
  if (preset === undefined) return game;
  return { ...game, camera: { ...game.camera, ...preset } };
}

function formatLoadError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

function ErrorPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-neutral-950 px-6 text-center">
      <div className="text-sm font-semibold text-red-400">{title}</div>
      <pre className="max-h-[50vh] max-w-3xl overflow-auto whitespace-pre-wrap break-words rounded border border-red-900/60 bg-black/60 p-3 text-left font-mono text-xs text-red-200">
        {detail}
      </pre>
    </div>
  );
}

type PreviewComponent = ComponentType<{ className?: string }>;

const previewModules = import.meta.glob<{
  default: PreviewComponent;
  states?: Record<string, PreviewComponent>;
}>("../../../Games/*/src/preview.tsx");

const previewLoaders = Object.fromEntries(
  Object.entries(previewModules).map(([path, loader]) => [path.split("/").at(-3)!, loader] as const),
);

function PreviewApp({ gameId, stateKey }: { gameId: string; stateKey: string }) {
  const [component, setComponent] = useState<PreviewComponent | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (captureArmed()) setCaptureStatus("preparing");
    const loader = previewLoaders[gameId];
    if (loader === undefined) {
      setError(
        `No preview module for "${gameId}" — games with previews: ${Object.keys(previewLoaders).sort().join(", ")}`,
      );
      return;
    }
    void loader()
      .then((module) => {
        if (stateKey === "") {
          setComponent(() => module.default);
          return;
        }
        const resolved = module.states?.[stateKey];
        if (resolved === undefined) {
          const available = ["default", ...Object.keys(module.states ?? {}).sort()].join(", ");
          setError(`Unknown preview state "${stateKey}" for ${gameId} — available: ${available}`);
          return;
        }
        setComponent(() => resolved);
      })
      .catch((err: unknown) => setError(formatLoadError(err)));
  }, []);
  useEffect(() => {
    if (error !== null && captureArmed()) setCaptureStatus("error", error);
  }, [error]);
  useEffect(() => {
    if (component === null || !captureArmed()) return;
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setCaptureStatus("ready");
      });
    });
    return () => {
      cancelled = true;
    };
  }, [component]);
  if (error !== null) return <ErrorPanel title={`Preview error for ${gameId}`} detail={error} />;
  if (component === null) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        Loading preview…
      </div>
    );
  }
  const Preview = component;
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Preview className="h-full w-full" />
    </div>
  );
}

function StandaloneEditorApp() {
  const [Editor, setEditor] = useState<ComponentType<Record<string, never>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void import("@jgengine/editor")
      .then((mod) => setEditor(() => mod.StandaloneEditor as ComponentType<Record<string, never>>))
      .catch((err: unknown) => setError(formatLoadError(err)));
  }, []);
  if (error !== null) return <ErrorPanel title="Editor failed to load" detail={error} />;
  if (Editor === null) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        Loading editor…
      </div>
    );
  }
  return <Editor />;
}

function EditorModeApp({ gameId, playable }: { gameId: string; playable: PlayableGame }) {
  const [EditorApp, setEditorApp] = useState<ComponentType<{
    gameId: string;
    playable: PlayableGame;
    layers?: import("@jgengine/core/editor/index").EditorLayersInput;
    catalogs?: readonly import("@jgengine/core/editor/index").EditorCatalogDefinition[];
  }> | null>(null);
  const [layers, setLayers] = useState<import("@jgengine/core/editor/index").EditorLayersInput | undefined>(
    undefined,
  );
  const [catalogs, setCatalogs] = useState<
    readonly import("@jgengine/core/editor/index").EditorCatalogDefinition[] | undefined
  >(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Lazy chunk: the editor ships with production /play too, but only downloads when summoned.
    const gameLoader = gameLoaders.find(([id]) => id === gameId)?.[1];
    void Promise.all([
      import("@jgengine/editor"),
      editorLayerRegistry[gameId]?.() ?? Promise.resolve(undefined),
      gameLoader?.() ?? Promise.resolve(undefined),
    ])
      .then(([mod, resolvedLayers, gameModule]) => {
        setEditorApp(() => mod.EditorApp);
        setLayers(() => resolvedLayers);
        const raw = gameModule?.editorCatalogs;
        const resolved =
          raw === undefined ? undefined : typeof raw === "function" ? raw() : raw;
        setCatalogs(() => resolved);
      })
      .catch((err: unknown) => setError(formatLoadError(err)));
  }, [gameId]);

  useEffect(() => {
    if (error !== null && captureArmed()) setCaptureStatus("error", error);
  }, [error]);

  if (error !== null) return <ErrorPanel title="Editor failed to load" detail={error} />;
  if (EditorApp === null) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        Loading editor…
      </div>
    );
  }
  return <EditorApp gameId={gameId} playable={playable} layers={layers} catalogs={catalogs} />;
}

function DevApp({ gameId }: { gameId: string }) {
  const [playable, setPlayable] = useState<PlayableGame | null>(null);
  const [multiplayer, setMultiplayer] = useState<ShellMultiplayer | null>(null);
  const [scenario, setScenario] = useState<UiPreviewScenario | undefined>(undefined);
  const [scenarioPending, setScenarioPending] = useState(STAGE && MODE !== "ui" && MODE !== "editor");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [editorSummoned, setEditorSummoned] = useState(false);
  useEffect(() => {
    if (MODE !== "play") return;
    const summon = () => setEditorSummoned(true);
    (window as { __jgengineSummonEditor?: () => void }).__jgengineSummonEditor = summon;
    return () => {
      const host = window as { __jgengineSummonEditor?: () => void };
      if (host.__jgengineSummonEditor === summon) delete host.__jgengineSummonEditor;
    };
  }, []);
  useEffect(() => {
    if (MODE !== "play") return;
    let f2Held = false;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "F2") {
        f2Held = true;
        return;
      }
      if (event.code === "KeyE" && f2Held && !editorSummoned) {
        event.preventDefault();
        setEditorSummoned(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "F2") f2Held = false;
    };
    const onBlur = () => {
      f2Held = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [editorSummoned]);
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const detail = event.error instanceof Error ? (event.error.stack ?? event.error.message) : event.message;
      console.error(`[jgengine/play] runtime error`, event.error ?? event.message);
      setRuntimeError(detail);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const detail = formatLoadError(event.reason);
      console.error(`[jgengine/play] unhandled rejection`, event.reason);
      setRuntimeError(detail);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  useEffect(() => {
    if (MODE === "play" && playable === null && captureArmed()) {
      setCaptureStatus("preparing");
      return;
    }
    return armCaptureReady(MODE, playable?.capture?.settleMs);
  }, [playable]);
  useEffect(() => {
    if (!captureArmed()) return;
    if (loadError !== null) setCaptureStatus("error", loadError);
    else if (runtimeError !== null) setCaptureStatus("error", runtimeError);
  }, [loadError, runtimeError]);
  useEffect(() => {
    const load = gameRegistry[gameId];
    if (load === undefined) {
      setLoadError(`Unknown game "${gameId}" — known ids: ${Object.keys(gameRegistry).sort().join(", ")}`);
      return;
    }
    void load()
      .then(async (loaded) => {
        await gameStyleModules[`../../../Games/${gameId}/src/style.css`]?.();
        await discoverGameTunables(gameId, loaded.game.name);
        if (MODE === "poster" || MODE === "editor") {
          setMultiplayer(null);
        } else if (P2P_ROLE === "host" || P2P_ROLE === "join") {
          void resolvePeerShellMultiplayer({ gameId, role: P2P_ROLE }).then(setMultiplayer);
        } else {
          setMultiplayer(
            resolveConvexMultiplayer({
              game: loaded.game,
              gameId,
              url: CONVEX_URL,
              force: CONVEX_URL !== undefined,
            }) ??
              resolveShellMultiplayer({
                game: loaded.game,
                gameId,
                url: WS_URL,
                force: WS_URL !== undefined,
              }),
          );
        }
        setPlayable(withCameraPreset(loaded));
      })
      .catch((error: unknown) => {
        const message = formatLoadError(error);
        console.error(`[jgengine/play] failed to load ${gameId}`, error);
        setLoadError(message);
      });
    const loadScenario = uiScenarioRegistry[gameId];
    if ((MODE === "ui" || STAGE) && loadScenario !== undefined) {
      void loadScenario()
        .then((resolved) => {
          setScenario(() => resolved);
          setScenarioPending(false);
        })
        .catch((error: unknown) => {
          console.error(`[jgengine/play] failed to load ui scenario ${gameId}`, error);
          setScenarioPending(false);
        });
    } else {
      setScenarioPending(false);
    }
  }, [gameId]);
  if (loadError !== null) {
    return <ErrorPanel title={`Failed to load ${gameId}`} detail={loadError} />;
  }
  if (runtimeError !== null) {
    return <ErrorPanel title={`Runtime error in ${gameId}`} detail={runtimeError} />;
  }
  if (playable === null) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        Loading game…
      </div>
    );
  }
  if (MODE === "ui") return <GameUiPreview playable={playable} scenario={scenario} />;
  if (MODE === "poster") return <GamePlayerShell playable={playable} poster />;
  if (MODE === "editor" || editorSummoned) return <EditorModeApp gameId={gameId} playable={playable} />;
  if (scenarioPending) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        Staging scenario…
      </div>
    );
  }
  const stageScenario =
    STAGE && scenario !== undefined ? (ctx: GameContext) => scenario(ctx, playable) : undefined;
  const defaultCommandInput = { yaw: 0, pitch: 0, aim: { yaw: 0, pitch: 0 } };
  let captureRun: readonly (string | { name: string; input?: unknown })[] = [];
  if (STATE_PARAM !== null) {
    const stateRun = playable.capture?.states?.[STATE_PARAM];
    if (stateRun === undefined) {
      const known = Object.keys(playable.capture?.states ?? {}).sort();
      const detail =
        known.length > 0 ? `declared states: ${known.join(", ")}` : "the game declares no capture.states";
      if (captureArmed()) setCaptureStatus("error", `unknown capture state "${STATE_PARAM}" for ${gameId} — ${detail}`);
    } else {
      captureRun = stateRun;
    }
  } else if (RUN.length > 0) {
    captureRun = RUN;
  } else if (captureArmed() && MODE === "play") {
    captureRun = playable.capture?.play ?? [];
  }
  const probe = playable.capture?.probe;
  const onContextReady =
    stageScenario !== undefined || captureRun.length > 0 || probe !== undefined
      ? (ctx: GameContext) => {
          if (probe !== undefined) installPlaytestProbe(() => probe(ctx));
          stageScenario?.(ctx);
          for (const entry of captureRun) {
            const name = typeof entry === "string" ? entry : entry.name;
            const input = typeof entry === "string" ? defaultCommandInput : (entry.input ?? defaultCommandInput);
            if (ctx.game.commands.has(name)) {
              ctx.game.commands.run(name, input);
            } else if (captureArmed()) {
              setCaptureStatus(
                "error",
                `capture command "${name}" is not registered by ${gameId} — registered commands: ${ctx.game.commands.names().sort().join(", ")}`,
              );
            }
          }
        }
      : undefined;
  return <GamePlayerShell playable={playable} multiplayer={multiplayer} onContextReady={onContextReady} />;
}

createRoot(document.getElementById("root")!).render(
  EDITOR_STANDALONE ? (
    <StandaloneEditorApp />
  ) : PREVIEW !== null && GAME_ID !== null ? (
    <PreviewApp gameId={GAME_ID} stateKey={PREVIEW} />
  ) : GAME_ID === null ? (
    <GamePicker />
  ) : (
    <DevApp gameId={GAME_ID} />
  ),
);
