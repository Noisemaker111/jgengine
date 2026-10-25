import type { ReactNode } from "react";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/shell/gameKit";

import { idea } from "../idea";

type Slot = "topLeft" | "top" | "topRight" | "left" | "right" | "bottomLeft" | "bottom" | "bottomRight";

const ANCHORS: Record<Slot, { anchor: "top-left" | "top" | "top-right" | "left" | "right" | "bottom-left" | "bottom" | "bottom-right"; inset: { x: number; y: number } }> = {
  topLeft: { anchor: "top-left", inset: { x: 16, y: 16 } },
  top: { anchor: "top", inset: { x: 0, y: 14 } },
  topRight: { anchor: "top-right", inset: { x: 16, y: 16 } },
  left: { anchor: "left", inset: { x: 16, y: 0 } },
  right: { anchor: "right", inset: { x: 16, y: 0 } },
  bottomLeft: { anchor: "bottom-left", inset: { x: 16, y: 16 } },
  bottom: { anchor: "bottom", inset: { x: 0, y: 16 } },
  bottomRight: { anchor: "bottom-right", inset: { x: 16, y: 16 } },
};

/** The widest a corner panel draws, at the 1600x900 design size the HUD scales from. */
export const PANEL_WIDTH = 248;

/**
 * The play HUD: a few small panels pinned to the screen's edges, scaled from a 1600x900 design to
 * any window, and movable by the player (the layout is remembered). Keep it to a handful of slots;
 * the world is the picture. No drop shadows or filters here - they cost frames over the 3D view.
 */
export function HudFrame({ slots, overlay }: { slots: Partial<Record<Slot, ReactNode>>; overlay?: ReactNode }): ReactNode {
  const layout = useHudLayout({ storageKey: idea.id });
  return (
    <HudCanvas layout={layout} showDuring={["playing", "ended"]}>
      {(Object.keys(ANCHORS) as Slot[]).map((slot) =>
        slots[slot] === undefined || slots[slot] === null ? null : (
          <HudPanel key={slot} id={slot} anchor={ANCHORS[slot].anchor} inset={ANCHORS[slot].inset}>
            {slots[slot]}
          </HudPanel>
        ),
      )}
      {overlay}
    </HudCanvas>
  );
}

/** A number and its word, side by side: the HUD's resource readout. */
export function Count({ value, label, id }: { value: number | string; label: string; id?: string }): ReactNode {
  return (
    <span data-count={id ?? label} style={{ display: "inline-flex", gap: 5, alignItems: "baseline", whiteSpace: "nowrap" }}>
      <span style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      <span style={{ opacity: 0.72, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 10.5 }}>{label}</span>
    </span>
  );
}

/** A row of counts with even gaps. */
export function Counts({ children }: { children: ReactNode }): ReactNode {
  return <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" }}>{children}</div>;
}
