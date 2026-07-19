import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

import type { AchievementTracker, AchievementView } from "@jgengine/core/game/achievements";

/**
 * Subscribe a component to an achievement tracker's live view list. The list
 * keeps a stable identity between changes, so this re-renders only on unlock or
 * progress — not every frame.
 */
export function useAchievements(tracker: AchievementTracker): readonly AchievementView[] {
  return useSyncExternalStore(tracker.subscribe, tracker.list, tracker.list);
}

/** Props for {@link AchievementToast}. */
export interface AchievementToastProps {
  name: string;
  description?: string;
  /** Icon/glyph node the game supplies; the engine never picks art. */
  icon?: ReactNode;
  points?: number;
  /** Small heading above the name. Default `"Achievement Unlocked"`. */
  heading?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * The unlock-moment banner — icon, "Achievement Unlocked" heading, name, and
 * optional points. Purely presentational; pair the game's `onUnlock` seam with
 * a toast queue and render one of these per entry.
 *
 * @capability achievement-toast unlock-moment banner (icon, heading, name, points) for an achievement toast queue
 */
export function AchievementToast({
  name,
  description,
  icon,
  points,
  heading = "Achievement Unlocked",
  className,
  style,
}: AchievementToastProps): ReactNode {
  return (
    <div
      className={className}
      data-achievement-toast
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        minWidth: 240,
        padding: "10px 14px",
        borderRadius: 12,
        background: "linear-gradient(160deg, rgba(30,26,14,0.96), rgba(16,13,8,0.96))",
        border: "1px solid var(--jg-rarity-legendary, rgba(245,158,11,0.55))",
        boxShadow: "0 12px 34px rgba(0,0,0,0.5)",
        color: "#f8fafc",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        ...style,
      }}
    >
      <div
        data-achievement-toast-icon
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "rgba(245,158,11,0.16)",
          border: "1px solid rgba(245,158,11,0.4)",
          fontSize: 20,
          flexShrink: 0,
        }}
      >
        {icon ?? "🏆"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 9, letterSpacing: 1.6, textTransform: "uppercase", color: "rgba(245,158,11,0.85)" }}>
          {heading}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {name}
        </span>
        {description !== undefined ? (
          <span style={{ fontSize: 11, color: "rgba(226,232,240,0.7)" }}>{description}</span>
        ) : null}
      </div>
      {points !== undefined ? (
        <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "var(--jg-rarity-legendary, #f59e0b)", fontVariantNumeric: "tabular-nums" }}>
          {points}
        </span>
      ) : null}
    </div>
  );
}

/** Props for {@link AchievementGallery}. */
export interface AchievementGalleryProps {
  achievements: readonly AchievementView[];
  title?: string;
  /** Render secret + still-locked achievements as masked "???". Default true. */
  maskSecrets?: boolean;
  /** Optional per-achievement icon; falls back to the def `icon` glyph then a lock/trophy. */
  renderIcon?: (achievement: AchievementView) => ReactNode;
  columns?: number;
  emptyLabel?: string;
  className?: string;
  style?: CSSProperties;
}

const MASK = "???";

/**
 * Achievement/trophy gallery — a responsive grid of cards showing unlocked vs.
 * locked state, a progress bar for counter achievements, and a header summary
 * of completion and score. Secret+locked entries mask their name/description.
 * Feed it `useAchievements(tracker)`.
 *
 * @capability achievement-gallery responsive achievement/trophy grid with unlocked/locked state, counter progress bars, secret masking, and a completion/score header
 */
export function AchievementGallery({
  achievements,
  title = "Achievements",
  maskSecrets = true,
  renderIcon,
  columns = 2,
  emptyLabel = "No achievements yet.",
  className,
  style,
}: AchievementGalleryProps): ReactNode {
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const score = achievements.reduce((sum, a) => sum + (a.unlocked ? a.points ?? 0 : 0), 0);
  const hasPoints = achievements.some((a) => a.points !== undefined);

  return (
    <div
      className={className}
      data-achievement-gallery
      style={{
        borderRadius: 14,
        padding: 14,
        background: "linear-gradient(160deg, rgba(20,24,32,0.97), rgba(11,14,19,0.97))",
        border: "1px solid var(--jg-ring, rgba(148,163,184,0.3))",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase" }}>{title}</span>
        <span style={{ fontSize: 11, color: "rgba(203,213,225,0.75)", fontVariantNumeric: "tabular-nums" }}>
          {unlockedCount}/{achievements.length}
          {hasPoints ? ` · ${score} pts` : ""}
        </span>
      </div>
      {achievements.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "rgba(148,163,184,0.8)" }}>{emptyLabel}</p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))`,
            gap: 8,
          }}
        >
          {achievements.map((achievement) => {
            const masked = maskSecrets && achievement.secret === true && !achievement.unlocked;
            const name = masked ? MASK : achievement.name;
            const description = masked ? "Hidden achievement" : achievement.description;
            const showProgress = !achievement.unlocked && achievement.target !== undefined && achievement.target > 0;
            const icon = renderIcon?.(achievement) ?? (masked ? "🔒" : achievement.icon ?? (achievement.unlocked ? "🏆" : "◻"));
            return (
              <li
                key={achievement.id}
                data-achievement={achievement.id}
                data-unlocked={achievement.unlocked}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: 10,
                  borderRadius: 10,
                  background: achievement.unlocked ? "rgba(245,158,11,0.10)" : "rgba(148,163,184,0.06)",
                  border: `1px solid ${achievement.unlocked ? "rgba(245,158,11,0.4)" : "rgba(148,163,184,0.18)"}`,
                  opacity: achievement.unlocked ? 1 : 0.75,
                }}
              >
                <div style={{ fontSize: 20, width: 26, textAlign: "center", flexShrink: 0 }}>{icon}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: achievement.unlocked ? "#f8fafc" : "rgba(226,232,240,0.85)" }}>
                    {name}
                    {achievement.points !== undefined && !masked ? (
                      <span style={{ marginLeft: 6, fontSize: 10, color: "rgba(245,158,11,0.85)", fontWeight: 600 }}>
                        {achievement.points}
                      </span>
                    ) : null}
                  </span>
                  {description !== undefined ? (
                    <span style={{ fontSize: 11, color: "rgba(203,213,225,0.7)" }}>{description}</span>
                  ) : null}
                  {showProgress ? (
                    <div data-achievement-progress style={{ marginTop: 3, height: 5, borderRadius: 9999, background: "rgba(148,163,184,0.2)", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.round(achievement.fraction * 100)}%`,
                          height: "100%",
                          borderRadius: 9999,
                          background: "var(--jg-accent, #f59e0b)",
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
