import { expect, test } from "bun:test";
import { broadcastChannelSignaling } from "./peer";

async function channelResponse<T>(response: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      response,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Native channel response timed out")), 1000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test("native signaling close rejects every pending offer and permanently fences new work", async () => {
  const signaling = broadcastChannelSignaling(`peer-close-${crypto.randomUUID()}`);
  const first = channelResponse(signaling.publishOffer("first-offer"));
  const second = channelResponse(signaling.publishOffer("second-offer"));
  const firstRejected = first.catch(error => error);
  const secondRejected = second.catch(error => error);
  signaling.close();
  signaling.close();
  for (const error of await Promise.all([firstRejected, secondRejected])) {
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Peer signaling is closed");
  }
  await expect(signaling.publishOffer("later-offer")).rejects.toThrow("Peer signaling is closed");
  expect(() => signaling.onOffer(async () => "later-answer")).toThrow("Peer signaling is closed");
});

test("native signaling keeps a replacement listener when the older listener is removed", async () => {
  const room = `peer-replace-${crypto.randomUUID()}`;
  const host = broadcastChannelSignaling(room);
  const guest = broadcastChannelSignaling(room);
  let oldCalls = 0;
  let newCalls = 0;
  try {
    const removeOld = host.onOffer(async () => { oldCalls++; return "old-answer"; });
    const removeNew = host.onOffer(async offer => { newCalls++; return `new:${offer}`; });
    removeOld();
    expect(await channelResponse(guest.publishOffer("offer-a"))).toBe("new:offer-a");
    expect(await channelResponse(guest.publishOffer("offer-b"))).toBe("new:offer-b");
    expect(oldCalls).toBe(0);
    expect(newCalls).toBe(2);
    removeNew();
  } finally {
    host.close();
    guest.close();
  }
});

test.each(["fulfilled", "rejected"])("native signaling retires an in-flight %s answer after close", async outcome => {
  const room = `peer-answer-close-${crypto.randomUUID()}`;
  const host = broadcastChannelSignaling(room);
  const guest = broadcastChannelSignaling(room);
  let begin!: () => void;
  const began = new Promise<void>(resolve => { begin = resolve; });
  let resolveAnswer!: (answer: string) => void;
  let rejectAnswer!: (error: Error) => void;
  const answer = new Promise<string>((resolve, reject) => { resolveAnswer = resolve; rejectAnswer = reject; });
  host.onOffer(() => { begin(); return answer; });
  const pending = channelResponse(guest.publishOffer("offer"));
  const rejected = pending.catch(error => error);
  try {
    await channelResponse(began);
    host.close();
    if (outcome === "fulfilled") resolveAnswer("late-answer");
    else rejectAnswer(new Error("Canceled answer callback"));
    await answer.catch(() => undefined);
    await Promise.resolve();
    guest.close();
    const error = await rejected;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Peer signaling is closed");
  } finally {
    host.close();
    guest.close();
  }
});
