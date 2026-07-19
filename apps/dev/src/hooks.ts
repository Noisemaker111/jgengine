import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { readUrlParam, subscribeUrlChange, writeUrlParam } from "@jgengine/core/devtools/urlFlags";

import { formatLoadError } from "./appShared";

const EDITOR_MODE_PARAM = "mode";
const EDITOR_MODE_VALUE = "editor";

/** Live editor-open state plus the callback that closes it back to the game. */
export interface EditorSummon {
  editorOpen: boolean;
  exitEditor: () => void;
}

function readEditorOpen(): boolean {
  return readUrlParam(EDITOR_MODE_PARAM) === EDITOR_MODE_VALUE;
}

// `writeUrlParam` rewrites via `history.replaceState`, which never fires `popstate`, so setter
// writes notify these listeners directly; `subscribeUrlChange` covers browser back/forward.
const editorOpenListeners = new Set<() => void>();

function subscribeEditorOpen(listener: () => void): () => void {
  editorOpenListeners.add(listener);
  const unsubscribeUrl = subscribeUrlChange(listener);
  return () => {
    editorOpenListeners.delete(listener);
    unsubscribeUrl();
  };
}

// Only touch `mode` for editor: leave `mode=poster`/`mode=ui` (and a bare `mode=play`) alone so
// other runner modes keep their honest URL.
function setEditorOpen(open: boolean): void {
  if (open) writeUrlParam(EDITOR_MODE_PARAM, EDITOR_MODE_VALUE);
  else if (readEditorOpen()) writeUrlParam(EDITOR_MODE_PARAM, null);
  for (const listener of editorOpenListeners) listener();
}

/**
 * URL-backed editor summon: opens the editor via `window.__jgengineSummonEditor()` or the F2+E
 * chord (in play mode) and via `?mode=editor` at load. The URL is the single source of truth —
 * toggling writes the flag through the shared {@link writeUrlParam} seam so the address bar is the
 * honest record — share it to reopen, strip it to drop back to the game. `exitEditor` closes the
 * editor and clears the param.
 */
export function useEditorSummon(mode: string): EditorSummon {
  const editorOpen = useSyncExternalStore(subscribeEditorOpen, readEditorOpen, readEditorOpen);

  useEffect(() => {
    if (editorOpen || mode !== "play") return;
    const summon = () => setEditorOpen(true);
    (window as { __jgengineSummonEditor?: () => void }).__jgengineSummonEditor = summon;
    let f2Held = false;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "F2") {
        f2Held = true;
        return;
      }
      if (event.code === "KeyE" && f2Held) {
        event.preventDefault();
        summon();
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
      const host = window as { __jgengineSummonEditor?: () => void };
      if (host.__jgengineSummonEditor === summon) delete host.__jgengineSummonEditor;
    };
  }, [editorOpen, mode]);

  const exitEditor = useCallback(() => setEditorOpen(false), []);
  return { editorOpen, exitEditor };
}

/**
 * Surface uncaught runtime errors and unhandled rejections as a string the
 * runner can render, so a crash past load shows a panel instead of a blank
 * canvas.
 */
export function useRuntimeError(): string | null {
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
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
  return runtimeError;
}
