/**
 * Asking the live scene for a frame without owning the canvas. A game mounts the
 * {@link import("./sceneCapture").SceneCaptureBinding} once and then requests a thumbnail when it
 * saves. The request survives the two ways a hand-written capture goes blank — the binding mounting
 * after the save screen rendered, and reading the canvas before its first painted frame — so no game
 * polls for the binding or waits frames of its own.
 */

import { shrinkCapture, type SaveThumbnailOptions } from "@jgengine/react/saveThumbnail";

/** Reads the current scene frame as an image data URL, or null when the frame cannot be read. */
export type SceneCapture = () => string | null;

/** Why a capture request produced no image. */
export type SceneCaptureFailure = "no-binding" | "no-frame" | "undecodable";

/** A captured frame, or the stated reason there is none. */
export type SceneCaptureResult =
  | { ok: true; capture: string }
  | { ok: false; reason: SceneCaptureFailure };

/** A save-card thumbnail, or the stated reason there is none. */
export type SceneThumbnailResult =
  | { ok: true; thumbnail: string }
  | { ok: false; reason: SceneCaptureFailure };

/** How a capture request waits and retries. */
export interface SceneCaptureRequestOptions {
  /**
   * How long to wait for a capture binding to mount, in milliseconds. Default 5000. A game that
   * never mounts the binding gets `"no-binding"` instead of a request that never settles.
   */
  bindingTimeoutMs?: number;
  /**
   * Painted frames to wait after the binding appears before reading, so the read lands after the
   * canvas has drawn at least once. Default 2, which is one paint.
   */
  settleFrames?: number;
  /** Reads attempted on later frames before reporting `"no-frame"`. Default 3. */
  attempts?: number;
}

/** The registered reader, and the requests waiting for one to appear. */
let bound: SceneCapture | null = null;
const waiting = new Set<(capture: SceneCapture) => void>();

/**
 * Hand the capture path a reader for the live frame, or `null` to retire it. The returned function
 * unbinds only that reader, so a canvas that remounts cannot be unbound by its predecessor.
 */
export function registerSceneCapture(capture: SceneCapture | null): () => void {
  bound = capture;
  if (capture !== null) {
    for (const resolve of [...waiting]) {
      waiting.delete(resolve);
      resolve(capture);
    }
  }
  return () => {
    if (bound === capture) bound = null;
  };
}

function settleFrames(count: number): Promise<void> {
  if (typeof requestAnimationFrame !== "function") return Promise.resolve();
  return new Promise((resolve) => {
    let remaining = count;
    const step = (): void => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function waitForBinding(timeoutMs: number): Promise<SceneCapture | null> {
  if (bound !== null) return Promise.resolve(bound);
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (capture: SceneCapture | null): void => {
      if (settled) return;
      settled = true;
      waiting.delete(onReady);
      if (timer !== undefined) clearTimeout(timer);
      resolve(capture);
    };
    const onReady = (capture: SceneCapture): void => settle(capture);
    waiting.add(onReady);
    timer = setTimeout(() => settle(null), timeoutMs);
  });
}

function read(capture: SceneCapture): string | null {
  try {
    const image = capture();
    return typeof image === "string" && image.startsWith("data:image") ? image : null;
  } catch {
    return null;
  }
}

/**
 * Request the current scene frame. Resolves once a binding exists and the canvas has painted, or
 * with the reason no frame could be read; it never polls and never rejects.
 *
 * @capability request-scene-capture request the live scene frame, waiting for a late binding and the first painted frame
 */
export async function requestSceneCapture(
  options: SceneCaptureRequestOptions = {},
): Promise<SceneCaptureResult> {
  const capture = await waitForBinding(options.bindingTimeoutMs ?? 5000);
  if (capture === null) return { ok: false, reason: "no-binding" };
  await settleFrames(options.settleFrames ?? 2);
  const attempts = options.attempts ?? 3;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const image = read(capture);
    if (image !== null) return { ok: true, capture: image };
    if (attempt < attempts - 1) await settleFrames(1);
  }
  return { ok: false, reason: "no-frame" };
}

/**
 * Request a save-card thumbnail from the live scene: the shared capture request, then
 * `shrinkCapture`. Pass what the slot card stores; omit everything for a 320x180 JPEG.
 *
 * @capability request-scene-thumbnail request a save-card thumbnail from the live scene, or a stated failure
 */
export async function requestSceneThumbnail(
  options: SceneCaptureRequestOptions & SaveThumbnailOptions = {},
): Promise<SceneThumbnailResult> {
  const source = await requestSceneCapture(options);
  if (!source.ok) return source;
  let thumbnail: string | null = null;
  try {
    thumbnail = await shrinkCapture(source.capture, options);
  } catch {
    thumbnail = null;
  }
  return thumbnail === null ? { ok: false, reason: "undecodable" } : { ok: true, thumbnail };
}
