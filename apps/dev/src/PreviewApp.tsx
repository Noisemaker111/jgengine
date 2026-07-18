import { useEffect, useState } from "react";

import { ErrorPanel, LoadingPanel, formatLoadError } from "./appShared";
import { captureArmed, setCaptureStatus } from "./captureReady";
import { previewLoaders, type PreviewComponent } from "./registries";

export function PreviewApp({ gameId, stateKey }: { gameId: string; stateKey: string }) {
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
  if (component === null) return <LoadingPanel label="Loading preview…" />;
  const Preview = component;
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Preview className="h-full w-full" />
    </div>
  );
}
