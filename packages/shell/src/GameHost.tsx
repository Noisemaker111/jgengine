import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from "react";

import type { EditorCatalogDefinition } from "@jgengine/core/editor/types";
import { installSaveEndpoint } from "@jgengine/core/devtools/saveEndpoint";
import { multiplayerAdapterKind } from "@jgengine/core/runtime/adapter";

import { GamePlayerShell } from "./GamePlayerShell";
import { resolveShellMultiplayer, type ResolveShellMultiplayerArgs, type ShellMultiplayer } from "./multiplayer";
import type { PlayableGame } from "./registry";

const warnedAdapterKinds = new Set<string>();

function warnUndrivenAdapter(kind: string): void {
  if (warnedAdapterKinds.has(kind)) return;
  warnedAdapterKinds.add(kind);
  console.warn(
    `GameHost: game declares multiplayer adapter "${kind}", which the built-in shell resolver cannot drive. ` +
      "Running offline. Pass a prebuilt session via the multiplayer prop, or a resolveMultiplayer prop, to GameHost.",
  );
}

/** Structural shape of the module `GameHost`'s `editor` loader resolves — `import("@jgengine/editor")` satisfies it. */
export interface EditorSummonModule {
  EditorApp: ComponentType<{
    gameId: string;
    playable: PlayableGame;
    catalogs?: readonly EditorCatalogDefinition[];
  }>;
}

export interface GameHostProps {
  playable: PlayableGame;
  gameId?: string;
  wsUrl?: string;
  /** Prebuilt multiplayer session. When present (including `null`), it is used as-is and no resolution is attempted. */
  multiplayer?: ShellMultiplayer | null;
  /** Tried before the built-in {@link resolveShellMultiplayer}; falls back to it when this returns `null`. */
  resolveMultiplayer?: (args: ResolveShellMultiplayerArgs) => ShellMultiplayer | null;
  /**
   * Editor loader — pass `() => import("@jgengine/editor")` and the host owns the whole summon:
   * `?mode=editor`, the F2+E chord, `window.__jgengineSummonEditor`, the dev save endpoint, and the
   * lazy `EditorApp` mount (with the playable's `editorLayers`/`editorCatalogs`). The editor package
   * stays a lazy chunk the game bundles only when this prop is set.
   */
  editor?: () => Promise<EditorSummonModule>;
}

function initialEditorMode(enabled: boolean): boolean {
  if (!enabled || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("mode") === "editor";
}

export function GameHost({ playable, gameId, wsUrl, multiplayer, resolveMultiplayer, editor }: GameHostProps) {
  const resolvedGameId = gameId ?? playable.game.name;
  const [editorOpen, setEditorOpen] = useState(() => initialEditorMode(editor !== undefined));

  useEffect(() => {
    if (editor === undefined) return;
    // Self-guards against production builds; the endpoint just marks where dev saves land.
    return installSaveEndpoint("/__jgengine/save", resolvedGameId);
  }, [editor, resolvedGameId]);

  useEffect(() => {
    if (editor === undefined || editorOpen) return;
    const summon = () => setEditorOpen(true);
    const host = window as { __jgengineSummonEditor?: () => void };
    host.__jgengineSummonEditor = summon;
    let f2Held = false;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "F2") f2Held = true;
      else if (event.code === "KeyE" && f2Held) {
        event.preventDefault();
        summon();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "F2") f2Held = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (host.__jgengineSummonEditor === summon) delete host.__jgengineSummonEditor;
    };
  }, [editor, editorOpen]);

  const EditorLazy = useMemo(() => {
    if (editor === undefined) return null;
    return lazy(async () => ({ default: (await editor()).EditorApp }));
  }, [editor]);

  const resolved = useMemo(() => {
    if (multiplayer !== undefined) return multiplayer;

    const args: ResolveShellMultiplayerArgs = {
      game: playable.game,
      gameId: resolvedGameId,
      url: wsUrl,
      force: wsUrl !== undefined,
    };
    const session = resolveMultiplayer?.(args) ?? resolveShellMultiplayer(args);
    if (session === null) {
      const kind = multiplayerAdapterKind(playable.game.multiplayer);
      if (kind !== null && kind !== "offline") warnUndrivenAdapter(kind);
    }
    return session;
  }, [playable, resolvedGameId, wsUrl, multiplayer, resolveMultiplayer]);

  if (editorOpen && EditorLazy !== null) {
    return (
      <Suspense fallback={null}>
        <EditorLazy gameId={resolvedGameId} playable={playable} catalogs={playable.editorCatalogs} />
      </Suspense>
    );
  }

  return <GamePlayerShell playable={playable} multiplayer={resolved} />;
}
