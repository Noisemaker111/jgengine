import { bakeMinimapFromDocument, type DocumentBakeOptions } from "@jgengine/core/editor/index";
import { editableTerrainFromSnapshot } from "@jgengine/core/world/terraform";

import type { HandlerTable } from "./context";

/**
 * Bake the authored terrain into a stored minimap PNG (#1036). Composes the live viewport's base
 * ground field with the document's sculpt snapshot, rasterizes it top-down via the pure core bake,
 * and stores `{ background, bounds }` on `document.minimap` as an undoable edit — runtime then feeds
 * those straight into the `Minimap`/`WorldMap` props with no re-raster. Needs the mounted viewport's
 * composed sampler, so it is a live-editor-only action, not a headless CLI verb.
 */
export const minimapHandlers: Pick<HandlerTable, "bake_minimap"> = {
  bake_minimap: (ctx, request) => {
    const base = ctx.getTerrainSampler();
    if (base === null) return { ok: false, error: "bake_minimap needs the live editor viewport" };
    const doc = ctx.session.getState().document;
    // Compose base terrain + the document's sculpt delta; a doc with no sculpt bakes the base field.
    const composed = doc.terrain === undefined ? base : editableTerrainFromSnapshot(doc.terrain, base);
    const waterLevel = request.waterLevel ?? base.waterLevel;
    const options: DocumentBakeOptions = {
      sampleNormal: (x, z) => composed.sampleNormal(x, z),
      ...(request.padding === undefined ? {} : { padding: request.padding }),
      ...(request.resolution === undefined ? {} : { resolution: request.resolution }),
      ...(waterLevel === undefined ? {} : { waterLevel }),
    };
    const { background, mapBounds } = bakeMinimapFromDocument(
      doc,
      (x, z) => composed.sampleHeight(x, z),
      options,
    );
    ctx.dispatchGuarded({ type: "setMinimapBake", minimap: { background, bounds: mapBounds } });
    const b64 = background.slice(background.indexOf(",") + 1);
    const padCount = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
    const bytes = Math.max(0, Math.floor((b64.length * 3) / 4) - padCount);
    return { ok: true, result: { bounds: mapBounds, bytes } };
  },
};
