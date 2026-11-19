import { requestSceneThumbnail } from "@jgengine/core/scene/sceneCaptureRequest.draw";
import type { GameSaveSystem } from "@jgengine/core/save/saveDocument";

export const scrapProfile: { name: string | null; thumbnail: string | null } = {
  name: null,
  thumbnail: null,
};

export async function captureScrapThumb(): Promise<string | null> {
  const shot = await requestSceneThumbnail({ width: 320, height: 180, bindingTimeoutMs: 600 });
  if (shot.ok) scrapProfile.thumbnail = shot.thumbnail;
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
