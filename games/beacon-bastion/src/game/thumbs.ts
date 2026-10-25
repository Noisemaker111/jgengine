import { shrinkCapture } from "@jgengine/react/saveThumbnail";

/**
 * The live frame reader a keep thumbnail comes from. `SceneCaptureBinding` binds it inside the
 * canvas; `captureKeepThumb` shrinks the current frame to a card-sized JPEG.
 */
const reader: { current: (() => string | null) | null } = { current: null };

/** What the keep remembers about its commander: the name they gave and the frame they left. */
export const keepProfile: { commander: string | null; thumbnail: string | null } = {
  commander: null,
  thumbnail: null,
};

export function bindKeepCapture(read: () => string | null): void {
  reader.current = read;
}

export async function captureKeepThumb(): Promise<string | null> {
  // A save can fire in the same tick as the first frame (a capture state, a very fast player):
  // give the canvas binding and one paint a moment to exist before reading.
  for (let attempt = 0; attempt < 12 && reader.current === null; attempt += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  if (reader.current === null) return keepProfile.thumbnail;
  // A save fired from a menu runs before the next frame; wait one paint so the buffer holds the
  // scene the player just left rather than the previous phase.
  if (typeof requestAnimationFrame === "function") {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }
  const shot = await shrinkCapture(reader.current(), { width: 320, height: 180 });
  if (shot !== null) keepProfile.thumbnail = shot;
  return keepProfile.thumbnail;
}
