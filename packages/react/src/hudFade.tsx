import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** Props for {@link HudFade}. */
export interface HudFadeProps {
  /**
   * Values the group shows. When any changes (health drops, cash comes in, ammo is spent) the group
   * comes back to full strength, then fades again after `idleMs`.
   */
  watch: readonly unknown[];
  /** Quiet time before fading, in ms. Default 3500. */
  idleMs?: number;
  /** Opacity once faded; 0 hides it entirely. Default 0.18. */
  dimTo?: number;
  /** Keep it at full strength (in combat, low health, aiming, a menu open). */
  hold?: boolean;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Whether a HUD group should be at full strength: true for `idleMs` after any watched value
 * changes, and whenever `hold` is set.
 *
 * @capability hud-idle true while a HUD group's values are changing, false once they sit still
 */
export function useHudAwake(watch: readonly unknown[], idleMs = 3500, hold = false): boolean {
  const [awake, setAwake] = useState(true);
  const first = useRef(true);
  const key = JSON.stringify(watch, (_, value: unknown) => (typeof value === "number" ? Math.round(value * 100) / 100 : value));
  useEffect(() => {
    if (hold) {
      setAwake(true);
      return;
    }
    if (!first.current) setAwake(true);
    first.current = false;
    const timer = setTimeout(() => setAwake(false), idleMs);
    return () => clearTimeout(timer);
  }, [key, idleMs, hold]);
  return awake || hold;
}

/**
 * A HUD group that steps back when nothing is happening: it fades after a quiet spell and comes back
 * the moment a watched value changes, so the world fills the screen and the HUD speaks only when it
 * has news. Hovering it also brings it back.
 *
 * ```tsx
 * <HudFade watch={[health, armour]} hold={health < 30}>
 *   <HealthBar />
 * </HudFade>
 * ```
 *
 * @capability hud-fade HUD group that fades when idle and returns when its values change
 */
export function HudFade({ watch, idleMs = 3500, dimTo = 0.18, hold = false, children, className, style }: HudFadeProps): ReactNode {
  const [hovered, setHovered] = useState(false);
  const awake = useHudAwake(watch, idleMs, hold || hovered);
  return (
    <div
      data-jg-hud-fade={awake ? "awake" : "idle"}
      className={className}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        opacity: awake ? 1 : dimTo,
        transition: `opacity calc(${awake ? 160 : 900}ms * var(--jg-motion-scale, 1)) ease`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
