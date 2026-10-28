import type { CSSProperties, ReactNode } from "react";

import { ObjectiveBannerHost, type ObjectiveBannerTheme } from "@jgengine/core/mission/objectiveBanner.view";
import { QuestTracker } from "@jgengine/core/mission/questTracker.view";
import type { TrackedQuestView } from "@jgengine/core/mission/quest";
import { onboardingOf, type OnboardingRuntime } from "@jgengine/core/onboarding/onboardingSystem";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";

/**
 * The running onboarding, or `null` when the game installed none. Compose its `markers` into the
 * game's `Minimap` and its `waypoints` into a compass.
 */
export function useOnboarding(): OnboardingRuntime | null {
  return onboardingOf(useGameContext());
}

interface OnboardingHudView {
  quest: TrackedQuestView;
  finished: boolean;
  next: boolean;
  detail: string | undefined;
}

const sameView = (a: OnboardingHudView | null, b: OnboardingHudView | null): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Props for {@link OnboardingHud}. */
export interface OnboardingHudProps {
  /** Accent for ticks, progress and buttons. */
  accent?: string;
  skipLabel?: string;
  nextLabel?: string;
  /** Show only the current step and this many after it, with "N of M" on the title, so a long path stays a line or two. Default: every step. */
  ahead?: number;
  style?: CSSProperties;
}

/**
 * The tracker's view of `quest` cut to the step at `current` and `ahead` steps after it, its title
 * counting the step ("Survivor's path · 3 of 22"). `ahead` undefined keeps every step.
 *
 * @internal
 */
export function onboardingWindow(quest: TrackedQuestView, current: string | undefined, ahead: number | undefined): TrackedQuestView {
  if (ahead === undefined || current === undefined) return quest;
  const at = quest.objectives.findIndex((objective) => objective.id === current);
  if (at < 0) return quest;
  return { ...quest, title: `${quest.title} · ${at + 1} of ${quest.objectives.length}`, objectives: quest.objectives.slice(at, at + 1 + Math.max(0, ahead)) };
}

/**
 * The onboarding's HUD: its steps as a quest in the existing `QuestTracker` (current step's detail
 * under it), Next for a step the player acknowledges, and Skip when skippable. Put it in a
 * `HudSlots` slot; it hides itself once finished.
 *
 * @capability onboarding-hud onboarding steps in the quest tracker with Next and Skip
 */
export function OnboardingHud({ accent, skipLabel = "Skip tutorial", nextLabel = "Next", ahead, style }: OnboardingHudProps): ReactNode {
  const runtime = useOnboarding();
  const { commands } = useGame();
  const view = useGameStore((ctx): OnboardingHudView | null => {
    const run = onboardingOf(ctx)?.run();
    if (run === undefined) return null;
    const current = run.current();
    return { quest: onboardingWindow(run.tracked(), current?.step.id, ahead), finished: run.isFinished(), next: current !== null && "next" in current.step.done, detail: current?.step.detail };
  }, sameView);
  if (runtime === null || view === null || view.finished) return null;
  const button: CSSProperties = { pointerEvents: "auto", cursor: "pointer", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, border: "1px solid rgba(148,163,184,0.4)", background: "rgba(11,14,19,0.85)", color: "#e2e8f0" };
  return (
    <div data-onboarding={runtime.config.id} data-style={runtime.config.style} style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      <QuestTracker quests={[view.quest]} title={ahead === undefined ? runtime.config.title : ""} {...(accent === undefined ? {} : { accent })} />
      {view.detail === undefined ? null : <div style={{ maxWidth: 260, fontSize: 12, color: "#e2e8f0", textShadow: "0 1px 2px #000" }}>{view.detail}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        {view.next ? <button type="button" data-onboarding-next="" style={button} onClick={() => void commands.run("onboarding.next", {})}>{nextLabel}</button> : null}
        {runtime.config.skippable === false ? null : <button type="button" data-onboarding-skip="" style={button} onClick={() => void commands.run("onboarding.skip", {})}>{skipLabel}</button>}
      </div>
    </div>
  );
}

/**
 * The step-done banner ("Gather stone" / "Next: Craft a Stone Pick") through `ObjectiveBannerHost`.
 * By default it sits near the top of the screen; put it in the HUD's full-screen overlay. With
 * `placement: "inline"` it lays out in its parent instead: put it in a `HudSlots` slot (usually `top`)
 * so it stacks with that slot's other lines rather than over them.
 *
 * @capability onboarding-banner announces each finished onboarding step and the next one on the objective banner
 */
export function OnboardingBanner({ theme, placement = "overlay" }: { theme?: ObjectiveBannerTheme; placement?: "overlay" | "inline" }): ReactNode {
  const runtime = useOnboarding();
  if (runtime === null) return null;
  return (
    <ObjectiveBannerHost
      controller={runtime.banner}
      theme={{ titleSize: "clamp(1.4rem, 3vw, 2.2rem)", subtitleSize: "clamp(0.9rem, 1.6vw, 1.1rem)", ...theme }}
      placement={placement}
      {...(placement === "overlay" ? { style: { justifyContent: "flex-start", paddingTop: "14vh" } } : {})}
    />
  );
}
