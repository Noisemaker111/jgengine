import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  createPushToTalk,
  type PushToTalkMode,
  type PushToTalkStatus,
  type VoiceParticipant,
  type VoiceRoute,
  type VoiceTransport,
} from "@jgengine/core/multiplayer/voiceContract";

export interface UseVoiceOptions {
  transport?: VoiceTransport;
  channelId?: string;
  mode?: PushToTalkMode;
  resolveRoutes?: () => readonly VoiceRoute[];
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
}

export interface VoiceState {
  supported: boolean;
  micStream: MediaStream | null;
  micError: string | null;
  requestMic(): Promise<boolean>;
  transmitting: boolean;
  status: PushToTalkStatus;
  mode: PushToTalkMode;
  setMode(mode: PushToTalkMode): void;
  muted: boolean;
  setMuted(muted: boolean): void;
  keyDown(): void;
  keyUp(): void;
  participants: readonly VoiceParticipant[];
  routes: readonly VoiceRoute[];
  gainFor(userId: string): number;
}

/**
 * Mic capture + push-to-talk + channel roster over the VoiceTransport
 * signaling seam. Transmission gates the captured tracks' `enabled` flag; the
 * media plane that actually moves audio bytes (WebRTC/SFU) stays behind the
 * transport, host-supplied. Call once per voice channel and hand the returned
 * state to the voice components.
 */
export function useVoice(options?: UseVoiceOptions): VoiceState {
  const transport = options?.transport;
  const channelId = options?.channelId ?? "voice";
  const resolveRoutes = options?.resolveRoutes;
  const requestedMode = options?.mode ?? "hold";

  const [transmitting, setTransmitting] = useState(false);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((current) => current + 1), []);
  void version;

  const pttRef = useRef<ReturnType<typeof createPushToTalk> | null>(null);
  if (pttRef.current === null) {
    pttRef.current = createPushToTalk({ mode: requestedMode, onChange: setTransmitting });
  }
  const ptt = pttRef.current;

  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const micRef = useRef<MediaStream | null>(null);

  const getUserMedia =
    options?.getUserMedia ??
    (typeof navigator !== "undefined" && navigator.mediaDevices !== undefined
      ? (constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints)
      : undefined);
  const supported = getUserMedia !== undefined;

  const requestMic = useCallback(async (): Promise<boolean> => {
    if (getUserMedia === undefined) {
      setMicError("microphone capture not supported");
      return false;
    }
    try {
      const stream = await getUserMedia({ audio: true });
      micRef.current = stream;
      setMicStream(stream);
      setMicError(null);
      void transport?.publish(channelId, stream.id);
      return true;
    } catch (error) {
      setMicError(error instanceof Error ? error.message : "microphone permission denied");
      return false;
    }
  }, [getUserMedia, transport, channelId]);

  useEffect(() => {
    const stream = micRef.current;
    if (stream === null) return;
    for (const track of stream.getAudioTracks()) track.enabled = transmitting;
  }, [transmitting, micStream]);

  useEffect(() => {
    return () => {
      const stream = micRef.current;
      if (stream !== null) for (const track of stream.getTracks()) track.stop();
    };
  }, []);

  const [participants, setParticipants] = useState<readonly VoiceParticipant[]>([]);
  useEffect(() => {
    if (transport === undefined) return undefined;
    void transport.join(channelId, micRef.current?.id);
    const unsubscribe = transport.subscribers(channelId, setParticipants);
    return () => {
      unsubscribe();
      void transport.leave(channelId);
    };
  }, [transport, channelId]);

  const routes = resolveRoutes?.() ?? [];

  return useMemo<VoiceState>(
    () => ({
      supported,
      micStream,
      micError,
      requestMic,
      transmitting,
      status: ptt.status(),
      mode: ptt.mode(),
      setMode(mode) {
        ptt.setMode(mode);
        bump();
      },
      muted: ptt.muted(),
      setMuted(muted) {
        ptt.setMuted(muted);
        bump();
      },
      keyDown() {
        ptt.keyDown();
        bump();
      },
      keyUp() {
        ptt.keyUp();
        bump();
      },
      participants,
      routes,
      gainFor(userId) {
        let gain = 0;
        for (const route of routes) {
          if (route.fromUserId === userId && route.gain > gain) gain = route.gain;
        }
        return gain;
      },
    }),
    [supported, micStream, micError, requestMic, transmitting, participants, routes, ptt, bump],
  );
}

export function PushToTalkButton({
  voice,
  className,
  children,
}: {
  voice: VoiceState;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      data-push-to-talk
      data-transmitting={voice.transmitting}
      data-status={voice.status}
      onPointerDown={() => voice.keyDown()}
      onPointerUp={() => voice.keyUp()}
      onPointerLeave={() => voice.keyUp()}
    >
      {children ?? (voice.transmitting ? "Transmitting" : "Push to talk")}
    </button>
  );
}

export function MicToggle({
  voice,
  className,
  mutedLabel,
  unmutedLabel,
}: {
  voice: VoiceState;
  className?: string;
  mutedLabel?: ReactNode;
  unmutedLabel?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      data-mic-toggle
      data-muted={voice.muted}
      aria-pressed={voice.muted}
      onClick={() => voice.setMuted(!voice.muted)}
    >
      {voice.muted ? (mutedLabel ?? "Unmute") : (unmutedLabel ?? "Mute")}
    </button>
  );
}

export function SpeakingIndicator({
  voice,
  userId,
  className,
  threshold = 0.01,
  children,
}: {
  voice: VoiceState;
  userId: string;
  className?: string;
  threshold?: number;
  children?: ReactNode;
}) {
  const gain = voice.gainFor(userId);
  return (
    <span
      className={className}
      data-speaking={gain > threshold}
      data-gain={gain.toFixed(3)}
      data-user={userId}
    >
      {children}
    </span>
  );
}

export function VoiceRoster({
  voice,
  className,
  participantClassName,
  renderParticipant,
}: {
  voice: VoiceState;
  className?: string;
  participantClassName?: string;
  renderParticipant?: (participant: VoiceParticipant, gain: number) => ReactNode;
}) {
  return (
    <div className={className} data-voice-roster>
      {voice.participants.map((participant) => {
        const gain = voice.gainFor(participant.userId);
        return (
          <div
            key={participant.userId}
            className={participantClassName}
            data-voice-participant={participant.userId}
            data-published={participant.streamId !== undefined}
            data-speaking={gain > 0.01}
          >
            {renderParticipant !== undefined ? renderParticipant(participant, gain) : participant.userId}
          </div>
        );
      })}
    </div>
  );
}
