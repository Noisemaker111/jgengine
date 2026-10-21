import { forwardRef, useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

import { useReducedMotion } from "./accessibility";
import { useEngineStyles } from "./engineStyles";
import { useHudInteract, type HudInteractListener } from "./hudInteract";
import { usePresence } from "./presence";

/** Shadow height of a {@link HudSurface}. */
export type HudSurfaceElevation = "raised" | "overlay" | "modal";

/** Block elements a {@link HudSurface} can render as, so it can be a landmark. */
export type HudSurfaceElement = "div" | "section" | "aside" | "nav" | "header" | "footer" | "article" | "main" | "form" | "dialog";

/** Props for {@link HudSurface}. */
export interface HudSurfaceProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Element to render. Default `div`; `section`, `aside`, `nav` and the like make it a landmark. */
  as?: HudSurfaceElement;
  /** Show or hide with an enter/exit transition. Unset renders a static panel with no transition. */
  open?: boolean;
  /** Uppercase header label at the top-left. */
  title?: ReactNode;
  /** Header content at the top-right, opposite `title`. */
  aside?: ReactNode;
  /** Shadow height. Default `raised`. */
  elevation?: HudSurfaceElevation;
  /** Sets `--jg-panel-padding` (default 12px from the stylesheet), so a game class or media query still overrides it. */
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
 * (`data-state="open" | "closed"`); reduced motion skips both. Padding comes from
 * `--jg-panel-padding`, and the engine rules sit in a cascade layer, so a game's `className`
 * restyles it without `!important`. Not the `HudCanvas` layout slot (`HudPanel` in `@jgengine/react/hudLayout`).
 *
 * @capability hud-surface themed panel frame with elevation, header slots, landmark element, and open/close transitions
 */
export const HudSurface = forwardRef<HTMLElement, HudSurfaceProps>(function HudSurface(
  { as: Element = "div", open, title, aside, elevation = "raised", padding, width, interactive = true, cue, onInteract, style, children, ...rest },
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
  const frameStyle: CSSProperties & Record<`--${string}`, string | number> = {
    width,
    pointerEvents: interactive ? "auto" : undefined,
    ...(padding === undefined ? {} : { "--jg-panel-padding": typeof padding === "number" ? `${padding}px` : padding }),
    ...style,
  };
  return (
    <Element
      {...rest}
      ref={ref as never}
      data-jg-panel=""
      data-state={open === undefined ? undefined : presence}
      data-elevation={elevation}
      data-jg-cue={cue}
      style={frameStyle}
    >
      {hasHeader ? (
        <div data-jg-panel-header="" style={{ marginBottom: 8 }}>
          <span>{title}</span>
          {aside !== undefined ? <span>{aside}</span> : null}
        </div>
      ) : null}
      {children}
    </Element>
  );
});
