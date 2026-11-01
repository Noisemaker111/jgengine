import { useMemo } from "react";

import { registerGeneratorPreview, type GeneratorPreviewProps } from "@jgengine/core/generator/generatorPreview.draw";
import { GRASS_FIELD_OUTPUT, readGrassLook, type GrassLook } from "@jgengine/core/grass/grassKind";
import { GrassPatch } from "./GrassPatch.draw";

const SOIL = "#5d4b36";
const SAND = "#c9b48a";

/** Side of the square a grass preview grows, sized so a putting green, a lawn and tall savanna all read. */
function previewSide(look: GrassLook): number {
  return Math.max(2.5, Math.min(9, look.blade.bladeHeight * 5), Math.min(10, look.mowing.stripeWidth * 2.5));
}

function GrassPreview({ variant }: GeneratorPreviewProps) {
  const look = useMemo(() => readGrassLook(variant.meta), [variant.meta]);
  const side = previewSide(look);
  const area = useMemo(() => [side, side] as const, [side]);
  const ground = look.growth.groundCover < 0.4 ? SAND : SOIL;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[side * 3, side * 3]} />
        <meshStandardMaterial color={ground} roughness={1} />
      </mesh>
      <GrassPatch look={look} area={area} seed={variant.seed} edgeFeather={side * 0.08} groundColor={ground} />
    </>
  );
}

/** Registers the variant-tile preview for grass looks. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerGrassPreview(): void {
  registerGeneratorPreview(GRASS_FIELD_OUTPUT, {
    Component: GrassPreview,
    frame: ({ variant }) => {
      const look = readGrassLook(variant.meta);
      return { target: [0, look.blade.bladeHeight * 0.3, 0], distance: previewSide(look) * 1.15 };
    },
  });
}
