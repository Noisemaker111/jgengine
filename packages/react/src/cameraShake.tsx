import { useEffect, useReducer, useRef, type CSSProperties, type ReactNode } from "react";

import type { CameraShakeController } from "@jgengine/core/vfx/cameraShake";

import { StaminaBar } from "./bars";
import { HudFrame, type HudFrameVariation } from "./hudFrame";

/** A live read of a camera-shake controller: current trauma `0..1` and the last game-owned `kind`. */
export interface CameraShakeReadout {
  /** Current trauma in `[0, 1]`. */
  trauma: number;
  /** The last free-string `kind` handed to the controller, or `undefined`. */
  kind: string | undefined;
}

/**
 * Subscribe to a camera-shake controller and re-render on every change (add /
 * decay / clear). Optionally drives `update()` on an animation frame so the trauma
 * meter bleeds down live even when no game loop ticks the controller. Returns the
 * current trauma + kind for a HUD readout.
 *
 * @capability use-camera-shake React hook binding a camera-shake controller — subscribes for live trauma/kind and can self-drive its decay on a frame loop
 */
export function useCameraShake(controller: CameraShakeController, animate = true): CameraShakeReadout {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const rafRef = useRef(0);

  useEffect(() => controller.subscribe(bump), [controller]);

  useEffect(() => {
    if (!animate) return;
    let running = true;
    let last = performance.now();
    const loop = (): void => {
      if (!running) return;
      const nowMs = performance.now();
      controller.update((nowMs - last) / 1000);
      last = nowMs;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [controller, animate]);

  return { trauma: controller.trauma(), kind: controller.kind() };
}

/** Props for {@link CameraShakeMeter}. */
export interface CameraShakeMeterProps {
  /** The controller to read. */
  controller: CameraShakeController;
  /**
   * Drive the controller's decay on an animation frame so the meter bleeds down
   * live. Default `false` — leave off when a shell consumer already ticks
   * `update()` each frame (the usual case), on to make the panel self-sufficient.
   */
  animate?: boolean;
  /** Header label. Default `"CAMERA SHAKE"`. */
  title?: string;
  /**
   * Human labels per game-owned `kind`, so the readout can show "Explosion" for a
   * `"explosion"` impact. The model never interprets `kind`; this is pure display.
   */
  kindLabels?: Record<string, string>;
  /** Frame skin. Default `"glass"`. */
  variation?: HudFrameVariation;
  className?: string;
  style?: CSSProperties;
}

/**
 * A drop-in HUD panel that visualizes a core {@link CameraShakeController}: a
 * trauma meter (reusing the shared {@link StaminaBar} building block) plus a live
 * percentage and the current impact `kind` label. Presentation only — it reads the
 * controller and never interprets `kind`, mapping it through `kindLabels` for
 * display. A shell component applies the same controller's `offset()` to the
 * camera; this panel is the on-screen readout of how much shake is in flight.
 *
 * @capability camera-shake-meter HUD readout for a core camera-shake controller — a trauma meter plus current impact-kind label, reskinnable and kind-labelled
 */
export function CameraShakeMeter({
  controller,
  animate = false,
  title = "CAMERA SHAKE",
  kindLabels,
  variation = "glass",
  className,
  style,
}: CameraShakeMeterProps): ReactNode {
  const { trauma, kind } = useCameraShake(controller, animate);
  const pct = Math.round(trauma * 100);
  const kindLabel = kind === undefined ? "—" : kindLabels?.[kind] ?? kind;

  return (
    <HudFrame
      className={className}
      variation={variation}
      title={title}
      aside={<span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.85 }}>{pct}%</span>}
      padding={12}
      width={240}
      style={style}
    >
      <div data-camera-shake-meter="" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <StaminaBar value={pct} max={100} label="TRAUMA" fill="#f97316" showValue={false} width="100%" />
        <div
          data-camera-shake-kind={kind ?? ""}
          style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.85 }}
        >
          <span style={{ textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.7 }}>Last impact</span>
          <span style={{ fontWeight: 700 }}>{kindLabel}</span>
        </div>
      </div>
    </HudFrame>
  );
}
