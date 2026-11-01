import { requestSceneThumbnail } from "@jgengine/core/scene/sceneCaptureRequest.draw";

/** What the park keeps about itself: its name and the frame it was left in. */
export const parkProfile: { name: string | null; thumbnail: string | null } = {
  name: null,
  thumbnail: null,
};

/** The frame a save card shows: the live scene when the binding answers, else the last one kept. */
export async function captureParkThumb(): Promise<string | null> {
  const shot = await requestSceneThumbnail({ width: 320, height: 180, bindingTimeoutMs: 600 });
  if (shot.ok) parkProfile.thumbnail = shot.thumbnail;
  return parkProfile.thumbnail;
}
