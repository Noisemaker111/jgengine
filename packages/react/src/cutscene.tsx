import { useEffect, useReducer, type CSSProperties, type ReactNode } from "react";

import type { SequenceDirector, SequenceState } from "@jgengine/core/scene/sequenceDirector";

/** The live playback state plus bound controls returned by {@link useSequenceDirector}. */
export interface SequenceDirectorBinding extends SequenceState {
  /** Start or resume playback. */
  play: () => void;
  /** Freeze the playhead. */
  pause: () => void;
  /** Fast-forward to the end, emitting remaining cues. */
  skip: () => void;
  /** Jump the playhead to `ms`. */
  seek: (ms: number) => void;
  /** Halt and rewind to the start. */
  stop: () => void;
}

/**
 * Bind a {@link SequenceDirector} to a component: subscribe to its state, and while
 * it is playing run a `requestAnimationFrame` loop that ticks the director each frame
 * off the same injected clock — so a game drops in one hook and the cutscene advances
 * itself. Returns the current playback state (playhead, progress, playing/done) plus
 * bound `play`/`pause`/`skip`/`seek`/`stop`. Cue side effects belong on
 * `director.onCue`, not here — the hook never interprets a cue.
 *
 * @capability use-sequence-director React hook that drives a cutscene director's per-frame tick loop and exposes playhead/progress + play/pause/skip controls
 */
export function useSequenceDirector(director: SequenceDirector): SequenceDirectorBinding {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => director.subscribe(bump), [director]);

  const playing = director.state().playing;
  useEffect(() => {
    if (!playing || typeof requestAnimationFrame === "undefined") return;
    let raf = 0;
    const frame = (): void => {
      director.tick();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [director, playing]);

  const state = director.state();
  return {
    ...state,
    play: () => director.play(),
    pause: () => director.pause(),
    skip: () => director.skip(),
    seek: (ms: number) => director.seek(ms),
    stop: () => director.stop(),
  };
}

/** Reskin tokens for {@link CutsceneLetterbox}. */
export interface CutsceneLetterboxTheme {
  /** Cinematic bar color. Default solid black. */
  barColor?: string;
  /** Height of each bar as a fraction of the viewport height, in `[0, 0.5]`. Default `0.12`. */
  barFraction?: number;
  /** Caption panel background. */
  captionBackground?: string;
  /** Caption text color. */
  captionText?: string;
  /** Skip button accent. Default reads `--jg-accent`. */
  accent?: string;
}

function resolveTheme(theme: CutsceneLetterboxTheme | undefined): Required<CutsceneLetterboxTheme> {
  return {
    barColor: theme?.barColor ?? "#000",
    barFraction: Math.max(0, Math.min(0.5, theme?.barFraction ?? 0.12)),
    captionBackground: theme?.captionBackground ?? "rgba(6,9,14,0.62)",
    captionText: theme?.captionText ?? "#f1f5f9",
    accent: theme?.accent ?? "var(--jg-accent, #38bdf8)",
  };
}

/** Props for {@link CutsceneLetterbox}. */
export interface CutsceneLetterboxProps {
  /** When `true`, the cinematic bars are drawn in; when `false` they retract off-screen. */
  active: boolean;
  /** Optional caption / dialogue node shown centered above the lower bar. */
  caption?: ReactNode;
  /** Skip handler. When provided, a Skip button renders in the top bar. */
  onSkip?: () => void;
  /** Skip button label. Default `"Skip"`. */
  skipLabel?: string;
  /** Elapsed fraction `[0, 1]` for the thin progress line under the caption; omit to hide it. */
  progress?: number;
  /** Reskin tokens. */
  theme?: CutsceneLetterboxTheme;
  className?: string;
  style?: CSSProperties;
}

/**
 * A drop-in cinematic letterbox overlay: black bars slide in top and bottom while a
 * cutscene is `active`, an optional caption/dialogue line sits above the lower bar with
 * an optional progress line, and a Skip button rides the top bar. Presentation only —
 * it never touches the director; wire `active`/`caption`/`progress`/`onSkip` from
 * {@link useSequenceDirector} and your `onCue` handler. Reskin via {@link CutsceneLetterboxTheme}.
 *
 * @capability cutscene-letterbox reskinnable cinematic letterbox + skip overlay for a cutscene — animated bars, caption/dialogue slot, progress line, Skip button
 */
export function CutsceneLetterbox({
  active,
  caption,
  onSkip,
  skipLabel = "Skip",
  progress,
  theme,
  className,
  style,
}: CutsceneLetterboxProps): ReactNode {
  const t = resolveTheme(theme);
  const barHeight = `${(t.barFraction * 100).toFixed(3)}vh`;
  const shift = active ? "0%" : "-100%";
  const shiftDown = active ? "0%" : "100%";

  return (
    <div
      className={className}
      data-cutscene-letterbox={active ? "active" : "idle"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        pointerEvents: "none",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        ...style,
      }}
    >
      {/* Top bar */}
      <div
        data-cutscene-bar="top"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: barHeight,
          background: t.barColor,
          transform: `translateY(${shift})`,
          transition: "transform 500ms cubic-bezier(0.22,1,0.36,1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "0 20px",
        }}
      >
        {onSkip !== undefined ? (
          <button
            type="button"
            data-cutscene-skip
            onClick={onSkip}
            style={{
              pointerEvents: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              border: "1px solid rgba(148,163,184,0.4)",
              borderRadius: 8,
              background: "rgba(15,23,42,0.7)",
              color: t.accent,
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: 0.4,
              padding: "6px 14px",
              cursor: "pointer",
            }}
          >
            {skipLabel} <span aria-hidden style={{ opacity: 0.8 }}>⏭</span>
          </button>
        ) : null}
      </div>

      {/* Bottom bar */}
      <div
        data-cutscene-bar="bottom"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: barHeight,
          background: t.barColor,
          transform: `translateY(${shiftDown})`,
          transition: "transform 500ms cubic-bezier(0.22,1,0.36,1)",
        }}
      />

      {/* Caption / dialogue sits just above the lower bar. */}
      {active && (caption !== undefined || progress !== undefined) ? (
        <div
          data-cutscene-caption
          style={{
            position: "absolute",
            left: "50%",
            bottom: `calc(${barHeight} + 28px)`,
            transform: "translateX(-50%)",
            maxWidth: "min(78vw, 720px)",
            textAlign: "center",
            color: t.captionText,
          }}
        >
          {caption !== undefined ? (
            <div
              style={{
                background: t.captionBackground,
                borderRadius: 12,
                padding: "12px 20px",
                fontSize: 18,
                lineHeight: 1.5,
                textShadow: "0 2px 12px rgba(0,0,0,0.7)",
                boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
              }}
            >
              {caption}
            </div>
          ) : null}
          {progress !== undefined ? (
            <div
              data-cutscene-progress
              style={{
                marginTop: 10,
                height: 3,
                borderRadius: 3,
                background: "rgba(148,163,184,0.25)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
                  background: t.accent,
                  transition: "width 120ms linear",
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
