import type { OceanEnvironmentDescriptor } from "@jgengine/core/world/features";

export function oceanColor(ocean: Pick<OceanEnvironmentDescriptor, "color" | "palette" | "clarity">) {
  const palette = ocean.palette;
  return {
    shallow: ocean.color,
    ...(palette?.deep === undefined ? {} : { deep: palette.deep }),
    ...(palette?.crest === undefined ? {} : { crest: palette.crest }),
    ...(palette?.foam === undefined ? {} : { foam: palette.foam }),
    ...(palette?.fresnel === undefined ? {} : { fresnelStrength: palette.fresnel }),
    ...(ocean.clarity === undefined ? {} : { clarity: ocean.clarity }),
  };
}
