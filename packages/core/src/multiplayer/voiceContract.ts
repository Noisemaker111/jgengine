export interface VoiceParticipant {
  userId: string;
  streamId?: string;
}

export interface VoiceRoute {
  fromUserId: string;
  channelId: string;
  gain: number;
}

/**
 * Signaling seam for voice: who is in a channel and which media stream
 * descriptor they published. The media plane (WebRTC, SFU, or anything else
 * that moves audio bytes) stays behind this seam, host-supplied — the engine
 * never touches it. subscribers delivers the channel roster on every change,
 * starting with the current roster.
 */
export interface VoiceTransport {
  join(channelId: string, streamId?: string): Promise<void>;
  leave(channelId: string): Promise<void>;
  publish(channelId: string, streamId: string): Promise<void>;
  subscribers(
    channelId: string,
    onChange: (participants: readonly VoiceParticipant[]) => void,
  ): () => void;
}

export function createLocalVoiceTransport(options?: { userId?: string }): {
  transport: VoiceTransport;
  participants(channelId: string): readonly VoiceParticipant[];
} {
  const userId = options?.userId ?? "local";
  const rosters = new Map<string, Map<string, VoiceParticipant>>();
  const listeners = new Map<string, Set<(participants: readonly VoiceParticipant[]) => void>>();

  function roster(channelId: string): Map<string, VoiceParticipant> {
    let entries = rosters.get(channelId);
    if (entries === undefined) {
      entries = new Map();
      rosters.set(channelId, entries);
    }
    return entries;
  }

  function snapshot(channelId: string): readonly VoiceParticipant[] {
    return [...roster(channelId).values()].map((participant) => ({ ...participant }));
  }

  function notify(channelId: string): void {
    const current = snapshot(channelId);
    for (const listener of listeners.get(channelId) ?? []) listener(current);
  }

  const transport: VoiceTransport = {
    join(channelId, streamId) {
      const participant: VoiceParticipant = { userId };
      if (streamId !== undefined) participant.streamId = streamId;
      roster(channelId).set(userId, participant);
      notify(channelId);
      return Promise.resolve();
    },
    leave(channelId) {
      if (roster(channelId).delete(userId)) notify(channelId);
      return Promise.resolve();
    },
    publish(channelId, streamId) {
      const participant = roster(channelId).get(userId);
      if (participant !== undefined) {
        participant.streamId = streamId;
        notify(channelId);
      }
      return Promise.resolve();
    },
    subscribers(channelId, onChange) {
      let set = listeners.get(channelId);
      if (set === undefined) {
        set = new Set();
        listeners.set(channelId, set);
      }
      set.add(onChange);
      onChange(snapshot(channelId));
      return () => {
        set.delete(onChange);
        if (set.size === 0) listeners.delete(channelId);
      };
    },
  };

  return { transport, participants: snapshot };
}

export type PushToTalkMode = "hold" | "toggle" | "openMic";

export type PushToTalkStatus = "idle" | "keyed" | "open";

export interface PushToTalk {
  mode(): PushToTalkMode;
  setMode(mode: PushToTalkMode): void;
  keyDown(): void;
  keyUp(): void;
  muted(): boolean;
  setMuted(muted: boolean): void;
  status(): PushToTalkStatus;
  transmitting(): boolean;
}

export function createPushToTalk(config?: {
  mode?: PushToTalkMode;
  onChange?: (transmitting: boolean) => void;
}): PushToTalk {
  let mode: PushToTalkMode = config?.mode ?? "hold";
  let keyed = false;
  let muted = false;
  let lastTransmitting = false;

  function transmitting(): boolean {
    if (muted) return false;
    return mode === "openMic" ? true : keyed;
  }

  function emit(): void {
    const current = transmitting();
    if (current === lastTransmitting) return;
    lastTransmitting = current;
    config?.onChange?.(current);
  }

  return {
    mode: () => mode,
    setMode(next) {
      mode = next;
      keyed = false;
      emit();
    },
    keyDown() {
      if (mode === "hold") keyed = true;
      else if (mode === "toggle") keyed = !keyed;
      emit();
    },
    keyUp() {
      if (mode === "hold") keyed = false;
      emit();
    },
    muted: () => muted,
    setMuted(next) {
      muted = next;
      emit();
    },
    status() {
      if (mode === "openMic") return "open";
      return keyed ? "keyed" : "idle";
    },
    transmitting,
  };
}
