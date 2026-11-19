import type { GameSaveSystem } from "@jgengine/core/save/saveDocument";
import { requestSceneThumbnail } from "@jgengine/core/scene/sceneCaptureRequest.draw";

export const harborProfile: { driver: string | null; thumbnail: string | null } = {
  driver: null,
  thumbnail: null,
};

export async function captureHarborThumb(): Promise<string | null> {
  const shot = await requestSceneThumbnail({ width: 320, height: 180, bindingTimeoutMs: 600 });
  if (shot.ok) harborProfile.thumbnail = shot.thumbnail;
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
