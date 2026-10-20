import { forwardRef, useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

import { useReducedMotion } from "./accessibility";
import { useEngineStyles } from "./engineStyles";
import { useHudInteract, type HudInteractListener } from "./hudInteract";
import { usePresence } from "./presence";

/** Shadow height of a {@link HudPanel}. */
export type HudPanelElevation = "raised" | "overlay" | "modal";

/** Props for {@link HudPanel}. */
export interface HudPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Show or hide with an enter/exit transition. Unset renders a static panel with no transition. */
  open?: boolean;
  /** Uppercase header label at the top-left. */
  title?: ReactNode;
  /** Header content at the top-right, opposite `title`. */
  aside?: ReactNode;
  /** Shadow height. Default `raised`. */
  elevation?: HudPanelElevation;
  padding?: number | string;
  width?: number | string;
  /** Accept pointer events. Default `true`. */
  interactive?: boolean;
  /** Feedback cue name, rendered as `data-jg-cue` and passed to `onInteract`. */
  cue?: string;
  /** Called with `open` and `close` as the panel shows and hides. */
  onInteract?: HudInteractListener;
}

const EXIT_MS = 140;

/**
 * Themed panel/window frame over the `HudTheme` frame, elevation, and motion tokens. It enters with
 * a short rise-and-fade and stays mounted through its exit when `open` turns false
 * (`data-state="open" | "closed"`); reduced motion skips both. `className` and `style` restyle it.
 *
 * @capability hud-panel themed panel frame with elevation, header slots, and open/close transitions
 */
export const HudPanel = forwardRef<HTMLDivElement, HudPanelProps>(function HudPanel(
  { open, title, aside, elevation = "raised", padding = 12, width, interactive = true, cue, onInteract, style, children, ...rest },
  ref,
) {
  useEngineStyles();
  const reduced = useReducedMotion();
  const shown = open ?? true;
  const presence = usePresence(shown, reduced ? 0 : EXIT_MS);
  const report = useHudInteract("panel", cue, onInteract);
  const wasOpen = useRef(shown);
  useEffect(() => {
    if (wasOpen.current === shown) return;
    wasOpen.current = shown;
    report(shown ? "open" : "close");
  }, [shown, report]);
  if (presence === "unmounted") return null;
  const hasHeader = title !== undefined || aside !== undefined;
  return (
    <div
      {...rest}
      ref={ref}
      data-jg-panel=""
      data-state={open === undefined ? undefined : presence}
      data-elevation={elevation}
      data-jg-cue={cue}
      style={{ padding, width, pointerEvents: interactive ? "auto" : undefined, ...style }}
    >
      {hasHeader ? (
        <div data-jg-panel-header="" style={{ marginBottom: 8 }}>
          <span>{title}</span>
          {aside !== undefined ? <span>{aside}</span> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
});
