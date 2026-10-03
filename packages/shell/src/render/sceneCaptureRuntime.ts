import { createPhotoModeStore, type PhotoModeState, type PhotoModeStore } from "@jgengine/core/ui/photoMode";

/** The bit of a WebGL renderer scene capture needs — its backing `<canvas>`. */
export interface CaptureRenderer {
  domElement: { toDataURL(type?: string): string; width?: number; height?: number };
  getContext?: () => { isContextLost(): boolean };
}

function isPngDataUrl(url: string): boolean {
  return /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(url);
}

/**
 * Read the current frame to a PNG data URL. Requires the R3F `<Canvas>` to have
 * been created with `gl={{ preserveDrawingBuffer: true }}` (the shell's game
 * canvas already is); returns null if the backing canvas can't be read.
 *
 * @capability capture-canvas read the live R3F frame to a PNG data URL (needs preserveDrawingBuffer)
 */
export function captureCanvas(gl: CaptureRenderer): string | null {
  try {
    if (gl.domElement.width === 0 || gl.domElement.height === 0 || gl.getContext?.().isContextLost()) return null;
    const url = gl.domElement.toDataURL("image/png");
    return isPngDataUrl(url) ? url : null;
  } catch {
    return null;
  }
}

/**
 * Trigger a browser download of an image data URL (the photo-mode "save" action).
 * @capability download-image save a captured PNG through the browser download control
 */
export function downloadImage(dataUrl: string, filename = "screenshot.png"): void {
  if (typeof document === "undefined") throw new Error("Image download requires a browser document.");
  if (!isPngDataUrl(dataUrl)) throw new Error("The captured image is not a PNG data URL.");
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
  }
}

/** Live renderer availability and the current photograph operation. */
export interface SceneCaptureState {
  readonly ready: boolean;
  readonly capturing: boolean;
  readonly error: string | null;
}

/** Pixel read and browser download dispatch outcome; failure never substitutes an image. */
export type SceneCaptureResult =
  | { ok: true; dataUrl: string }
  | { ok: false; reason: "not-ready" | "busy" | "unmounted" | "capture-failed" | "download-failed"; message: string };

/** Presentation to hide while taking a photograph. Its inline visibility is restored exactly. */
export interface SceneCaptureRequest {
  filename?: string;
  overlay?: Pick<HTMLElement, "style"> | null;
}

/** Inject photo preferences, frame scheduling or download policy. Scheduling returns cancellation. */
export interface SceneCaptureOptions {
  photoMode?: PhotoModeStore;
  requestFrame?: (capture: () => void) => () => void;
  download?: (dataUrl: string, filename: string) => void;
}

/** A single renderer's photograph operation, shared between its canvas and HUD. */
export interface SceneCapture {
  photoMode: PhotoModeStore;
  get(): SceneCaptureState;
  subscribe(listener: () => void): () => void;
  bind(capture: () => string | null, requestFrame?: SceneCaptureOptions["requestFrame"]): () => void;
  capture(request?: SceneCaptureRequest): Promise<SceneCaptureResult>;
  /** Cancel only this instance's pending photograph and restore its overlay. */
  cancel(): void;
  /** Save photo preferences; renderer bindings and in-flight work are transient. */
  snapshot(): PhotoModeState;
  /** Cancel in-flight work and restore photo preferences. */
  restore(snapshot: Partial<PhotoModeState>): void;
}

function requestCaptureFrame(capture: () => void): () => void {
  if (typeof requestAnimationFrame === "undefined") throw new Error("Scene capture requires a browser frame.");
  const frame = requestAnimationFrame(capture);
  return () => cancelAnimationFrame(frame);
}

/**
 * Capture one freshly rendered game frame, restore presentation and download its PNG.
 * Renderer replacement cancels the old operation; overlapping requests fail as busy.
 *
 * @capability scene-photograph per-instance rendered PNG capture and download with presentation restoration
 */
export function createSceneCapture(options: SceneCaptureOptions = {}): SceneCapture {
  const photoMode = options.photoMode ?? createPhotoModeStore();
  const requestFrame = options.requestFrame ?? requestCaptureFrame;
  const download = options.download ?? downloadImage;
  const listeners = new Set<() => void>();
  let state: SceneCaptureState = { ready: false, capturing: false, error: null };
  let binding: { read: () => string | null; requestFrame: NonNullable<SceneCaptureOptions["requestFrame"]> } | null = null;
  let pending: { cancel: () => void } | null = null;

  function publish(capturing: boolean, error: string | null): void {
    state = { ready: binding !== null, capturing, error };
    for (const listener of listeners) listener();
  }

  function failure(reason: Extract<SceneCaptureResult, { ok: false }>["reason"], message: string): SceneCaptureResult {
    return { ok: false, reason, message };
  }

  return {
    photoMode,
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    bind(read, schedule = requestFrame) {
      const next = { read, requestFrame: schedule };
      binding = next;
      pending?.cancel();
      publish(false, null);
      return () => {
        if (binding !== next) return;
        binding = null;
        if (pending !== null) pending.cancel();
        else publish(false, null);
      };
    },
    capture({ filename = "screenshot.png", overlay = null } = {}) {
      if (pending !== null) return Promise.resolve(failure("busy", "A photograph is already being captured."));
      const renderer = binding;
      if (renderer === null) {
        const message = "The game renderer is not ready.";
        publish(false, message);
        return Promise.resolve(failure("not-ready", message));
      }
      return new Promise<SceneCaptureResult>((resolve) => {
        const style = overlay?.style;
        const visibility = style?.getPropertyValue("visibility") ?? "";
        const priority = style?.getPropertyPriority("visibility") ?? "";
        let cancelFrame: (() => void) | undefined;
        const operation = { cancel: () => finish(failure("unmounted", "Capture was cancelled before completion.")) };

        function finish(result: SceneCaptureResult): void {
          if (pending !== operation) return;
          pending = null;
          cancelFrame?.();
          if (style !== undefined) {
            if (visibility === "") style.removeProperty("visibility");
            else style.setProperty("visibility", visibility, priority);
          }
          publish(false, result.ok ? null : result.message);
          resolve(result);
        }

        pending = operation;
        try {
          style?.setProperty("visibility", "hidden", "important");
          publish(true, null);
          if (pending !== operation) return;
          cancelFrame = renderer.requestFrame(() => {
            if (pending !== operation) return;
            if (binding !== renderer) {
              operation.cancel();
              return;
            }
            let dataUrl: string | null;
            try {
              dataUrl = renderer.read();
              if (dataUrl === null || !isPngDataUrl(dataUrl)) throw new Error("The game renderer could not produce a PNG.");
            } catch (error) {
              finish(failure("capture-failed", error instanceof Error ? error.message : "Scene capture failed."));
              return;
            }
            if (pending !== operation || binding !== renderer) return;
            try {
              download(dataUrl, filename);
              finish({ ok: true, dataUrl });
            } catch (error) {
              finish(failure("download-failed", error instanceof Error ? error.message : "Image download failed."));
            }
          });
          if (pending !== operation) cancelFrame();
        } catch (error) {
          finish(failure("capture-failed", error instanceof Error ? error.message : "Scene capture failed."));
        }
      });
    },
    cancel() { pending?.cancel(); },
    snapshot: () => photoMode.snapshot(),
    restore(snapshot) {
      pending?.cancel();
      photoMode.restore(snapshot);
    },
  };
}

const captures = new WeakMap<object, SceneCapture>();

/**
 * Share photograph state between one game's renderer and controls.
 * @capability scene-capture-for retrieve photograph state scoped to a game instance
 */
export function sceneCaptureFor(instance: object): SceneCapture {
  let capture = captures.get(instance);
  if (capture === undefined) {
    capture = createSceneCapture();
    captures.set(instance, capture);
  }
  return capture;
}
