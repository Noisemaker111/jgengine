import { shrinkCapture } from "@jgengine/react/saveThumbnail";
import type { GameSaveSystem } from "@jgengine/core/game/gameSave";

/**
 * The live frame a save card shows, read inside the canvas by `SceneCaptureBinding`.
 */
const reader: { current: (() => string | null) | null } = { current: null };

/** What a dispatch keeps about its courier: the name they gave and the frame they left. */
export const harborProfile: { driver: string | null; thumbnail: string | null } = {
  driver: null,
  thumbnail: null,
};

export function bindHarborCapture(read: () => string | null): void {
  reader.current = read;
}

export async function captureHarborThumb(): Promise<string | null> {
  for (let attempt = 0; attempt < 12 && reader.current === null; attempt += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  if (reader.current === null) return harborProfile.thumbnail;
  if (typeof requestAnimationFrame === "function") {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }
  const shot = await shrinkCapture(reader.current(), { width: 320, height: 180 });
  if (shot !== null) harborProfile.thumbnail = shot;
  return harborProfile.thumbnail;
}

export function harborProfileSystem(): GameSaveSystem {
  return {
    name: "profile",
    snapshot: () => ({ driver: harborProfile.driver, thumbnail: harborProfile.thumbnail }),
    restore: (next) => {
      const value = next as { driver?: string | null; thumbnail?: string | null };
      harborProfile.driver = typeof value.driver === "string" ? value.driver : null;
      harborProfile.thumbnail = typeof value.thumbnail === "string" ? value.thumbnail : null;
    },
    reset: () => {
      harborProfile.driver = null;
      harborProfile.thumbnail = null;
    },
  };
}
