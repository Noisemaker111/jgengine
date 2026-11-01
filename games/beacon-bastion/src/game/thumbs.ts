import { requestSceneThumbnail } from "@jgengine/core/scene/sceneCaptureRequest.draw";

/** What the keep remembers about its commander: the name they gave and the frame they left. */
export const keepProfile: { commander: string | null; thumbnail: string | null } = {
  commander: null,
  thumbnail: null,
};

/** The frame a save card shows: the live scene when the binding answers, else the last one kept. */
export async function captureKeepThumb(): Promise<string | null> {
  const shot = await requestSceneThumbnail({ width: 320, height: 180, bindingTimeoutMs: 600 });
  if (shot.ok) keepProfile.thumbnail = shot.thumbnail;
  return keepProfile.thumbnail;
}
