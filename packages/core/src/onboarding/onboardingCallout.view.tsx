import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";

import { hudType } from "@jgengine/core/hud/hudTokens";
import { onboardingOf } from "@jgengine/core/onboarding/onboardingSystem";
import { useGame, useGameStore } from "@jgengine/react/hooks";

/** Reskin tokens for {@link OnboardingCallout}. */
export interface OnboardingCalloutTheme {
  /** Accent for the counter, Next button and spotlight. Default reads `--jg-accent`. */
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

type Placement = "top" | "bottom" | "left" | "right" | "center";

/** The current step as a callout shows it. @internal */
export interface OnboardingCalloutView {
  id: string;
  text: string;
  detail: string | undefined;
  anchor: string | undefined;
  placement: Placement;
  /** The step finishes on Next, so the callout shows the button. */
  next: boolean;
  index: number;
  total: number;
  skippable: boolean;
}

const sameView = (a: OnboardingCalloutView | null, b: OnboardingCalloutView | null): boolean => JSON.stringify(a) === JSON.stringify(b);

function resolveTheme(theme: OnboardingCalloutTheme | undefined): Required<OnboardingCalloutTheme> {
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

function calloutStyle(rect: DOMRect | null, placement: Placement): CSSProperties {
  if (rect === null || placement === "center") return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  switch (placement) {
    case "top":
      return { top: rect.top - GAP, left: rect.left + rect.width / 2, transform: "translate(-50%, -100%)" };
    case "left":
      return { top: rect.top + rect.height / 2, left: rect.left - GAP, transform: "translate(-100%, -50%)" };
    case "right":
      return { top: rect.top + rect.height / 2, left: rect.right + GAP, transform: "translate(0, -50%)" };
    case "bottom":
      return { top: rect.bottom + GAP, left: rect.left + rect.width / 2, transform: "translate(-50%, 0)" };
  }
}

/** Props for {@link OnboardingCalloutCard}. */
export interface OnboardingCalloutCardProps {
  view: OnboardingCalloutView;
  /** Absolute-position style for the card (see {@link OnboardingCallout}). */
  positionStyle?: CSSProperties;
  onNext: () => void;
  onSkip: () => void;
  nextLabel?: string;
  doneLabel?: string;
  skipLabel?: string;
  theme?: OnboardingCalloutTheme;
  className?: string;
  style?: CSSProperties;
}

/**
 * One onboarding step as a card: "N of M", the step's text and detail, Next (Got it on the last
 * step) when the step finishes on Next, and Skip when the onboarding is skippable. Presentation
 * only; {@link OnboardingCallout} positions it and wires it to the running onboarding.
 *
 * @capability onboarding-callout-card one onboarding step as a card with N of M, Next and Skip, theme-reskinnable
 */
export function OnboardingCalloutCard({
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
}: OnboardingCalloutCardProps): ReactNode {
  const t = resolveTheme(theme);
  const last = view.index + 1 >= view.total;
  return (
    <div
      className={className}
      data-onboarding-callout={view.id}
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
      <div data-onboarding-callout-counter="" style={{ fontSize: hudType("xs"), letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 700, color: t.accent }}>
        {view.index + 1} of {view.total}
      </div>
      <div data-onboarding-callout-text="" style={{ marginTop: 6, fontSize: 15, fontWeight: 700 }}>
        {view.text}
      </div>
      {view.detail === undefined ? null : (
        <p data-onboarding-callout-detail="" style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "rgba(203,213,225,0.85)" }}>
          {view.detail}
        </p>
      )}
      <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        {view.skippable ? (
          <button
            type="button"
            data-onboarding-callout-skip=""
            onClick={onSkip}
            style={{ border: "none", background: "transparent", color: "rgba(148,163,184,0.85)", fontSize: hudType("xs"), cursor: "pointer", padding: 0, textDecoration: "underline" }}
          >
            {skipLabel}
          </button>
        ) : (
          <span />
        )}
        {view.next ? (
          <button
            type="button"
            data-onboarding-callout-next=""
            onClick={onNext}
            style={{ border: "1px solid transparent", borderRadius: 8, background: t.accent, color: "#06121b", fontSize: 12.5, fontWeight: 700, padding: "6px 14px", cursor: "pointer" }}
          >
            {last ? doneLabel : nextLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Props for {@link OnboardingCallout}. */
export interface OnboardingCalloutProps {
  /** Resolve a step's `anchor` to a DOM element. Default: `document.querySelector`. */
  resolveAnchor?: (anchor: string) => Element | null;
  /** Dim the rest of the screen and spotlight the anchor. Default `true`. */
  showBackdrop?: boolean;
  nextLabel?: string;
  doneLabel?: string;
  skipLabel?: string;
  theme?: OnboardingCalloutTheme;
  className?: string;
  style?: CSSProperties;
}

/**
 * The onboarding's UI callout, for steps about the interface rather than the world: a step with an
 * `anchor` (a CSS selector) gets a card beside that element with a spotlight around it, and a step
 * that finishes on Next with no anchor gets a centred card. Next and Skip run `onboarding.next` and
 * `onboarding.skip`, so progress saves with the game. Other steps show nothing here.
 *
 * @capability onboarding-callout anchored or centred tutorial callouts with a spotlight, Next and Skip, driven by the onboarding steps
 */
export function OnboardingCallout({
  resolveAnchor,
  showBackdrop = true,
  nextLabel = "Next",
  doneLabel = "Got it",
  skipLabel = "Skip tour",
  theme,
  className,
  style,
}: OnboardingCalloutProps): ReactNode {
  const { commands } = useGame();
  const view = useGameStore((ctx): OnboardingCalloutView | null => {
    const runtime = onboardingOf(ctx);
    const current = runtime?.run().current() ?? null;
    if (runtime === null || current === null) return null;
    const { step } = current;
    const next = "next" in step.done;
    if (step.anchor === undefined && !next) return null;
    return {
      id: step.id,
      text: step.text,
      detail: step.detail,
      anchor: step.anchor,
      placement: step.placement ?? (step.anchor === undefined ? "center" : "bottom"),
      next,
      index: current.index,
      total: current.total,
      skippable: runtime.config.skippable !== false,
    };
  }, sameView);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const anchor = view?.anchor;
  const stepId = view?.id;

  useLayoutEffect(() => {
    if (anchor === undefined || typeof document === "undefined") {
      setRect(null);
      return;
    }
    const resolve = resolveAnchor ?? ((selector: string) => document.querySelector(selector));
    const measure = (): void => {
      const el = resolve(anchor);
      setRect(el === null ? null : el.getBoundingClientRect());
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
  const spotlight = showBackdrop && rect !== null;
  return (
    <div className={className} data-onboarding-callout-host="" style={{ position: "fixed", inset: 0, zIndex: 60, pointerEvents: "none", ...style }}>
      {showBackdrop ? (
        spotlight ? (
          <div
            data-onboarding-callout-spotlight=""
            style={{ position: "fixed", top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12, borderRadius: 10, boxShadow: `0 0 0 9999px ${t.backdrop}`, pointerEvents: "none" }}
          />
        ) : (
          <div data-onboarding-callout-backdrop="" style={{ position: "fixed", inset: 0, background: t.backdrop, pointerEvents: "auto" }} />
        )
      ) : null}
      <OnboardingCalloutCard
        view={view}
        positionStyle={calloutStyle(rect, view.placement)}
        onNext={() => void commands.run("onboarding.next", {})}
        onSkip={() => void commands.run("onboarding.skip", {})}
        nextLabel={nextLabel}
        doneLabel={doneLabel}
        skipLabel={skipLabel}
        {...(theme === undefined ? {} : { theme })}
      />
    </div>
  );
}
