import type { EnvironmentSource } from "@jgengine/core/lighting/environmentLighting";

import { HDRI_LIBRARY } from "./hdris/index";

export interface HdriEntry {
  id: string;
  title: string;
  polyhaven: string;
  author: string;
  look: string;
}

export { HDRI_LIBRARY };

export type HdriId = (typeof HDRI_LIBRARY)[number]["id"];

export const HDRI_RESOLUTION = "2k";

export const HDRI_LICENSE = "CC0-1.0";

export const HDRI_DIR = "hdri/library";

/** @internal */
export function hdriOf(id: string): HdriEntry {
  const entry = HDRI_LIBRARY.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`unknown HDRI "${id}"; known: ${HDRI_LIBRARY.map((candidate) => candidate.id).join(", ")}`);
  return entry;
}

/** @internal */
export function hdriFileName(id: string): string {
  const { id: known } = hdriOf(id);
  return `${known}/${known}.hdr`;
}

/** @internal */
export function hdriOriginUrl(id: string): string {
  const { polyhaven } = hdriOf(id);
  return `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${HDRI_RESOLUTION}/${polyhaven}_${HDRI_RESOLUTION}.hdr`;
}

/** @capability hdri-library pick a shipped CC0 HDRI (noon, clear sky, golden hour, harbour sunset, industrial sunset, overcast, dusk, night city, industrial interior, forest, snow) by id */
export function hdriEnvironment(id: HdriId, options: { intensity?: number; rotation?: number; baseUrl?: string } = {}): Extract<EnvironmentSource, { kind: "hdri" }> {
  const { baseUrl = `/${HDRI_DIR}`, ...rest } = options;
  return { kind: "hdri", url: `${baseUrl}/${hdriFileName(id)}`, ...rest };
}
