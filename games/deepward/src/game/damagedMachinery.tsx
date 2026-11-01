import { useEffect, useMemo } from "react";
import type { EmitterConfig } from "@jgengine/core/vfx/particles";
import { useGameContext } from "@jgengine/react/provider";
import { editorLayers, type Place } from "../world";

/** The vents the editor scene places, by effect name; each recipe is plain emitter data. */
export type VentEffect = "steam" | "drip" | "spark";
const RECIPES: Readonly<Record<VentEffect, { config: EmitterConfig; blending: "additive" | "normal"; render: { shape: "smoke" | "point" | "streak" } }>> = {
  steam: {
    config: { max: 48, rate: 9, lifetime: { min: 1.4, max: 2.4 }, speed: { min: 0.5, max: 0.9 }, direction: [0.3, 1, 0], spread: 0.35, drag: 0.4, size: { start: 0.12, end: 0.6 }, colorStart: 0xcfe0dc, colorEnd: 0x8aa09b, alpha: { start: 0.35, end: 0 }, gravity: [0, 0.2, 0], seed: "steam" },
    blending: "normal", render: { shape: "smoke" },
  },
  drip: {
    config: { max: 12, rate: 1.6, lifetime: { min: 0.9, max: 1.3 }, speed: { min: 0, max: 0.1 }, direction: [0, -1, 0], spread: 0.05, gravity: [0, -9.8, 0], size: { start: 0.025, end: 0.02 }, colorStart: 0x9fd8e0, alpha: { start: 0.8, end: 0.5 }, seed: "drip" },
    blending: "normal", render: { shape: "streak" },
  },
  spark: {
    config: { max: 32, rate: 5, lifetime: { min: 0.25, max: 0.55 }, speed: { min: 1.6, max: 3.2 }, direction: [0, 0.6, 1], spread: 1.2, gravity: [0, -7, 0], drag: 0.2, size: { start: 0.025, end: 0.008 }, colorStart: 0xffd9a0, colorEnd: 0xea7a30, alpha: { start: 1, end: 0 }, seed: "spark" },
    blending: "additive", render: { shape: "streak" },
  },
};

/** Authored vents on this floor: steam from failing joints, drips under pipework, sparks from junction boxes. */
export function ventMarkers(place: Place) {
  return editorLayers.markers.filter(marker => marker.kind === "deepward-vent" && marker.meta?.["place"] === place);
}

/** Standing particle emitters for this floor's vents; leaving the floor detaches them. */
export function DamagedMachinery({ place }: { place: Place }) {
  const ctx = useGameContext(), vents = useMemo(() => ventMarkers(place), [place]);
  useEffect(() => {
    for (const vent of vents) {
      const effect = vent.meta?.["effect"];
      const recipe = effect === "steam" ? RECIPES.steam : effect === "drip" ? RECIPES.drip : effect === "spark" ? RECIPES.spark : undefined;
      if (recipe === undefined) throw new Error(`Deepward vent has an unknown effect: ${vent.id}`);
      ctx.particles.attach(vent.id, { ...recipe.config, position: [vent.position.x, vent.position.y, vent.position.z], seed: vent.id }, { blending: recipe.blending, render: recipe.render });
    }
    return () => { for (const vent of vents) ctx.particles.detach(vent.id); };
  }, [ctx, vents]);
  return null;
}
