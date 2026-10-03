import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  createPushToTalk,
  type PushToTalkMode,
  type PushToTalkStatus,
  type VoiceParticipant,
  type VoiceRoute,
  type VoiceTransport,
} from "@jgengine/core/multiplayer/voiceContract";
import { observeBrowserSuspension } from "./browserLifecycle";

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

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) if (track.readyState !== "ended") track.stop();
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
  const requestedMode = options?.mode;

  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((current) => current + 1), []);

  const pttRef = useRef<ReturnType<typeof createPushToTalk> | null>(null);
  if (pttRef.current === null) {
    pttRef.current = createPushToTalk({ mode: requestedMode, onChange: bump });
  }
  const ptt = pttRef.current;
  const transmitting = ptt.transmitting();

  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const captureOwner = useMemo(() => ({}), [transport, channelId]);
  const captureOwnerRef = useRef<object | null>(null);
  const micRequestRef = useRef<object | null>(null);

  useLayoutEffect(() => {
    captureOwnerRef.current = captureOwner;
    return () => {
      captureOwnerRef.current = null;
      micRequestRef.current = null;
    };
  }, [captureOwner]);

  const getUserMedia =
    options?.getUserMedia ??
    (typeof navigator !== "undefined" && navigator.mediaDevices !== undefined
      ? (constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints)
      : undefined);
  const supported = getUserMedia !== undefined;

  const requestMic = useCallback(async (): Promise<boolean> => {
    if (captureOwnerRef.current !== captureOwner) return false;
    const request = {};
    micRequestRef.current = request;
    if (getUserMedia === undefined) {
      setMicError("microphone capture not supported");
      return false;
    }
    try {
      const stream = await getUserMedia({ audio: true });
      if (captureOwnerRef.current !== captureOwner || micRequestRef.current !== request) {
        // An injected capture provider may return the already accepted stream.
        if (stream !== micRef.current) stopStream(stream);
        return false;
      }
      if (!stream.getAudioTracks().some((track) => track.readyState === "live")) {
        stopStream(stream);
        throw new Error("microphone capture has no live audio tracks");
      }
      const previous = micRef.current;
      if (previous !== null && previous !== stream) stopStream(previous);
      const transmitting = ptt.transmitting();
      for (const track of stream.getAudioTracks()) track.enabled = transmitting;
      micRef.current = stream;
      setMicStream(stream);
      setMicError(null);
      await transport?.publish(channelId, stream.id);
      return captureOwnerRef.current === captureOwner && micRequestRef.current === request;
    } catch (error) {
      if (captureOwnerRef.current === captureOwner && micRequestRef.current === request) {
        setMicError(error instanceof Error ? error.message : "microphone permission denied");
      }
      return false;
    }
  }, [getUserMedia, transport, channelId, ptt, captureOwner]);

  useEffect(() => {
    const stream = micRef.current;
    if (stream === null) return;
    for (const track of stream.getAudioTracks()) track.enabled = transmitting;
  }, [transmitting, micStream]);

  useEffect(() => {
    return () => {
      micRequestRef.current = null;
      const stream = micRef.current;
      micRef.current = null;
      if (stream !== null) stopStream(stream);
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
    [supported, micStream, micError, requestMic, transmitting, participants, routes, ptt, bump, version],
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
  type Activation = { kind: "pointer"; pointerId: number; pointerType: string } | { kind: "key"; code: string };
  const owner = useRef<{ activation: Activation; source: HTMLButtonElement; detach: () => void; keyUp: () => void } | null>(null);
  const release = (): void => {
    const current = owner.current;
    if (current === null) return;
    owner.current = null;
    current.detach();
    current.keyUp();
    if (current.activation.kind === "pointer" && current.source.hasPointerCapture(current.activation.pointerId)) {
      current.source.releasePointerCapture(current.activation.pointerId);
    }
  };
  useEffect(() => () => release(), []);
  const begin = (source: HTMLButtonElement, activation: Activation): void => {
    if (owner.current !== null || (voice.mode === "hold" && voice.transmitting)) return;
    const view = source.ownerDocument.defaultView;
    if (view === null) return;
    const mouse = activation.kind === "pointer" && activation.pointerType === "mouse";
    const onUp = (event: MouseEvent): void => { if (event.button === 0) release(); };
    const onCancel = (event: PointerEvent): void => {
      if (activation.kind === "pointer" && event.pointerId === activation.pointerId) release();
    };
    const stopObserving = observeBrowserSuspension(release, {}, { window: view, document: source.ownerDocument });
    owner.current = { activation, source, keyUp: voice.keyUp, detach: () => {
      stopObserving();
      view.removeEventListener("mouseup", onUp);
      view.removeEventListener("pointercancel", onCancel);
    } };
    if (mouse) view.addEventListener("mouseup", onUp);
    if (activation.kind === "pointer") {
      view.addEventListener("pointercancel", onCancel);
      if (!mouse) source.setPointerCapture(activation.pointerId);
    }
    voice.keyDown();
  };
  return (
    <button
      type="button"
      className={className}
      data-push-to-talk
      data-transmitting={voice.transmitting}
      data-status={voice.status}
      onPointerDown={(event) => {
        if (event.button === 0 && event.isPrimary) begin(event.currentTarget, { kind: "pointer", pointerId: event.pointerId, pointerType: event.pointerType });
      }}
      onPointerUp={(event) => {
        const activation = owner.current?.activation;
        if (activation?.kind === "pointer" && activation.pointerId === event.pointerId && activation.pointerType !== "mouse") release();
      }}
      onPointerLeave={(event) => {
        const activation = owner.current?.activation;
        if (activation?.kind === "pointer" && activation.pointerId === event.pointerId) release();
      }}
      onLostPointerCapture={(event) => {
        const activation = owner.current?.activation;
        if (activation?.kind === "pointer" && activation.pointerId === event.pointerId) release();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (!event.repeat) begin(event.currentTarget, { kind: "key", code: event.code });
      }}
      onKeyUp={(event) => {
        const activation = owner.current?.activation;
        if (activation?.kind === "key" && activation.code === event.code) { event.preventDefault(); release(); }
      }}
      onBlur={() => { if (owner.current?.activation.kind === "key") release(); }}
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
