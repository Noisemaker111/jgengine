import { requestSceneThumbnail } from "@jgengine/core/scene/sceneCaptureRequest.draw";

export const parkProfile: { name: string | null; thumbnail: string | null } = {
  name: null,
  thumbnail: null,
};

export async function captureParkThumb(): Promise<string | null> {
  const shot = await requestSceneThumbnail({ width: 320, height: 180, bindingTimeoutMs: 600 });
  if (shot.ok) parkProfile.thumbnail = shot.thumbnail;
  return parkProfile.thumbnail;
}
