import type { GameSaveSystem } from "@jgengine/core/game/gameSave";
import { shrinkCapture } from "@jgengine/react/saveThumbnail";

/** The live frame a run card shows, read inside the canvas by `SceneCaptureBinding`. */
const reader: { current: (() => string | null) | null } = { current: null };

/** What a kept run remembers: the reclaimer's call sign and the frame it left. */
export const scrapProfile: { name: string | null; thumbnail: string | null } = {
  name: null,
  thumbnail: null,
};

export function bindScrapCapture(read: () => string | null): void {
  reader.current = read;
}

export async function captureScrapThumb(): Promise<string | null> {
  if (reader.current === null) return scrapProfile.thumbnail;
  const shot = await shrinkCapture(reader.current(), { width: 320, height: 180 });
  if (shot !== null) scrapProfile.thumbnail = shot;
  return scrapProfile.thumbnail;
}

export function scrapProfileSystem(): GameSaveSystem {
  return {
    name: "profile",
    snapshot: () => ({ name: scrapProfile.name, thumbnail: scrapProfile.thumbnail }),
    restore: (next) => {
      const value = next as { name?: string | null; thumbnail?: string | null };
      scrapProfile.name = typeof value.name === "string" ? value.name : null;
      scrapProfile.thumbnail = typeof value.thumbnail === "string" ? value.thumbnail : null;
    },
    reset: () => {
      scrapProfile.name = null;
      scrapProfile.thumbnail = null;
    },
  };
}
