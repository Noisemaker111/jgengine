import { useEffect, useReducer, type CSSProperties, type ReactNode } from "react";

import type { CameraShakeController } from "@jgengine/core/camera/shake/cameraShake";

import { KitMeter } from "@jgengine/react/uiKitRoot";
import { HudFrame, type HudFrameVariation } from "@jgengine/core/hud/hudFrame.view";

/** A live read of a camera-shake controller: current trauma `0..1` and the last game-owned `kind`. */
export interface CameraShakeReadout {
  /** Current trauma in `[0, 1]`. */
  trauma: number;
  /** The last free-string `kind` handed to the controller, or `undefined`. */
  kind: string | undefined;
}

/**
 * Subscribe to a camera-shake controller and re-render on every change (add / decay / clear). It only
 * reads: the camera rig that applies the shake is what advances it. Returns the current trauma + kind
 * for a HUD readout.
 *
 * @capability use-camera-shake React hook reading a camera-shake controller's live trauma and kind
 */
export function useCameraShakeReadout(controller: CameraShakeController): CameraShakeReadout {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => controller.subscribe(bump), [controller]);
  return { trauma: controller.trauma(), kind: controller.kind() };
}

/** Props for {@link CameraShakeMeter}. */
export interface CameraShakeMeterProps {
  /** The controller to read. */
  controller: CameraShakeController;
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
 * trauma meter (reusing the shared {@link KitMeter}) plus a live
 * percentage and the current impact `kind` label. Presentation only — it reads the
 * controller and never interprets `kind`, mapping it through `kindLabels` for
 * display. The shell camera rig applies the same controller's `offset()` to the
 * camera; this panel is the on-screen readout of how much shake is in flight.
 *
 * @capability camera-shake-meter HUD readout for a core camera-shake controller — a trauma meter plus current impact-kind label, reskinnable and kind-labelled
 */
export function CameraShakeMeter({
  controller,
  title = "CAMERA SHAKE",
  kindLabels,
  variation = "glass",
  className,
  style,
}: CameraShakeMeterProps): ReactNode {
  const { trauma, kind } = useCameraShakeReadout(controller);
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
        <KitMeter value={pct} max={100} label="TRAUMA" tone="warn" />
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
