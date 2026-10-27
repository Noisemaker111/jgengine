import { useSyncExternalStore } from "react";

import { isProductionEnvironment } from "@jgengine/core/devtools/saveEndpoint";
import { modelLoadFallbacks, subscribeModelLoadFallbacks } from "@jgengine/core/model/modelLoad.draw";

/**
 * Dev-build banner naming every model the loader replaced with a placeholder box, so a missing asset
 * is read by name on screen instead of passing as one more pink box. Mounted with devtools; a
 * production build never draws it (the console warning stays, and the release gate keeps missing
 * models from shipping at all).
 * @internal
 */
export function MissingModelsNotice() {
  const missing = useSyncExternalStore(subscribeModelLoadFallbacks, modelLoadFallbacks, modelLoadFallbacks);
  if (missing.length === 0 || isProductionEnvironment()) return null;
  const shown = missing.slice(0, 6);
  return (
    <div
      role="alert"
      data-jg-missing-models={missing.length}
      style={{
        position: "absolute",
        left: 12,
        bottom: 12,
        zIndex: 95,
        maxWidth: 420,
        padding: "8px 12px",
        borderRadius: 6,
        background: "rgba(60, 8, 30, 0.92)",
        border: "2px solid #d63384",
        color: "#fff",
        font: "600 12px/1.45 ui-monospace, monospace",
        pointerEvents: "none",
      }}
    >
      <div style={{ fontWeight: 800, letterSpacing: "0.06em" }}>
        {missing.length === 1 ? "1 MODEL MISSING" : `${missing.length} MODELS MISSING`}
      </div>
      {shown.map((entry) => (
        <div key={entry.url} title={entry.message}>
          {entry.name}
        </div>
      ))}
      {missing.length > shown.length ? <div>+{missing.length - shown.length} more</div> : null}
      <div style={{ opacity: 0.75, fontWeight: 500 }}>Run bun run games:provision; never fetched? jgengine assets find &lt;name&gt; --game &lt;dir&gt; --provision</div>
    </div>
  );
}
