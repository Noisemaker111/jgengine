import { PerspectiveCamera, View } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ReactNode } from "react";

import type { GeneratorDefinition, GeneratorVariant } from "@jgengine/core/generator/generator";
import { getGeneratorPreview } from "@jgengine/core/generator/generatorPreview.draw";

/** Props for {@link GeneratorVariantGrid}. */
export interface GeneratorVariantGridProps {
  definition: GeneratorDefinition;
  /** The variants to show, usually `generatorVariants(definition, meta)`. */
  variants: readonly GeneratorVariant[];
  /** Index of the variant to outline as current. */
  selected?: number | undefined;
  /** Indices of kept variants, marked with a pin. */
  kept?: readonly number[] | undefined;
  /** Click on a tile. */
  onPick?: ((variant: GeneratorVariant) => void) | undefined;
  /** Extra controls under each tile (keep, place, …). */
  actions?: ((variant: GeneratorVariant) => ReactNode) | undefined;
  /** Tiles per row. Default 4. */
  columns?: number;
  /** Accent colour for the selected outline. */
  accent?: string;
}

function PreviewScene({ definition, variant }: { definition: GeneratorDefinition; variant: GeneratorVariant }) {
  const preview = getGeneratorPreview(definition.output);
  if (preview === undefined) return null;
  const frame = preview.frame({ definition, variant });
  const [tx, ty, tz] = frame.target;
  const d = Math.max(0.05, frame.distance);
  return (
    <>
      <PerspectiveCamera
        makeDefault
        fov={35}
        near={Math.max(0.005, d * 0.01)}
        far={d * 20}
        position={[tx + d * 0.72, ty + d * 0.42, tz + d * 0.72]}
        onUpdate={(camera) => camera.lookAt(tx, ty, tz)}
      />
      <color attach="background" args={["#1c2127"]} />
      <hemisphereLight args={["#dfe9ff", "#4a4034", 0.9]} />
      <directionalLight position={[d * 0.6, d * 1.4, d * 0.3]} intensity={2.2} />
      <preview.Component definition={definition} variant={variant} />
    </>
  );
}

/**
 * A grid of seeded generator variants, each drawn live in its own tile. Every tile is a drei `View`
 * into one shared canvas, so twenty variants cost one WebGL context. Tiles draw through the
 * preview registered for the generator's output family; a family with none shows its seed only.
 */
export function GeneratorVariantGrid({ definition, variants, selected, kept, onPick, actions, columns = 4, accent = "#7fbf4d" }: GeneratorVariantGridProps) {
  const hasPreview = getGeneratorPreview(definition.output) !== undefined;
  const keptSet = new Set(kept ?? []);
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 6 }}>
        {variants.map((variant) => (
          <div key={`${variant.index}-${variant.seed}`} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <button
              type="button"
              title={`Variant ${variant.index} · seed ${variant.seed}`}
              data-variant={variant.index}
              onClick={() => onPick?.(variant)}
              style={{
                position: "relative",
                aspectRatio: "1",
                padding: 0,
                border: `2px solid ${variant.index === selected ? accent : "transparent"}`,
                borderRadius: 6,
                background: "#1c2127",
                cursor: "pointer",
                overflow: "hidden",
              }}
            >
              {hasPreview ? (
                <View style={{ position: "absolute", inset: 0 }}>
                  <PreviewScene definition={definition} variant={variant} />
                </View>
              ) : null}
              <span style={{ position: "absolute", zIndex: 2, left: 4, bottom: 2, fontSize: 10, color: "#e8e8e8", textShadow: "0 1px 2px #000" }}>
                {keptSet.has(variant.index) ? "📌 " : ""}
                {variant.index}
              </span>
            </button>
            {actions?.(variant)}
          </div>
        ))}
      </div>
      {hasPreview ? (
        <Canvas style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }} dpr={[1, 1.5]} gl={{ antialias: true }}>
          <View.Port />
        </Canvas>
      ) : null}
    </div>
  );
}
