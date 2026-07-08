import { describe, expect, test } from "bun:test";

import {
  announcePeerHost,
  broadcastChannelSignaling,
  createPeerHost,
  decodePeerSignal,
  encodePeerSignal,
  type PeerSignalPayload,
  type PeerSignaling,
} from "./peer";

describe("encodePeerSignal / decodePeerSignal", () => {
  test("round-trips an offer payload", () => {
    const payload: PeerSignalPayload = { type: "offer", sdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n" };
    const code = encodePeerSignal(payload);
    expect(code).not.toMatch(/[+/=]/);
    expect(decodePeerSignal(code)).toEqual(payload);
  });

  test("round-trips an answer payload", () => {
    const payload: PeerSignalPayload = { type: "answer", sdp: "sdp-body" };
    expect(decodePeerSignal(encodePeerSignal(payload))).toEqual(payload);
  });

  test("returns null for garbage input", () => {
    expect(decodePeerSignal("not-base64-!!!")).toBeNull();
    expect(decodePeerSignal("")).toBeNull();
    expect(decodePeerSignal(btoa(JSON.stringify({ foo: "bar" })))).toBeNull();
    expect(decodePeerSignal(btoa(JSON.stringify({ type: "bogus", sdp: "x" })))).toBeNull();
    expect(decodePeerSignal(btoa("not json"))).toBeNull();
  });
});

const hasBroadcastChannel = typeof BroadcastChannel !== "undefined";

describe.if(hasBroadcastChannel)("broadcastChannelSignaling", () => {
  test("relays an offer to the answering side and resolves with the answer", async () => {
    const room = `peer-test-${crypto.randomUUID()}`;
    const hostSide = broadcastChannelSignaling(room);
    const guestSide = broadcastChannelSignaling(room);
    try {
      const stopAnnouncing = hostSide.onOffer(async (offerCode) => {
        expect(offerCode).toBe("offer-code");
        return "answer-code";
      });
      const answer = await guestSide.publishOffer("offer-code");
      expect(answer).toBe("answer-code");
      stopAnnouncing();
    } finally {
      hostSide.close();
      guestSide.close();
    }
  });
});

describe.if(!hasBroadcastChannel)("in-memory PeerSignaling (BroadcastChannel unavailable in this runtime)", () => {
  function inMemorySignaling(): PeerSignaling {
    let currentAnswer: ((offerCode: string) => Promise<string>) | null = null;
    return {
      publishOffer: async (offerCode) => {
        if (currentAnswer === null) throw new Error("no host announcing");
        return currentAnswer(offerCode);
      },
      onOffer: (answer) => {
        currentAnswer = answer;
        return () => {
          if (currentAnswer === answer) currentAnswer = null;
        };
      },
      close: () => {
        currentAnswer = null;
      },
    };
  }

  test("onOffer handler answers and publishOffer resolves with it", async () => {
    const signaling = inMemorySignaling();
    const stop = signaling.onOffer(async (offerCode) => `answered:${offerCode}`);
    const answer = await signaling.publishOffer("offer-code");
    expect(answer).toBe("answered:offer-code");
    stop();
    signaling.close();
  });
});

describe("createPeerHost", () => {
  test("exposes a working loopback backend and stops cleanly on close", async () => {
    const peerHost = createPeerHost({ userId: "host-player" });
    try {
      const joined = await peerHost.backend.transport.joinServer({ gameId: "test-game" });
      expect(joined.isNew).toBe(true);

      const result = await peerHost.backend.transport.runCommand({
        serverId: joined.serverId,
        command: "engine.ping",
        input: null,
      });
      expect(result).toEqual({ ok: true });
    } finally {
      peerHost.close();
    }
  });

  test("announcePeerHost wires signaling onOffer straight to host.accept", () => {
    const peerHost = createPeerHost({ userId: "host-player" });
    let boundAnswer: ((offerCode: string) => Promise<string>) | null = null;
    const signaling: PeerSignaling = {
      publishOffer: () => Promise.reject(new Error("unused")),
      onOffer: (answer) => {
        boundAnswer = answer;
        return () => {
          boundAnswer = null;
        };
      },
      close: () => undefined,
    };
    const stop = announcePeerHost(peerHost, signaling);
    expect(boundAnswer).toBe(peerHost.accept);
    stop();
    expect(boundAnswer).toBeNull();
    peerHost.close();
  });
});
