import { useEffect, useMemo, useRef, type ReactNode } from "react";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useAccessibilitySettings } from "@jgengine/react/accessibilitySettings";

import { cameraShake } from "../camera/shakeChannel";
import type { AudioEngine } from "./audioEngine";
import { installAudioProbe } from "./audioProbe";
import { CaptionOverlay } from "./CaptionOverlay";
import { createCaptionFeed } from "./captions";
import { attachEventFeedback, createEventFeedback, type EventFeedback } from "./eventFeedback";
import { installGestureResume } from "./gestureResume";

/**
 * Mounts the engine's feel layer for one game: announced events become a sound, a gamepad pulse, a
 * camera kick and a caption line; the audio context unlocks on the first gesture; and the caption
 * stack follows the accessibility setting. Games supply sounds, never the rules.
 *
 * @capability feedback-host mount event feedback, gesture-gated audio and captions for a running game in one component
 */
export function FeedbackHost({ ctx, engine }: { ctx: GameContext; engine: AudioEngine }): ReactNode {
  const accessibility = useAccessibilitySettings();
  const feed = useMemo(() => createCaptionFeed(), []);
  const motionScale = useRef(accessibility.reducedMotion ? 0 : 1);
  motionScale.current = accessibility.reducedMotion ? 0 : 1;

  const feedback = useMemo<EventFeedback>(() => {
    const haptics = () => ctx.input.haptics(ctx.player.userId);
    return createEventFeedback({
      play: (sound) => ctx.game.audio.play(sound),
      shake: (amount) => cameraShake(amount),
      haptics: (pulse) => haptics().pulse("feedback", pulse, 2),
      caption: (text, cue) => feed.push(text, cue),
      localUserId: () => ctx.player.userId,
      localEntityId: () => ctx.player.possession.active(ctx.player.userId),
      motionScale: () => motionScale.current,
    }, { captions: accessibility.captions });
  }, [ctx, feed, accessibility.captions]);

  useEffect(() => {
    feedback.retune({ captions: accessibility.captions });
  }, [feedback, accessibility.captions]);

  useEffect(() => attachEventFeedback(ctx.game.events, feedback), [ctx, feedback]);
  useEffect(() => installGestureResume(engine), [engine]);
  useEffect(() => installAudioProbe(engine), [engine]);
  useEffect(() => () => feed.clear(), [feed]);

  return accessibility.captions ? <CaptionOverlay feed={feed} /> : null;
}
