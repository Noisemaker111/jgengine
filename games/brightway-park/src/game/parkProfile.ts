import { shrinkCapture } from "@jgengine/react/saveThumbnail";

/** The live frame a park card shows, read inside the canvas by `SceneCaptureBinding`. */
const reader: { current: (() => string | null) | null } = { current: null };

/** What the park keeps about itself: its name and the frame it was left in. */
export const parkProfile: { name: string | null; thumbnail: string | null } = {
  name: null,
  thumbnail: null,
};

export function bindParkCapture(read: () => string | null): void {
  reader.current = read;
}

export async function captureParkThumb(): Promise<string | null> {
  if (reader.current === null) return parkProfile.thumbnail;
  const shot = await shrinkCapture(reader.current(), { width: 320, height: 180 });
  if (shot !== null) parkProfile.thumbnail = shot;
  return parkProfile.thumbnail;
}
