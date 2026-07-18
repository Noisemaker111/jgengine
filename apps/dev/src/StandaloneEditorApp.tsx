import { useEffect, useState, type ComponentType } from "react";

import { ErrorPanel, LoadingPanel, formatLoadError } from "./appShared";

export function StandaloneEditorApp() {
  const [Editor, setEditor] = useState<ComponentType<Record<string, never>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void import("@jgengine/editor")
      .then((mod) => setEditor(() => mod.StandaloneEditor as ComponentType<Record<string, never>>))
      .catch((err: unknown) => setError(formatLoadError(err)));
  }, []);
  if (error !== null) return <ErrorPanel title="Editor failed to load" detail={error} />;
  if (Editor === null) return <LoadingPanel label="Loading editor…" />;
  return <Editor />;
}
