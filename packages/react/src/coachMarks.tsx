import { useEffect, useLayoutEffect, useReducer, useState, type CSSProperties, type ReactNode } from "react";

import type { CoachMarkPlacement, CoachMarkSequence, CoachMarkView } from "@jgengine/core/ui/coachMarks";

/**
 * Subscribe to a coach-mark sequence and re-render on every change, returning the
 * current step view (or `null` when the tour is complete or waiting on a gate).
 *
 * @capability use-coach-marks React hook binding a coach-mark sequence to a component — re-renders on advance/skip/gate changes
 */
export function useCoachMarks(sequence: CoachMarkSequence): CoachMarkView | null {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => sequence.subscribe(bump), [sequence]);
  return sequence.current();
}

/** Reskin tokens for {@link CoachMarkHost} / {@link CoachMark}. */
export interface CoachMarkTheme {
  /** Accent for the counter, Next button, and pointer. Default reads `--jg-accent`. */
  accent?: string;
  /** Callout background. */
  background?: string;
  /** Callout text color. */
  text?: string;
  /** Dim color for the backdrop / spotlight. */
  backdrop?: string;
  /** Callout corner radius (px). */
  radius?: number;
}

function resolveTheme(theme: CoachMarkTheme | undefined): Required<CoachMarkTheme> {
  return {
    accent: theme?.accent ?? "var(--jg-accent, #38bdf8)",
    background: theme?.background ?? "linear-gradient(160deg, rgba(20,24,32,0.98), rgba(11,14,19,0.98))",
    text: theme?.text ?? "#e2e8f0",
    backdrop: theme?.backdrop ?? "rgba(4,7,12,0.62)",
    radius: theme?.radius ?? 14,
  };
}

const CALLOUT_WIDTH = 288;
const GAP = 14;

function calloutStyle(rect: DOMRect | null, placement: CoachMarkPlacement): CSSProperties {
  if (rect === null || placement === "center") {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }
  switch (placement) {
    case "top":
      return { top: rect.top - GAP, left: rect.left + rect.width / 2, transform: "translate(-50%, -100%)" };
    case "left":
      return { top: rect.top + rect.height / 2, left: rect.left - GAP, transform: "translate(-100%, -50%)" };
    case "right":
      return { top: rect.top + rect.height / 2, left: rect.right + GAP, transform: "translate(0, -50%)" };
    case "bottom":
    default:
      return { top: rect.bottom + GAP, left: rect.left + rect.width / 2, transform: "translate(-50%, 0)" };
  }
}

/** Props for {@link CoachMark}. */
export interface CoachMarkProps {
  /** The step view to render (from `sequence.current()` / {@link useCoachMarks}). */
  view: CoachMarkView;
  /** Absolute-position style computed for the callout (see {@link CoachMarkHost}). */
  positionStyle?: CSSProperties;
  onNext: () => void;
  onSkip: () => void;
  nextLabel?: string;
  doneLabel?: string;
  skipLabel?: string;
  theme?: CoachMarkTheme;
  className?: string;
  style?: CSSProperties;
}

/**
 * A single coach-mark callout — title, body, an "N of M" counter, a Next/Got-it
 * button, and a Skip-tour link. Presentation-only; position it with
 * `positionStyle` or drop it into {@link CoachMarkHost}. Reskin via {@link CoachMarkTheme}.
 *
 * @capability coach-mark single onboarding callout — title/body, N-of-M counter, Next + Skip controls, theme-reskinnable
 */
export function CoachMark({
  view,
  positionStyle,
  onNext,
  onSkip,
  nextLabel = "Next",
  doneLabel = "Got it",
  skipLabel = "Skip tour",
  theme,
  className,
  style,
}: CoachMarkProps): ReactNode {
  const t = resolveTheme(theme);
  const last = view.remaining <= 1;
  return (
    <div
      className={className}
      data-coach-mark={view.step.id}
      style={{
        position: "fixed",
        width: CALLOUT_WIDTH,
        maxWidth: "calc(100vw - 24px)",
        boxSizing: "border-box",
        padding: 16,
        borderRadius: t.radius,
        background: t.background,
        border: "1px solid var(--jg-ring, rgba(148,163,184,0.32))",
        color: t.text,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        boxShadow: "0 20px 50px rgba(0,0,0,0.55)",
        pointerEvents: "auto",
        ...positionStyle,
        ...style,
      }}
    >
      <div
        data-coach-mark-counter
        style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 700, color: t.accent }}
      >
        {view.index + 1} of {view.total}
      </div>
      <div data-coach-mark-title style={{ marginTop: 6, fontSize: 15, fontWeight: 700 }}>{view.step.title}</div>
      {view.step.body !== undefined ? (
        <p data-coach-mark-body style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "rgba(203,213,225,0.85)" }}>
          {view.step.body}
        </p>
      ) : null}
      <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <button
          type="button"
          data-coach-mark-skip
          onClick={onSkip}
          style={{
            border: "none",
            background: "transparent",
            color: "rgba(148,163,184,0.85)",
            fontSize: 11.5,
            cursor: "pointer",
            padding: 0,
            textDecoration: "underline",
          }}
        >
          {skipLabel}
        </button>
        <button
          type="button"
          data-coach-mark-next
          onClick={onNext}
          style={{
            border: "1px solid transparent",
            borderRadius: 8,
            background: t.accent,
            color: "#06121b",
            fontSize: 12.5,
            fontWeight: 700,
            padding: "6px 14px",
            cursor: "pointer",
          }}
        >
          {last ? doneLabel : nextLabel}
        </button>
      </div>
    </div>
  );
}

/** Props for {@link CoachMarkHost}. */
export interface CoachMarkHostProps {
  /** The sequence to drive. */
  sequence: CoachMarkSequence;
  /** Resolve a step's `anchor` string to a DOM element. Default: `document.querySelector`. */
  resolveAnchor?: (anchor: string) => Element | null;
  /** Dim the rest of the screen and spotlight the anchor. Default `true`. */
  showBackdrop?: boolean;
  /** Fired the first time the tour reports complete (no eligible step). */
  onComplete?: () => void;
  nextLabel?: string;
  doneLabel?: string;
  skipLabel?: string;
  theme?: CoachMarkTheme;
  className?: string;
  style?: CSSProperties;
}

/**
 * Full-screen coach-mark host: watches a sequence, positions the current step's
 * callout beside its anchored element (or centered when unanchored) via
 * `getBoundingClientRect`, and draws an optional dimmed backdrop with a spotlight
 * cutout around the anchor. Next advances, Skip ends the tour — both persist so
 * hints never re-show. Reskin with {@link CoachMarkTheme}.
 *
 * @capability coach-mark-host full-screen onboarding coach-mark host — anchored/centered callout, dimmed spotlight backdrop, Next/Skip wired to the sequence
 */
export function CoachMarkHost({
  sequence,
  resolveAnchor,
  showBackdrop = true,
  onComplete,
  nextLabel,
  doneLabel,
  skipLabel,
  theme,
  className,
  style,
}: CoachMarkHostProps): ReactNode {
  const view = useCoachMarks(sequence);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const anchor = view?.step.anchor;
  const stepId = view?.step.id;

  useLayoutEffect(() => {
    if (view === null && onComplete !== undefined && sequence.isComplete()) onComplete();
  }, [view, onComplete, sequence]);

  useLayoutEffect(() => {
    if (anchor === undefined || typeof document === "undefined") {
      setRect(null);
      return;
    }
    const resolve = resolveAnchor ?? ((selector: string) => document.querySelector(selector));
    const measure = (): void => {
      const el = resolve(anchor);
      setRect(el !== null ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [anchor, stepId, resolveAnchor]);

  if (view === null) return null;
  const t = resolveTheme(theme);
  const placement: CoachMarkPlacement = view.step.placement ?? (view.step.anchor !== undefined ? "bottom" : "center");
  const spotlight = showBackdrop && rect !== null;

  return (
    <div
      className={className}
      data-coach-mark-host
      style={{ position: "fixed", inset: 0, zIndex: 60, pointerEvents: "none", ...style }}
    >
      {showBackdrop ? (
        spotlight ? (
          <div
            data-coach-mark-spotlight
            style={{
              position: "fixed",
              top: rect.top - 6,
              left: rect.left - 6,
              width: rect.width + 12,
              height: rect.height + 12,
              borderRadius: 10,
              boxShadow: `0 0 0 9999px ${t.backdrop}`,
              pointerEvents: "auto",
            }}
          />
        ) : (
          <div data-coach-mark-backdrop style={{ position: "fixed", inset: 0, background: t.backdrop, pointerEvents: "auto" }} />
        )
      ) : null}
      <CoachMark
        view={view}
        positionStyle={calloutStyle(rect, placement)}
        onNext={() => sequence.advance()}
        onSkip={() => sequence.skipAll()}
        nextLabel={nextLabel}
        doneLabel={doneLabel}
        skipLabel={skipLabel}
        theme={theme}
      />
    </div>
  );
}
