import type { StaticShapeInstance } from "@jgengine/core/instancing/staticShapeInstances.draw";

type Vec3 = readonly [number, number, number];

/**
 * The open plots along the sidewalk as static primitive instances: a concrete pad, a painted
 * "HIRE HERE" disc and the affordability halo, one batch each however many plots the street authors.
 * The halo is a disk under the pad, so only its rim shows.
 */
export function plotShapes(plots: readonly { position: Vec3 }[], open: readonly boolean[], haloColor: string): StaticShapeInstance[] {
  const shapes: StaticShapeInstance[] = [];
  plots.forEach((plot, index) => {
    if (open[index] !== true) return;
    const [x, y, z] = plot.position;
    shapes.push(
      { shape: "cylinder", position: [x, y + 0.1, z], scale: [1.42, 0.2, 1.42], radialSegments: 24, shadows: "both", surface: { color: "#d8d4c8", roughness: 0.95 } },
      { shape: "cylinder", position: [x, y + 0.22, z], scale: [0.95, 0.04, 0.95], radialSegments: 24, shadows: "none", surface: { color: "#f6c84a", roughness: 0.8 } },
      { shape: "cylinder", position: [x, y + 0.26, z], scale: [1.44, 0.04, 1.44], radialSegments: 24, shadows: "none", surface: { color: haloColor, emissive: haloColor, emissiveIntensity: 0.45, roughness: 0.6 } },
    );
  });
  return shapes;
}
