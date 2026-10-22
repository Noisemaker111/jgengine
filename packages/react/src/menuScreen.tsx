import { useEffect, useMemo, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

import { createMenuTransition, menuTransitionDurations } from "@jgengine/core/ui/menuTransition";

import { useReducedMotion } from "./accessibility";

/** Which motion a {@link MenuScreen} uses when it enters and leaves. */
export type MenuScreenTransition = "fade" | "slide" | "scale" | "none";

/** How much a {@link MenuScreen} dims the scene behind it. `none` keeps a live 3D scene fully visible. */
export type MenuScreenScrim = "none" | "dim" | "blur";

/** Props for {@link MenuScreen}. */
export interface MenuScreenProps {
  /** Open state the game owns. Closing runs the exit animation, then unmounts. Default true. */
  open?: boolean;
  /** Enter/exit motion. Default `"fade"`. */
  transition?: MenuScreenTransition;
  /** Dim/blur treatment over the scene behind. Default `"dim"`. */
  scrim?: MenuScreenScrim;
  /** Enter duration in ms. Default 220. */
  enterMs?: number;
  /** Exit duration in ms. Default 160. */
  exitMs?: number;
  /** Force motion off (reduced motion is also read from the accessibility preference and the OS). */
  reducedMotion?: boolean;
  /** Accessible name of the screen. */
  label?: string;
  /** `role` for the screen element. Default `"dialog"`. */
  role?: string;
  /** Full-bleed layer painted behind the menu content — a live canvas, a poster, or a preview. */
  backdrop?: ReactNode;
  className?: string;
  style?: CSSProperties;
  contentClassName?: string;
  contentStyle?: CSSProperties;
  children?: ReactNode;
  /** Called once the exit animation finished and the screen unmounted. */
  onClosed?: () => void;
}

const KEYFRAMES: Record<Exclude<MenuScreenTransition, "none">, { enter: string; exit: string }> = {
  fade: { enter: "jg-fade-in", exit: "jg-fade-out" },
  slide: { enter: "jg-slide-up", exit: "jg-fade-out" },
  scale: { enter: "jg-panel-in", exit: "jg-panel-out" },
};

const SCRIMS: Record<MenuScreenScrim, CSSProperties> = {
  none: {},
  dim: { background: "radial-gradient(140% 130% at 50% 45%, rgba(0,0,0,0.34), rgba(0,0,0,0.78))" },
  blur: {
    background: "radial-gradient(140% 130% at 50% 45%, rgba(0,0,0,0.38), rgba(0,0,0,0.8))",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
  },
};

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

/**
 * One animated screen of a game front-end: full-bleed, laid out by the game, with an enter/exit
 * animation that runs on transform/opacity only (no layout, no frame hitch) and unmounts when the
 * exit finishes. The scrim is translucent and the optional `backdrop` slot paints behind the content,
 * so a live 3D scene stays visible behind a title, pause or settings screen. Durations come from the
 * caller or collapse to zero under reduced motion.
 *
 * @capability menu-screen animated enter/exit menu screen over a live scene, with translucent scrim, backdrop slot, reduced-motion support and exit unmount
 */
export function MenuScreen({
  open = true,
  transition = "fade",
  scrim = "dim",
  enterMs = 220,
  exitMs = 160,
  reducedMotion,
  label,
  role = "dialog",
  backdrop,
  className,
  style,
  contentClassName,
  contentStyle,
  children,
  onClosed,
}: MenuScreenProps): ReactNode {
  const prefersReduced = useReducedMotion();
  const motion = reducedMotion === undefined ? prefersReduced : reducedMotion || prefersReduced;
  const machine = useMemo(() => {
    const config = { enterMs, exitMs, reducedMotion: motion };
    const initial = open
      ? { phase: menuTransitionDurations(config).enter === 0 ? ("open" as const) : ("enter" as const), since: now() }
      : undefined;
    return createMenuTransition(config, initial);
    // `open` is read once for the initial phase; later changes are driven by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enterMs, exitMs, motion]);
  const phase = useSyncExternalStore(
    machine.subscribe,
    () => machine.state().phase,
    () => machine.state().phase,
  );

  useEffect(() => {
    if (open) machine.open(now());
    else machine.close(now());
  }, [open, machine]);

  useEffect(() => {
    if (phase !== "enter" && phase !== "exit") return;
    if (typeof requestAnimationFrame !== "function") {
      machine.tick(now());
      return;
    }
    let frame = requestAnimationFrame(function tick() {
      machine.tick(now());
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [phase, machine]);

  useEffect(() => {
    if (phase === "closed" && !open) onClosed?.();
  }, [phase, open, onClosed]);

  if (phase === "closed") return null;

  const durations = menuTransitionDurations({ enterMs, exitMs, reducedMotion: motion });
  const frames = transition === "none" ? null : KEYFRAMES[transition];
  const contentAnimation: CSSProperties = frames === null || phase === "open"
    ? {}
    : {
        animationName: phase === "enter" ? frames.enter : frames.exit,
        animationDuration: `${phase === "enter" ? durations.enter : durations.exit}ms`,
        animationTimingFunction: "var(--jg-ease-out, cubic-bezier(0.16, 1, 0.3, 1))",
        animationFillMode: "both",
      };
  const scrimAnimation: CSSProperties = phase === "open"
    ? {}
    : {
        animationName: phase === "enter" ? "jg-fade-in" : "jg-fade-out",
        animationDuration: `${phase === "enter" ? durations.enter : durations.exit}ms`,
        animationTimingFunction: "var(--jg-ease-out, cubic-bezier(0.16, 1, 0.3, 1))",
        animationFillMode: "both",
      };

  return (
    <div
      data-jg-menu-screen=""
      data-phase={phase}
      data-transition={transition}
      data-scrim={scrim}
      role={role}
      aria-label={label}
      aria-modal={scrim === "none" ? undefined : true}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        color: "var(--jg-text, #f5f7fa)",
        fontFamily: "var(--jg-font-body, inherit)",
        ...style,
      }}
    >
      {backdrop === undefined ? null : (
        <div
          data-jg-menu-backdrop=""
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          {backdrop}
        </div>
      )}
      <div
        data-jg-menu-scrim=""
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", ...SCRIMS[scrim], ...scrimAnimation }}
      />
      <div
        data-jg-menu-content=""
        className={contentClassName}
        style={{ position: "relative", pointerEvents: "auto", ...contentAnimation, ...contentStyle }}
      >
        {children}
      </div>
    </div>
  );
}
