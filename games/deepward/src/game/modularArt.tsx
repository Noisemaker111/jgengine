import { useMemo } from "react";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import type { ScatterInstance } from "@jgengine/core/scatter/scatterRegion";
import { InstancedScatter } from "@jgengine/core/scatter/InstancedScatter.draw";
import manifest from "../../public/models/imported/deepward/architecture/asset-manifest.json";
import { editorLayers, type Place } from "../world";

const MODELS: Readonly<Record<string, ModelConfig>> = Object.fromEntries(
  manifest.models.map(model => [model.id, { url: model.url, anchor: "origin", shadows: "both" } satisfies ModelConfig]),
);

/** The authored wall bays, ribs, columns, gantries and pipe runs on this floor; the editor owns every placement. */
export function architectureMarkers(place: Place) {
  return editorLayers.markers.filter(marker => marker.kind === "deepward-architecture" && marker.meta?.["place"] === place);
}

/** Authored architecture, GPU-instanced one draw per model per chunk; the volumes keep collision. */
export function ModularArchitecture({ place }: { place: Place }) {
  const instances = useMemo<ScatterInstance[]>(() => architectureMarkers(place).map(marker => ({
    id: marker.id, regionId: place, item: marker.catalogId ?? "", x: marker.position.x, y: marker.position.y, z: marker.position.z,
    rotationY: marker.rotationY ?? 0, scale: Number(marker.meta?.["scale"] ?? 1),
  })), [place]);
  return <InstancedScatter instances={instances} resolveItem={item => MODELS[item] ?? null} chunkSize={16} />;
}
