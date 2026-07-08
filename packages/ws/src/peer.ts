import type { GameRuntime } from "@jgengine/core/runtime/gameRuntime";
import type { HostPersistence } from "@jgengine/core/runtime/hostPersistence";

import { createGameHost, memoryPersistence, type GameHost } from "./host";
import { createHostRouter, loopbackPipe, type HostRouter, type HostRouterOptions } from "./hostRouter";
import { createWsBackend, type WsBackend } from "./createWsBackend";
import type { TransportPipeFactory } from "./pipe";

export type PeerSignalPayload = { type: "offer" | "answer"; sdp: string };

const DEFAULT_ICE_GATHER_TIMEOUT_MS = 2_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function encodePeerSignal(payload: PeerSignalPayload): string {
  const base64 = btoa(JSON.stringify(payload));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePeerSignal(code: string): PeerSignalPayload | null {
  try {
    const base64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const parsed: unknown = JSON.parse(atob(padded));
    if (!isRecord(parsed)) return null;
    if (parsed.type !== "offer" && parsed.type !== "answer") return null;
    if (typeof parsed.sdp !== "string") return null;
    return { type: parsed.type, sdp: parsed.sdp };
  } catch {
    return null;
  }
}

export type PeerRtcOptions = {
  configuration?: RTCConfiguration;
  iceGatherTimeoutMs?: number;
};

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      pc.onicegatheringstatechange = null;
      clearTimeout(timer);
      resolve();
    };
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    const timer = setTimeout(finish, timeoutMs);
  });
}

function localDescriptionOrThrow(pc: RTCPeerConnection): RTCSessionDescription {
  const description = pc.localDescription;
  if (description === null) throw new Error("No local description");
  return description;
}

function bindDataChannelPipe(
  channel: RTCDataChannel,
  handlers: { onOpen: () => void; onMessage: (data: string) => void; onClose: () => void },
) {
  if (channel.readyState === "open") {
    queueMicrotask(() => handlers.onOpen());
  } else {
    channel.onopen = () => handlers.onOpen();
  }
  channel.onmessage = (event) => {
    handlers.onMessage(typeof event.data === "string" ? event.data : String(event.data));
  };
  channel.onclose = () => handlers.onClose();
}

function guestPipeFactory(channel: RTCDataChannel): TransportPipeFactory {
  let bound = false;
  return (handlers) => {
    if (bound) {
      queueMicrotask(() => handlers.onClose());
      return { send: () => undefined, close: () => undefined };
    }
    bound = true;
    bindDataChannelPipe(channel, handlers);
    return {
      send: (data) => {
        if (channel.readyState !== "open") return;
        channel.send(data);
      },
      close: () => channel.close(),
    };
  };
}

export type PeerHostOptions = {
  userId: string;
  token?: string;
  host?: GameHost;
  runtimes?: GameRuntime[];
  persistence?: HostPersistence;
  tickMs?: number;
  router?: Omit<HostRouterOptions, "host">;
  rtc?: PeerRtcOptions;
};

export type PeerHost = {
  backend: WsBackend;
  host: GameHost;
  router: HostRouter;
  accept: (offerCode: string) => Promise<string>;
  close: () => void;
};

export function createPeerHost(options: PeerHostOptions): PeerHost {
  const ownsHost = options.host === undefined;
  const host =
    options.host ??
    createGameHost({
      runtimes: options.runtimes,
      persistence: options.persistence ?? memoryPersistence(),
      tickMs: options.tickMs,
    });
  if (ownsHost) host.start();

  const router = createHostRouter({ ...options.router, host });
  const backend = createWsBackend({
    userId: options.userId,
    token: options.token,
    pipe: loopbackPipe(router),
  });

  const configuration = options.rtc?.configuration ?? {};
  const iceGatherTimeoutMs = options.rtc?.iceGatherTimeoutMs ?? DEFAULT_ICE_GATHER_TIMEOUT_MS;
  const peerConnections = new Set<RTCPeerConnection>();

  const accept = async (offerCode: string): Promise<string> => {
    const payload = decodePeerSignal(offerCode);
    if (payload === null) throw new Error("Invalid signal code");

    const pc = new RTCPeerConnection(configuration);
    peerConnections.add(pc);
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      const connection = router.connect({
        send: (data) => {
          if (channel.readyState === "open") channel.send(data);
        },
        close: () => channel.close(),
      });
      channel.onmessage = (messageEvent) => {
        connection.handleRaw(
          typeof messageEvent.data === "string" ? messageEvent.data : String(messageEvent.data),
        );
      };
      channel.onclose = () => connection.close();
    };

    await pc.setRemoteDescription({ type: payload.type, sdp: payload.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGathering(pc, iceGatherTimeoutMs);
    const description = localDescriptionOrThrow(pc);
    return encodePeerSignal({ type: "answer", sdp: description.sdp });
  };

  return {
    backend,
    host,
    router,
    accept,
    close: () => {
      for (const pc of peerConnections) pc.close();
      peerConnections.clear();
      backend.close();
      router.close();
      if (ownsHost) void host.stop();
    },
  };
}

export type PeerGuestOptions = {
  userId: string;
  token?: string;
  rtc?: PeerRtcOptions;
};

export type PeerGuest = {
  backend: WsBackend;
  offer: () => Promise<string>;
  connect: (answerCode: string) => Promise<void>;
  close: () => void;
};

export function createPeerGuest(options: PeerGuestOptions): PeerGuest {
  const configuration = options.rtc?.configuration ?? {};
  const iceGatherTimeoutMs = options.rtc?.iceGatherTimeoutMs ?? DEFAULT_ICE_GATHER_TIMEOUT_MS;

  const pc = new RTCPeerConnection(configuration);
  const channel = pc.createDataChannel("jg");

  const backend = createWsBackend({
    userId: options.userId,
    token: options.token,
    pipe: guestPipeFactory(channel),
  });

  return {
    backend,
    offer: async () => {
      const offerDescription = await pc.createOffer();
      await pc.setLocalDescription(offerDescription);
      await waitForIceGathering(pc, iceGatherTimeoutMs);
      const description = localDescriptionOrThrow(pc);
      return encodePeerSignal({ type: "offer", sdp: description.sdp });
    },
    connect: async (answerCode) => {
      const payload = decodePeerSignal(answerCode);
      if (payload === null) throw new Error("Invalid signal code");
      await pc.setRemoteDescription({ type: payload.type, sdp: payload.sdp });
    },
    close: () => {
      backend.close();
      pc.close();
    },
  };
}

export type PeerSignaling = {
  publishOffer: (offerCode: string) => Promise<string>;
  onOffer: (answer: (offerCode: string) => Promise<string>) => () => void;
  close: () => void;
};

type SignalEnvelope =
  | { t: "offer"; id: string; code: string }
  | { t: "answer"; id: string; code: string };

function isSignalEnvelope(value: unknown): value is SignalEnvelope {
  return (
    isRecord(value) &&
    (value.t === "offer" || value.t === "answer") &&
    typeof value.id === "string" &&
    typeof value.code === "string"
  );
}

export function broadcastChannelSignaling(room: string): PeerSignaling {
  const channel = new BroadcastChannel(room);
  const pendingAnswers = new Map<string, (code: string) => void>();
  let currentAnswer: ((offerCode: string) => Promise<string>) | null = null;

  channel.onmessage = (event) => {
    const envelope: unknown = event.data;
    if (!isSignalEnvelope(envelope)) return;
    if (envelope.t === "offer") {
      const answer = currentAnswer;
      if (answer === null) return;
      void answer(envelope.code).then((answerCode) => {
        channel.postMessage({ t: "answer", id: envelope.id, code: answerCode });
      });
      return;
    }
    const resolve = pendingAnswers.get(envelope.id);
    if (resolve === undefined) return;
    pendingAnswers.delete(envelope.id);
    resolve(envelope.code);
  };

  return {
    publishOffer: (offerCode) => {
      const id = crypto.randomUUID();
      return new Promise<string>((resolve) => {
        pendingAnswers.set(id, resolve);
        channel.postMessage({ t: "offer", id, code: offerCode });
      });
    },
    onOffer: (answer) => {
      currentAnswer = answer;
      return () => {
        if (currentAnswer === answer) currentAnswer = null;
      };
    },
    close: () => {
      pendingAnswers.clear();
      channel.close();
    },
  };
}

export function announcePeerHost(host: PeerHost, signaling: PeerSignaling): () => void {
  return signaling.onOffer(host.accept);
}

export async function joinPeerSession(guest: PeerGuest, signaling: PeerSignaling): Promise<WsBackend> {
  const offerCode = await guest.offer();
  const answerCode = await signaling.publishOffer(offerCode);
  await guest.connect(answerCode);
  return guest.backend;
}
