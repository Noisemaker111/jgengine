import type { StaticShapeInstance } from "@jgengine/shell/render/staticShapeInstances";

type Vec3 = readonly [number, number, number];

/**
 * The empty build plots as static primitive instances: a stone foundation, a worn cap and the
 * affordability halo, one batch each however many plots the field authors. The halo is a disk under
 * the cap, so only its rim shows.
 */
export function plotShapes(plots: readonly { position: Vec3 }[], open: readonly boolean[], haloColor: string): StaticShapeInstance[] {
  const shapes: StaticShapeInstance[] = [];
  plots.forEach((plot, index) => {
    if (open[index] !== true) return;
    const [x, y, z] = plot.position;
    shapes.push(
      { shape: "cylinder", position: [x, y + 0.12, z], scale: [1.42, 0.24, 1.42], radialSegments: 8, shadows: "both", surface: { color: "#7d766a", roughness: 1 } },
      { shape: "cylinder", position: [x, y + 0.26, z], rotation: [0, Math.PI / 8, 0], scale: [1.05, 0.06, 1.05], radialSegments: 8, shadows: "none", surface: { color: "#635c50", roughness: 1 } },
      { shape: "cylinder", position: [x, y + 0.26, z], scale: [1.44, 0.04, 1.44], radialSegments: 24, shadows: "none", surface: { color: haloColor, emissive: haloColor, emissiveIntensity: 0.45, roughness: 0.6 } },
    );
  });
  return shapes;
}
