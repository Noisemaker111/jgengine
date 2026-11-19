/** @jsxImportSource @jgengine/core/ui/jsx */
import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from "@jgengine/core/ui/jsx";

import type { EditorCatalogDefinition } from "@jgengine/core/editor/types";
import type { CreatorConfig } from "@jgengine/core/editor/creatorStorage";
import { installSaveEndpoint } from "@jgengine/core/devtools/saveEndpoint";
import { readUrlParam, subscribeUrlChange, writeUrlParam } from "@jgengine/core/devtools/urlFlags";
import { multiplayerAdapterKind } from "@jgengine/core/runtime/adapter";

import { GamePlayerShell } from "./GamePlayerShell";
import { resolveShellMultiplayer, type ResolveShellMultiplayerArgs, type ShellMultiplayer } from "@jgengine/core/multiplayer/multiplayer.draw";
import type { PlayableGame } from "./registry";
import { publishOnPage } from "@jgengine/core/runtime/pageHandle";

const warnedAdapterKinds = new Set<string>();

function warnUndrivenAdapter(kind: string): void {
  if (warnedAdapterKinds.has(kind)) return;
  warnedAdapterKinds.add(kind);
  console.warn(
    `GameHost: game declares multiplayer adapter "${kind}", which the built-in shell resolver cannot drive. ` +
      "Running offline. Pass a prebuilt session via the multiplayer prop, or a resolveMultiplayer prop, to GameHost.",
  );
}

export interface EditorSummonModule {
  CreatorApp?: ComponentType<{ gameId: string; config: CreatorConfig<PlayableGame>; onExit: () => void }>;
  EditorApp: ComponentType<{
    gameId: string;
    playable: PlayableGame;
    catalogs?: readonly EditorCatalogDefinition[] | undefined;
    onExitEditor?: () => void;
  }>;
}

const EDITOR_MODE_PARAM = "mode";
const EDITOR_MODE_VALUE = "editor";

export interface GameHostProps {
  playable: PlayableGame;
  gameId?: string;
  wsUrl?: string;
  multiplayer?: ShellMultiplayer | null;
  /** Tried before the built-in {@link resolveShellMultiplayer}; falls back to it when this returns `null`. */
  resolveMultiplayer?: (args: ResolveShellMultiplayerArgs) => ShellMultiplayer | null;
  /**
   * Editor loader — pass `() => import("@jgengine/editor")` and the host owns the whole summon:
   * `?mode=editor`, the F2+E chord, `window.__jg.summonEditor`, the dev save endpoint, and the
   * lazy `EditorApp` mount (with the playable's `editorLayers`/`editorCatalogs`). The editor package
   * stays a lazy chunk the game bundles only when this prop is set.
   */
  editor?: () => Promise<EditorSummonModule>;
  /** Player creator: injected durable storage, bounded catalog and a fresh runtime factory. */
  creator?: CreatorConfig<PlayableGame>;
  creatorOpen?: boolean;
  onCreatorOpenChange?: (open: boolean) => void;
}

function initialEditorMode(enabled: boolean): boolean {
  if (!enabled || typeof window === "undefined") return false;
  return readUrlParam(EDITOR_MODE_PARAM) === EDITOR_MODE_VALUE;
}

/** @capability mount-game mount a defined game in the browser — `<GameHost playable={game} editor={() => import("@jgengine/editor")} />` */
export function GameHost({ playable, gameId, wsUrl, multiplayer, resolveMultiplayer, editor, creator, creatorOpen = false, onCreatorOpenChange }: GameHostProps) {
  const resolvedGameId = gameId ?? playable.game.name;
  const [editorOpen, setEditorOpen] = useState(() => initialEditorMode(editor !== undefined));

  useEffect(() => {
    if (editor === undefined) return;
    // Self-guards against production builds; the endpoint just marks where dev saves land.
    return installSaveEndpoint("/__jgengine/save", resolvedGameId);
  }, [editor, resolvedGameId]);

  // Mirror editor mode into the URL so the address bar is the honest record of what's open: sharing
  // the URL reopens the editor, and stripping `?mode=editor` (then reloading) drops back to the game.
  // Only ever clear a `mode` we set to editor — never a stray value the app put there.
  useEffect(() => {
    if (editor === undefined) return;
    if (editorOpen) writeUrlParam(EDITOR_MODE_PARAM, EDITOR_MODE_VALUE);
    else if (readUrlParam(EDITOR_MODE_PARAM) === EDITOR_MODE_VALUE) writeUrlParam(EDITOR_MODE_PARAM, null);
  }, [editor, editorOpen]);

  // Keep in step with browser back/forward: navigating away from `?mode=editor` closes the editor.
  useEffect(() => {
    if (editor === undefined) return;
    return subscribeUrlChange(() => {
      setEditorOpen(readUrlParam(EDITOR_MODE_PARAM) === EDITOR_MODE_VALUE);
    });
  }, [editor]);

  useEffect(() => {
    if (editor === undefined || editorOpen) return;
    const summon = () => setEditorOpen(true);
    const unpublish = publishOnPage("summonEditor", summon);
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
      unpublish();
    };
  }, [editor, editorOpen]);

  const EditorLazy = useMemo(() => {
    if (editor === undefined) return null;
    return lazy(async () => ({ default: (await editor()).EditorApp }));
  }, [editor]);
  const CreatorLazy = useMemo(() => {
    if (editor === undefined) return null;
    return lazy(async () => {
      const module = await editor();
      if (module.CreatorApp === undefined) throw new Error("Editor module does not expose CreatorApp");
      return { default: module.CreatorApp };
    });
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

  if (creatorOpen && creator !== undefined && CreatorLazy !== null) {
    return <Suspense fallback={null}><CreatorLazy gameId={resolvedGameId} config={creator} onExit={() => onCreatorOpenChange?.(false)} /></Suspense>;
  }
  if (editorOpen && EditorLazy !== null) {
    return (
      <Suspense fallback={null}>
        <EditorLazy
          gameId={resolvedGameId}
          playable={playable}
          catalogs={playable.scene?.editorCatalogs}
          onExitEditor={() => setEditorOpen(false)}
        />
      </Suspense>
    );
  }

  return <GamePlayerShell playable={playable} multiplayer={resolved} />;
}
