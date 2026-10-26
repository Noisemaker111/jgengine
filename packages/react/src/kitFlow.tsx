import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { useMenuNav } from "@jgengine/core/menu/menuNav.view";
import { useUiCue } from "./uiCues";
import type { KitTone } from "./uiKit";
import { KitActionPrompt, KitButton, KitMeter, KitPanel, useKitPresence, useUiKit, type KitActionPromptProps } from "./uiKitRoot";

/** One line of a {@link KitObjective} checklist. */
export interface KitObjectiveStep {
  id: string;
  label: ReactNode;
  done?: boolean;
}

/** A countdown on an objective. */
export interface KitObjectiveDeadline {
  /** Seconds left. */
  remaining: number;
  /** Seconds the objective started with. */
  total: number;
}

/** How urgent a deadline is: `calm` above half, `warn` below half, `urgent` in the last stretch. */
export type KitDeadlineStage = "calm" | "warn" | "urgent";

/**
 * The stage of a deadline: `urgent` at or under `urgentAt` seconds (default the larger of 10 s and a
 * quarter of the total), `warn` under half, otherwise `calm`.
 */
export function deadlineStage(deadline: KitObjectiveDeadline, urgentAt?: number): KitDeadlineStage {
  const threshold = urgentAt ?? Math.max(10, deadline.total * 0.25);
  if (deadline.remaining <= threshold) return "urgent";
  if (deadline.remaining <= deadline.total / 2) return "warn";
  return "calm";
}

/** `m:ss` for a countdown in seconds. */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Props for {@link KitObjective}. */
export interface KitObjectiveProps {
  /** What to do now, in a few words: "Deliver to Shore Steps". */
  title: ReactNode;
  eyebrow?: ReactNode;
  /** Optional checklist; done steps are struck. */
  steps?: readonly KitObjectiveStep[];
  /** Metres to the target; shown as "72 m". */
  distance?: number;
  /**
   * Direction to the target relative to where the player faces, radians clockwise (0 = straight
   * ahead). Shows an arrow so the player never walks the wrong way.
   */
  bearing?: number;
  deadline?: KitObjectiveDeadline;
  /** Seconds left at which the deadline turns urgent. Default the larger of 10 s and a quarter of the total. */
  urgentAt?: number;
  /** Shown once the player has made no progress for `hintAfter` seconds. */
  hint?: ReactNode;
  /** Seconds without progress before the hint appears. Default 12. */
  hintAfter?: number;
  /** Anything that changes when the player makes progress (distance bucket, step count); resets the hint timer. */
  progressKey?: string | number;
  /** The next action, drawn as a device-correct prompt under the objective. */
  prompt?: KitActionPromptProps;
  className?: string;
  style?: CSSProperties;
}

/**
 * The one card that tells the player what to do next: a short goal, distance with a direction arrow,
 * an optional checklist and countdown, and the next action as a device-correct prompt. The countdown
 * warns before it runs out (warn tone under half, urgent tone and a cue near the end) and a hint
 * appears when the player has been stuck for a while, so a run never fails without warning and a new
 * player is never left guessing.
 *
 * @capability kit-objective first-minute guidance in the active UI kit — goal, distance and direction, checklist, countdown with urgency warnings, idle hint, next-action prompt
 */
export function KitObjective({
  title,
  eyebrow,
  steps,
  distance,
  bearing,
  deadline,
  urgentAt,
  hint,
  hintAfter = 12,
  progressKey,
  prompt,
  className,
  style,
}: KitObjectiveProps): ReactNode {
  const cue = useUiCue();
  const stage = deadline === undefined ? "calm" : deadlineStage(deadline, urgentAt);
  const lastStage = useRef<KitDeadlineStage>(stage);
  useEffect(() => {
    if (stage !== lastStage.current && stage !== "calm") cue(stage === "urgent" ? "deny" : "notify");
    lastStage.current = stage;
  }, [stage, cue]);

  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    setStuck(false);
    if (hint === undefined) return undefined;
    const timer = setTimeout(() => {
      setStuck(true);
      cue("notify");
    }, Math.max(0, hintAfter) * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressKey, hintAfter, hint === undefined]);

  const tone: KitTone = stage === "urgent" ? "bad" : stage === "warn" ? "warn" : "accent";
  const aside =
    distance === undefined ? undefined : (
      <span data-jg-objective-distance="" style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
        {bearing === undefined ? null : (
          <svg
            data-jg-objective-arrow=""
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="1.15em"
            height="1.15em"
            style={{ display: "block", flex: "none", transform: `rotate(${bearing}rad)`, transition: "transform 120ms linear" }}
          >
            {/* Head and shaft: a bare arrowhead turned to 5 o'clock reads as pointing left. */}
            <path d="M12 1.5 L21.5 11.5 L15.5 11.5 L15.5 22.5 L8.5 22.5 L8.5 11.5 L2.5 11.5 Z" fill="currentColor" stroke="var(--kit-surface, #fff)" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        )}
        {Math.round(distance)} m
      </span>
    );
  return (
    <div data-jg-objective="" data-stage={stage} className={className} style={{ display: "grid", gap: 10, justifyItems: "start", ...style }}>
      <KitPanel variant="hud" eyebrow={eyebrow} title={title} aside={aside} tone={stage === "calm" ? undefined : tone} aria-live="polite">
        {steps === undefined && deadline === undefined && !(stuck && hint !== undefined) ? undefined : (
          <div style={{ display: "grid", gap: 8 }}>
            {steps === undefined ? null : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
                {steps.map((step) => (
                  <li key={step.id} data-done={step.done === true ? "" : undefined} style={{ opacity: step.done === true ? 0.6 : 1, textDecoration: step.done === true ? "line-through" : undefined }}>
                    {step.done === true ? "✓ " : "○ "}
                    {step.label}
                  </li>
                ))}
              </ul>
            )}
            {deadline === undefined ? null : (
              <KitMeter value={deadline.remaining} max={deadline.total} tone={tone === "accent" ? "good" : tone} readout={formatCountdown(deadline.remaining)} size="sm" />
            )}
            {stuck && hint !== undefined ? <div data-jg-objective-hint="">{hint}</div> : null}
          </div>
        )}
      </KitPanel>
      {prompt === undefined ? null : <KitActionPrompt {...prompt} />}
    </div>
  );
}

/** One row of a {@link KitResultScreen} tally. */
export interface KitResultStat {
  label: ReactNode;
  value: ReactNode;
}

/** One choice on a {@link KitResultScreen}. */
export interface KitResultAction {
  id: string;
  label: ReactNode;
  /** The highlighted default (Retry, Next day). The first action when none is marked. */
  primary?: boolean;
}

/** Props for {@link KitResultScreen}. */
export interface KitResultScreenProps {
  open: boolean;
  /** `good` a win, `bad` a loss, `neutral` a day's end. */
  tone?: KitTone;
  eyebrow?: ReactNode;
  title: ReactNode;
  /** One or two sentences: what happened and why. */
  summary?: ReactNode;
  stats?: readonly KitResultStat[];
  actions: readonly KitResultAction[];
  onAction: (id: string) => void;
  /** Escape/B: usually the same as the quiet action. */
  onBack?: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * The end of a run, a day or a level, in the active kit: a scrim, a dialog with what happened, a short
 * tally and the next choices, navigable by keyboard, gamepad and touch. It animates in and out with the
 * kit's motion and plays its open/close cues, so a loss reads as a moment instead of an abrupt cut.
 *
 * @capability kit-result-screen run/day/level result screen in the active UI kit — scrim, summary, tally, keyboard/gamepad/touch choices, kit motion
 */
export function KitResultScreen({ open, tone = "neutral", eyebrow, title, summary, stats, actions, onAction, onBack, className, style }: KitResultScreenProps): ReactNode {
  const kit = useUiKit();
  const presence = useKitPresence(open, kit.motion.exitMs);
  const primary = actions.find((action) => action.primary === true) ?? actions[0];
  const nav = useMenuNav({
    ids: actions.map((action) => action.id),
    columns: Math.max(1, actions.length),
    enabled: open,
    ...(primary === undefined ? {} : { initialId: primary.id }),
    onConfirm: onAction,
    ...(onBack === undefined ? {} : { onBack }),
  });
  if (!presence.mounted) return null;
  return (
    <div
      data-jg-result-screen=""
      data-state={presence.leaving ? "closed" : "open"}
      className={className}
      style={{
        position: "fixed",
        inset: 0,
        // Above notices (85) and captions (84): the scrim dims a toast instead of the toast covering the title.
        zIndex: 86,
        display: "grid",
        placeItems: "center",
        padding: "max(16px, var(--jg-safe-top, 0px)) 16px max(16px, var(--jg-safe-bottom, 0px))",
        background: "var(--kit-scrim, rgba(0, 0, 0, 0.55))",
        pointerEvents: "auto",
        opacity: presence.leaving ? 0 : 1,
        transition: `opacity ${kit.motion.exitMs}ms linear`,
        ...style,
      }}
    >
      <KitPanel
        variant="dialog"
        role="dialog"
        aria-modal="true"
        open={open}
        tone={tone}
        eyebrow={eyebrow}
        title={title}
        style={{ width: "min(520px, 100%)" }}
        footer={
          <div {...nav.containerProps} style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {actions.map((action) => (
              <KitButton
                key={action.id}
                {...nav.itemProps(action.id)}
                variant={action.id === primary?.id ? "primary" : "secondary"}
                size="lg"
                data-active={nav.activeId === action.id ? "" : undefined}
                onClick={() => onAction(action.id)}
              >
                {action.label}
              </KitButton>
            ))}
          </div>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          {summary === undefined ? null : <div data-jg-result-summary="">{summary}</div>}
          {stats === undefined || stats.length === 0 ? null : (
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 18px" }}>
              {stats.map((stat, index) => (
                <div key={index} style={{ display: "contents" }}>
                  <dt>{stat.label}</dt>
                  <dd style={{ margin: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{stat.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </KitPanel>
    </div>
  );
}

/** Props for {@link KitBanner}. */
export interface KitBannerProps {
  /** Show the banner each time this changes (a day number, a wave, a phase). `null` shows nothing. */
  cue: string | number | null;
  title: ReactNode;
  subtitle?: ReactNode;
  tone?: KitTone;
  /** How long it stays, ms. Default 2400. */
  ms?: number;
  /** Also show for the first value. Default false. */
  initial?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * A big moment banner in the active kit — "Day 2 · Gates open", "Wave 3", "Run started" — shown for a
 * couple of seconds whenever `cue` changes, so phase changes read as transitions instead of a toast.
 *
 * @capability kit-banner a phase-change banner (day, wave, run start) in the active UI kit, shown when its cue changes
 */
export function KitBanner({ cue, title, subtitle, tone, ms = 2400, initial = false, className, style }: KitBannerProps): ReactNode {
  const first = useRef(true);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const isFirst = first.current;
    first.current = false;
    if (cue === null || (isFirst && !initial)) return undefined;
    setOpen(true);
    const timer = setTimeout(() => setOpen(false), ms);
    return () => clearTimeout(timer);
  }, [cue, ms, initial]);
  return (
    <div
      data-jg-banner=""
      className={className}
      style={{ position: "absolute", left: "50%", top: "24%", transform: "translateX(-50%)", zIndex: 70, pointerEvents: "none", display: "grid", justifyItems: "center", gap: 8, ...style }}
    >
      <KitPanel variant="strip" open={open} tone={tone} title={title} aside={subtitle} />
    </div>
  );
}
