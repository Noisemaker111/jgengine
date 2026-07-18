import { useEffect, useState, type ComponentType } from "react";

import type { PlayableGame } from "@jgengine/shell/registry";

import { ErrorPanel, LoadingPanel, formatLoadError } from "./appShared";
import { captureArmed, setCaptureStatus } from "./captureReady";
import { editorLayerRegistry, gameLoaders } from "./registries";

export function EditorModeApp({ gameId, playable }: { gameId: string; playable: PlayableGame }) {
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
  if (EditorApp === null) return <LoadingPanel label="Loading editor…" />;
  return <EditorApp gameId={gameId} playable={playable} layers={layers} catalogs={catalogs} />;
}
