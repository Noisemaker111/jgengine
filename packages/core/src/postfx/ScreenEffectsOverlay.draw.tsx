/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useReducer, useRef, type CSSProperties, type ReactNode } from "@jgengine/core/ui/jsx";

import type { ScreenEffect, ScreenEffectsController } from "@jgengine/core/vfx/screenEffects";

function effectBackground(effect: ScreenEffect): string {
  if (effect.shape === "vignette") {
    // Transparent core → the effect color at the corners, scaled by opacity.
    return `radial-gradient(ellipse at center, transparent 40%, ${effect.color} 140%)`;
  }
  return effect.color;
}

function effectOpacity(effect: ScreenEffect): number {
  const a = effect.intensity;
  return a < 0 ? 0 : a > 1 ? 1 : a;
}

export interface ScreenEffectsOverlayProps {
  controller: ScreenEffectsController;
  blendMode?: CSSProperties["mixBlendMode"];
  zIndex?: number;
  animate?: boolean;
}

/**
 * A DOM overlay that renders a {@link ScreenEffectsController} as full-screen
 * color-grade layers over the game canvas — damage vignettes, heal flashes, a
 * sustained low-health pulse — through the shell's postfx overlay layer, so a game
 * gets screen feedback without hand-rolling shader or overlay timing. It subscribes
 * to the model, drives `advance()` on an animation frame (unless the game ticks it),
 * and paints one absolutely-positioned, pointer-transparent layer per active effect
 * at its eased opacity. Presentation only: all timing and state live in the core
 * model, and `kind` is never interpreted here.
 *
 * @capability screen-effects-overlay shell DOM overlay that renders a core screen-effects controller as full-screen flash / edge-vignette / low-health-pulse color-grade layers
 */
export function ScreenEffectsOverlay({
  controller,
  blendMode = "normal",
  zIndex = 40,
  animate = true,
}: ScreenEffectsOverlayProps): ReactNode {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const rafRef = useRef(0);

  useEffect(() => controller.subscribe(bump), [controller]);

  useEffect(() => {
    if (!animate) return;
    let running = true;
    const loop = (): void => {
      if (!running) return;
      controller.advance();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [controller, animate]);

  const composite = controller.composite();
  if (composite.length === 0) return null;

  const root: CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    overflow: "hidden",
    zIndex,
  };

  return (
    <div style={root} aria-hidden="true" data-jg-screen-effects="">
      {composite.map((effect) => (
        <div
          key={effect.id}
          style={{
            position: "absolute",
            inset: 0,
            background: effectBackground(effect),
            opacity: effectOpacity(effect),
            mixBlendMode: blendMode,
          }}
        />
      ))}
    </div>
  );
}
