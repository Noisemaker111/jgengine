import { expect, test } from "bun:test";
import { createPeerHost, decodePeerSignal, encodePeerSignal } from "./peer";

test.each(["remote", "answer", "local", "description"])(
  "failed peer acceptance disposes only its connection at the %s boundary",
  async stage => {
    const original = globalThis.RTCPeerConnection;
    let failing = false;
    const peers: ObservedPeer[] = [];
    class ObservedPeer {
      iceGatheringState = "complete";
      ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;
      localDescription: { type: "answer"; sdp: string } | null = null;
      closeCalls = 0;
      constructor() { peers.push(this); }
      async setRemoteDescription() {
        if (failing && stage === "remote") throw new Error("remote failure");
      }
      async createAnswer() {
        if (failing && stage === "answer") throw new Error("answer failure");
        return { type: "answer", sdp: "accepted-answer" };
      }
      async setLocalDescription(description: { type: "answer"; sdp: string }) {
        if (failing && stage === "local") throw new Error("local failure");
        this.localDescription = failing && stage === "description" ? null : description;
      }
      close() { this.closeCalls++; }
    }
    globalThis.RTCPeerConnection = ObservedPeer as unknown as typeof RTCPeerConnection;
    const host = createPeerHost({ userId: "host" });
    try {
      const offer = encodePeerSignal({ type: "offer", sdp: "fixture-offer" });
      expect(decodePeerSignal(await host.accept(offer))).toEqual({ type: "answer", sdp: "accepted-answer" });
      failing = true;
      await expect(host.accept(offer)).rejects.toThrow(stage === "description" ? "No local description" : `${stage} failure`);
      expect(peers[1]!.closeCalls).toBe(1);
      expect(peers[0]!.closeCalls).toBe(0);
      failing = false;
      expect(decodePeerSignal(await host.accept(offer))).toEqual({ type: "answer", sdp: "accepted-answer" });
      host.close();
      expect(peers.map(peer => peer.closeCalls)).toEqual([1, 1, 1]);
    } finally {
      host.close();
      globalThis.RTCPeerConnection = original;
    }
  },
);
