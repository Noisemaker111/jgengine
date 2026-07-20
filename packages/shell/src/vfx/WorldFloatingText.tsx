import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useState, type CSSProperties } from "react";

import type { FloatingTextField, FloatingTextView } from "@jgengine/core/ui/floatingText";
import { FloatingText, type FloatingTextLayoutOptions } from "@jgengine/react/floatingText";

import { useWorldProjection } from "../world/WorldEntityFrames";

/** Props for {@link WorldFloatingText}. */
export interface WorldFloatingTextProps extends FloatingTextLayoutOptions {
  /** The core field to render (`createFloatingTextField`). */
  field: FloatingTextField;
  /**
   * Advance the field each frame with the render delta. Leave `true` for a
   * fire-and-forget overlay; set `false` when your game loop already ticks the
   * field so it advances exactly once per fixed step.
   */
  advance?: boolean;
  /** Per-`kind` art direction merged over the defaults (color, font, shadow). */
  styleFor?: (view: FloatingTextView) => CSSProperties;
  /** Base font size in px at `size === 1`. Default 20. */
  fontSizePx?: number;
  /** Class on the overlay layer. */
  className?: string;
}

function pinToViewport(
  _el: unknown,
  _camera: unknown,
  size: { width: number; height: number },
): [number, number] {
  return [size.width / 2, size.height / 2];
}

/**
 * R3F one-line drop-in for world-anchored floating text: mounts inside the scene,
 * (optionally) advances a core {@link FloatingTextField} each frame, samples the
 * live camera to project every live entry to the screen, and renders
 * `@jgengine/react`'s {@link FloatingText} through a fullscreen `<Html>` overlay.
 * This is the turnkey way an R3F game gets damage numbers / heal pops / XP gains
 * from its own field without wiring projection by hand — the camera binding,
 * viewport culling, and depth stacking come for free. Skin per `kind` with `styleFor`.
 *
 * @capability floating-text R3F drop-in that advances a floating-text field and renders it camera-projected over the scene
 */
export function WorldFloatingText({
  field,
  advance = true,
  styleFor,
  fontSizePx,
  className,
  ...layout
}: WorldFloatingTextProps) {
  const size = useThree((state) => state.size);
  const project = useWorldProjection();
  const [, setTick] = useState(0);
  useFrame((_, delta) => {
    if (advance) field.update(Math.min(delta, 0.1));
    // Re-render every frame so projected positions follow the camera and the sim.
    setTick((n) => n + 1);
  });
  return (
    <Html fullscreen calculatePosition={pinToViewport} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <FloatingText
        entries={field.active()}
        project={project}
        viewport={{ width: size.width, height: size.height }}
        styleFor={styleFor}
        fontSizePx={fontSizePx}
        className={className}
        {...layout}
      />
    </Html>
  );
}
