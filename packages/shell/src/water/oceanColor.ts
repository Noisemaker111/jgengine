import type { OceanEnvironmentDescriptor } from "@jgengine/core/world/features";

/** The descriptor's colors in the shell Ocean's terms; unset palette fields keep the Ocean default. */
export function oceanColor(ocean: Pick<OceanEnvironmentDescriptor, "color" | "palette">) {
  const palette = ocean.palette;
  return {
    shallow: ocean.color,
    ...(palette?.deep === undefined ? {} : { deep: palette.deep }),
    ...(palette?.crest === undefined ? {} : { crest: palette.crest }),
    ...(palette?.foam === undefined ? {} : { foam: palette.foam }),
    ...(palette?.fresnel === undefined ? {} : { fresnelStrength: palette.fresnel }),
  };
}
