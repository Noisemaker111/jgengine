/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useState, type ComponentType } from "@jgengine/core/ui/jsx";

import { ErrorPanel, LoadingPanel, formatLoadError } from "./appShared";
import { armCaptureReady, captureArmed, setCaptureStatus } from "./captureReady";
import { useRuntimeError } from "./hooks";

export function StandaloneEditorApp() {
  const [Editor, setEditor] = useState<ComponentType<Record<string, never>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runtimeError = useRuntimeError();
  useEffect(() => {
    const cancel = armCaptureReady("editor");
    void import("@jgengine/editor")
      .then((mod) => setEditor(() => mod.StandaloneEditor as ComponentType<Record<string, never>>))
      .catch((err: unknown) => setError(formatLoadError(err)));
    return cancel;
  }, []);
  useEffect(() => {
    if (error !== null && captureArmed()) setCaptureStatus("error", error);
    else if (runtimeError !== null && captureArmed()) setCaptureStatus("error", runtimeError);
  }, [error, runtimeError]);
  if (error !== null) return <ErrorPanel title="Editor failed to load" detail={error} />;
  if (Editor === null) return <LoadingPanel label="Loading editor…" />;
  return <Editor />;
}
