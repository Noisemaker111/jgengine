import { useCallback, useMemo, useRef, useState } from "react";

import type { EditorLayersInput } from "@jgengine/core/editor/index";
import { getSaveEndpoint } from "@jgengine/core/devtools/saveEndpoint";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import {
  environment,
  sky,
  terrain,
  type EnvironmentWorldFeature,
} from "@jgengine/core/world/features";
import { defineGame } from "@jgengine/shell/defineGame";
import type { PlayableGame } from "@jgengine/shell/registry";

import {
  importAssetToHost,
  loadDroppedAssets,
  mergeStandaloneAssets,
  type AssetImporter,
  type StandaloneAsset,
} from "./assetImport";
import { EditorApp, type EditorSaveFn } from "./EditorApp";

export type { AssetImporter, StandaloneAsset } from "./assetImport";
export { importAssetToHost, loadDroppedAssets, mergeStandaloneAssets } from "./assetImport";

/** Options for the blank, gameless world the standalone editor authors over. */
export interface BlankPlayableOptions {
  name?: string;
  assets?: readonly StandaloneAsset[];
  world?: EnvironmentWorldFeature;
}

/**
 * The default flat-ground authoring canvas the standalone editor opens on when the host supplies
 * none. Deliberately thin — bare sculptable ground under a clear default sky. Dressing (sky look,
 * foliage scatter, props) is what the author adds here, written into the scene document; it is
 * never pre-baked into the canvas. The `seed` parameter is legacy and unused.
 */
export function blankWorld(_seed = "standalone"): EnvironmentWorldFeature {
  return environment({
    terrain: terrain({ bounds: { w: 128, d: 128 }, height: 0, material: "grass" }),
    // Fog pushed past the world edge: the engine's default (near 70 / far 260) soaks most of a
    // 128 m authoring canvas in haze — the editor should open on a clear world.
    sky: sky({ preset: "day", fog: { near: 220, far: 700 } }),
  });
}

/** Builds a minimal gameless `PlayableGame` — a flat world plus an asset catalog — for the editor to mount over. */
export function createBlankPlayable(options: BlankPlayableOptions = {}): PlayableGame {
  const assets = createAssetCatalog();
  for (const asset of options.assets ?? []) assets.register(asset.id, { url: asset.url });
  return defineGame({
    name: options.name ?? "Standalone Scene",
    assets,
    world: options.world ?? blankWorld(),
    server: { mode: "single" },
    save: "none",
  });
}

/** A save fn that hands the scene JSON back to the browser as a downloaded file — the exit path when no dev server is listening. */
export function downloadSaver(filename = "editor.scene.json"): EditorSaveFn {
  return async (json) => {
    try {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      return { ok: true, path: filename };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };
}

/** Props for the gameless scene editor — everything optional so it boots on a blank world with nothing wired. */
export interface StandaloneEditorProps {
  /** Prefs/draft namespace; also the gameId the save endpoint resolves. Default `"standalone"`. */
  sceneId?: string;
  /** Scene document (or its JSON) to open on — a loaded world file. */
  scene?: EditorLayersInput;
  /** Models the user can place. */
  assets?: readonly StandaloneAsset[];
  /** World to author over. Default: a flat grass field. */
  world?: EnvironmentWorldFeature;
  /** Where Save writes. Default: the installed dev-server endpoint, else a browser download. */
  save?: EditorSaveFn;
  /**
   * How a dropped model is made durable. Default: upload to the `@jgengine/node` editor host plugin so it
   * persists to disk and survives reload; when no host answers the import degrades to an ephemeral blob URL.
   */
  importAsset?: AssetImporter;
  /** Hide the built-in open-scene / add-assets strip (host supplies its own loading UI). */
  hidePickers?: boolean;
}

/**
 * The scene editor, mounted over a blank gameless world instead of a game — the same `EditorApp`
 * every jgengine game ships, usable standalone on the user's own project (CLI `jgengine editor`,
 * desktop app, or any React host). Ships a slim strip to open a world file and pull in an asset
 * folder; both are also settable up front through props.
 */
export function StandaloneEditor({
  sceneId = "standalone",
  scene,
  assets,
  world,
  save,
  importAsset = importAssetToHost,
  hidePickers = false,
}: StandaloneEditorProps) {
  const [loadedScene, setLoadedScene] = useState<EditorLayersInput | undefined>(scene);
  const [loadedAssets, setLoadedAssets] = useState<readonly StandaloneAsset[]>(assets ?? []);
  const [rev, setRev] = useState(0);
  const sceneInput = useRef<HTMLInputElement | null>(null);
  const assetInput = useRef<HTMLInputElement | null>(null);

  const playable = useMemo(
    () => createBlankPlayable({ assets: loadedAssets, world }),
    [loadedAssets, world],
  );

  const saveFn = useMemo<EditorSaveFn | undefined>(
    () => save ?? (getSaveEndpoint() !== null ? undefined : downloadSaver()),
    [save],
  );

  const openScene = useCallback(async (file: File) => {
    const text = await file.text();
    setLoadedScene(JSON.parse(text) as EditorLayersInput);
    setRev((value) => value + 1);
  }, []);

  const addAssets = useCallback(
    async (files: FileList) => {
      const next = await loadDroppedAssets(Array.from(files), importAsset);
      if (next.length === 0) return;
      setLoadedAssets((current) => mergeStandaloneAssets(current, next));
      setRev((value) => value + 1);
    },
    [importAsset],
  );

  return (
    <div className="relative h-full w-full">
      <EditorApp key={rev} gameId={sceneId} playable={playable} layers={loadedScene} save={saveFn} />
      {hidePickers ? null : (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/70 px-2 py-1.5 text-[11px] text-neutral-200 shadow-lg shadow-black/40 backdrop-blur-md">
          <button
            type="button"
            className="pointer-events-auto rounded-full px-3 py-1 transition-colors hover:bg-white/10"
            onClick={() => sceneInput.current?.click()}
          >
            📂 Open scene
          </button>
          <span className="h-4 w-px bg-white/15" />
          <button
            type="button"
            className="pointer-events-auto rounded-full px-3 py-1 transition-colors hover:bg-white/10"
            onClick={() => assetInput.current?.click()}
          >
            🧊 Add assets
          </button>
          {loadedAssets.length > 0 ? (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-neutral-300">
              {loadedAssets.length}
            </span>
          ) : null}
          <input
            ref={sceneInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) void openScene(file);
              event.target.value = "";
            }}
          />
          <input
            ref={assetInput}
            type="file"
            accept=".glb,.gltf,model/gltf-binary"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files !== null) void addAssets(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      )}
    </div>
  );
}
