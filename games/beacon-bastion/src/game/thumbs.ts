import { requestSceneThumbnail } from "@jgengine/core/scene/sceneCaptureRequest.draw";

export const keepProfile: { commander: string | null; thumbnail: string | null } = {
  commander: null,
  thumbnail: null,
};

export async function captureKeepThumb(): Promise<string | null> {
  const shot = await requestSceneThumbnail({ width: 320, height: 180, bindingTimeoutMs: 600 });
  if (shot.ok) keepProfile.thumbnail = shot.thumbnail;
  return keepProfile.thumbnail;
}
