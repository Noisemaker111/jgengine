import type { EnvironmentSource } from "@jgengine/core/lighting/environmentLighting";

/** One curated Poly Haven HDRI. */
export interface HdriEntry {
  /** The id a game names, e.g. `"golden-hour"`. */
  id: string;
  title: string;
  /** The Poly Haven asset the id stands for. */
  polyhaven: string;
  author: string;
  /** Plain words for what the sky or room looks like. */
  look: string;
}

/** The shipped HDRIs, each one Poly Haven asset under a plain id. */
export const HDRI_LIBRARY = [
  { id: "clear-noon", title: "Noon Grass", polyhaven: "noon_grass", author: "Greg Zaal", look: "Clear blue sky, high sun, open grass." },
  { id: "partly-cloudy", title: "Kloppenheim 06 (Pure Sky)", polyhaven: "kloppenheim_06_puresky", author: "Greg Zaal, Jarod Guest", look: "Soft clouds, low contrast daylight." },
  { id: "golden-hour", title: "Venice Sunset", polyhaven: "venice_sunset", author: "Greg Zaal", look: "Low warm sun over water and rooftops." },
  { id: "overcast", title: "Overcast Soil (Pure Sky)", polyhaven: "overcast_soil_puresky", author: "Jarod Guest, Sergej Majboroda", look: "Even grey light, no hard shadows." },
  { id: "harbour-sunset", title: "Small Harbour Sunset", polyhaven: "small_harbour_sunset", author: "Greg Zaal", look: "Pink and orange sunset over a small harbour, sun on the horizon." },
  { id: "dusk", title: "Qwantani Dusk 2 (Pure Sky)", polyhaven: "qwantani_dusk_2_puresky", author: "Greg Zaal, Jarod Guest", look: "Sun gone, orange horizon fading to blue." },
  { id: "night-city", title: "Shanghai Bund", polyhaven: "shanghai_bund", author: "Greg Zaal", look: "City skyline lit at night across a river." },
  { id: "night-clear", title: "Satara Night", polyhaven: "satara_night", author: "Greg Zaal", look: "Open country under a clear night sky." },
  { id: "interior-industrial", title: "Industrial Workshop Foundry", polyhaven: "industrial_workshop_foundry", author: "Dimitrios Savva, Jarod Guest", look: "Large workshop with window light and dark corners." },
  { id: "forest-shade", title: "Forest Slope", polyhaven: "forest_slope", author: "Andreas Mischok", look: "Green dappled shade under trees." },
  { id: "tropical-clouds", title: "Kloofendal 38d Partly Cloudy (Pure Sky)", polyhaven: "kloofendal_38d_partly_cloudy_puresky", author: "Greg Zaal, Jarod Guest", look: "Bright blue sky with scattered white clouds, high sun." },
  { id: "snow", title: "Snowy Park 01", polyhaven: "snowy_park_01", author: "Oliksiy Yakovlyev", look: "Bright snow under a pale overcast sky." },
] as const satisfies readonly HdriEntry[];

/** The id of one HDRI in {@link HDRI_LIBRARY}. */
export type HdriId = (typeof HDRI_LIBRARY)[number]["id"];

/** Resolution every shipped HDRI is pulled at. */
export const HDRI_RESOLUTION = "2k";

/** Licence of every shipped HDRI (Poly Haven publishes all of them as CC0). */
export const HDRI_LICENSE = "CC0-1.0";

/** Where a game serves the HDRI folder from, relative to `public/`. */
export const HDRI_DIR = "hdri/library";

/** The curated HDRI record for `id`; throws naming the known ids. */
/** @internal */
export function hdriOf(id: string): HdriEntry {
  const entry = HDRI_LIBRARY.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`unknown HDRI "${id}"; known: ${HDRI_LIBRARY.map((candidate) => candidate.id).join(", ")}`);
  return entry;
}

/** Path of an HDRI under {@link HDRI_DIR}, one folder per id: `golden-hour/golden-hour.hdr`. */
/** @internal */
export function hdriFileName(id: string): string {
  const { id: known } = hdriOf(id);
  return `${known}/${known}.hdr`;
}

/** Poly Haven's own URL for the 2K file behind an id. */
/** @internal */
export function hdriOriginUrl(id: string): string {
  const { polyhaven } = hdriOf(id);
  return `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${HDRI_RESOLUTION}/${polyhaven}_${HDRI_RESOLUTION}.hdr`;
}

/**
 * A curated HDRI by id as the lighting source a scene takes: `environment: hdriEnvironment("golden-hour")`.
 * Pass `intensity` or `rotation` to retune it. Throws on an unknown id.
 *
 * @capability hdri-library pick a shipped CC0 HDRI (noon, golden hour, harbour sunset, overcast, dusk, night city, industrial interior, forest, snow) by id
 */
export function hdriEnvironment(id: HdriId, options: { intensity?: number; rotation?: number; baseUrl?: string } = {}): Extract<EnvironmentSource, { kind: "hdri" }> {
  const { baseUrl = `/${HDRI_DIR}`, ...rest } = options;
  return { kind: "hdri", url: `${baseUrl}/${hdriFileName(id)}`, ...rest };
}
