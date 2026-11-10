/** The browser video methods used by a frame feed. */
export interface VideoFrameSource {
  requestVideoFrameCallback(callback: () => void): number;
  cancelVideoFrameCallback(id: number): void;
  play(): Promise<void>;
  pause(): void;
}

/** Deliver changed video frames, with no animation-frame polling. @internal */
export function watchVideoFrames<T extends VideoFrameSource>(video: T, onFrame: (video: T) => void, onError: (error: unknown) => void): () => void {
  let active = true;
  let pending = 0;
  const stop = (): void => {
    if (!active) return;
    active = false;
    video.cancelVideoFrameCallback(pending);
    video.pause();
  };
  const fail = (error: unknown): void => {
    if (!active) return;
    stop();
    onError(error);
  };
  const next = (): void => {
    if (!active) return;
    try {
      onFrame(video);
      if (active) pending = video.requestVideoFrameCallback(next);
    } catch (error) {
      fail(error);
    }
  };
  try {
    pending = video.requestVideoFrameCallback(next);
    void video.play().catch(fail);
  } catch (error) {
    fail(error);
  }
  return stop;
}
