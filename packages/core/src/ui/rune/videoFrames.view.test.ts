import { expect, test } from "bun:test";
import { watchVideoFrames } from "./videoFrames.view";

function videoFeed(play: () => Promise<void> = async () => {}) {
  const callbacks = new Map<number, () => void>();
  let next = 0;
  let paused = 0;
  return {
    callbacks,
    get paused() { return paused; },
    requestVideoFrameCallback(callback: () => void) { callbacks.set(++next, callback); return next; },
    cancelVideoFrameCallback(id: number) { callbacks.delete(id); },
    play,
    pause() { paused++; },
    present() { const first = callbacks.entries().next().value; if (first !== undefined) { callbacks.delete(first[0]); first[1](); } },
  };
}

test("only presented frames wake the consumer and one callback stays armed", () => {
  const video = videoFeed();
  let frames = 0;
  const stop = watchVideoFrames(video, () => frames++, error => { throw error; });
  expect(frames).toBe(0);
  video.present();
  expect(frames).toBe(1);
  expect(video.callbacks.size).toBe(1);
  stop();
  expect(video.callbacks.size).toBe(0);
  expect(video.paused).toBe(1);
});

test("disposing a feed ignores callbacks already dispatched and late playback errors", async () => {
  let rejectPlay: (error: Error) => void = () => {};
  const video = videoFeed(() => new Promise<void>((_resolve, reject) => { rejectPlay = reject; }));
  let frames = 0;
  const errors: unknown[] = [];
  const stop = watchVideoFrames(video, () => frames++, error => errors.push(error));
  const pending = [...video.callbacks.values()][0];
  stop();
  stop();
  pending?.();
  rejectPlay(new Error("source removed"));
  await Promise.resolve();
  expect(frames).toBe(0);
  expect(errors).toEqual([]);
  expect(video.paused).toBe(1);
});

test("a failed upload stops the feed and reports the error once", () => {
  const video = videoFeed();
  const failure = new Error("upload failed");
  const errors: unknown[] = [];
  watchVideoFrames(video, () => { throw failure; }, error => errors.push(error));
  video.present();
  video.present();
  expect(errors).toEqual([failure]);
  expect(video.callbacks.size).toBe(0);
  expect(video.paused).toBe(1);
});
