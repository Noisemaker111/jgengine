import { useEffect, useState } from "react";

import { formatLoadError } from "./appShared";

/**
 * Play-mode editor summon: exposes `window.__jgengineSummonEditor()` and the
 * F2-hold + E chord, both flipping the returned flag so the shell can swap in
 * the editor without a reload. No-op outside `mode === "play"`.
 */
export function useEditorSummon(mode: string): boolean {
  const [editorSummoned, setEditorSummoned] = useState(false);

  useEffect(() => {
    if (mode !== "play") return;
    const summon = () => setEditorSummoned(true);
    (window as { __jgengineSummonEditor?: () => void }).__jgengineSummonEditor = summon;
    return () => {
      const host = window as { __jgengineSummonEditor?: () => void };
      if (host.__jgengineSummonEditor === summon) delete host.__jgengineSummonEditor;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "play") return;
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
  }, [mode, editorSummoned]);

  return editorSummoned;
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
