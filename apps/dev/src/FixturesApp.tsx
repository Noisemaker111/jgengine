import { useEffect, useState } from "react";

import { previewFixtureNames, resolvePreviewFixture } from "@jgengine/react";

import { ErrorPanel, LoadingPanel } from "./appShared";
import { captureArmed, setCaptureStatus } from "./captureReady";

/**
 * Fixtures capture route: mounts a deterministic engine preview fixture (the real exported
 * `@jgengine/react` component) by name from `PREVIEW_FIXTURES`, driven by the `?fixture=<name>`
 * URL param. Screenshots the primitive with no game boot and no hand-rolled `--url` page. An
 * empty or unknown name renders the discoverable list of registered fixtures. Mirrors
 * {@link PreviewApp}'s capture handshake: arm `preparing`, mark `ready` two frames after mount,
 * or `error` (with the available names) when the name does not resolve.
 */
export function FixturesApp({ name }: { name: string }) {
  const fixture = name === "" ? undefined : resolvePreviewFixture(name);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (captureArmed()) setCaptureStatus("preparing");
    if (fixture === undefined) {
      const detail = `available fixtures: ${previewFixtureNames().join(", ")}`;
      setError(name === "" ? `No fixture selected — ${detail}` : `Unknown fixture "${name}" — ${detail}`);
    }
  }, []);

  useEffect(() => {
    if (error !== null && captureArmed()) setCaptureStatus("error", error);
  }, [error]);

  useEffect(() => {
    if (fixture === undefined || !captureArmed()) return;
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setCaptureStatus("ready");
      });
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  if (error !== null) return <ErrorPanel title="Fixture error" detail={error} />;
  if (fixture === undefined) return <LoadingPanel label="Loading fixture…" />;
  const Fixture = fixture.component;
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "auto" }}>
      <Fixture className="h-full w-full" />
    </div>
  );
}
