/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useRef, type CSSProperties, type ReactNode, type Ref } from "@jgengine/core/ui/jsx";
import type { HTMLAttributes } from "@jgengine/core/ui/jsx/dom.view";

import { memoView } from "../ui/memoView.view";

import { useReducedMotion } from "@jgengine/core/ui/accessibility.view";
import { useEngineStyles } from "@jgengine/ui/engineStyles";
import { useHudInteract, type HudInteractListener } from "./hudInteract.view";
import { useMountPresence } from "@jgengine/core/ui/presence.view";

export type HudSurfaceElevation = "raised" | "overlay" | "modal";

/** Block elements a {@link HudSurface} can render as, so it can be a landmark. */
export type HudSurfaceElement = "div" | "section" | "aside" | "nav" | "header" | "footer" | "article" | "main" | "form" | "dialog";

export interface HudSurfaceProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  as?: HudSurfaceElement;
  open?: boolean;
  title?: ReactNode;
  aside?: ReactNode;
  elevation?: HudSurfaceElevation;
  /** Sets `--jg-panel-padding` (default 12px from the stylesheet), so a game class or media query still overrides it. */
  padding?: number | string;
  width?: number | string | undefined;
  interactive?: boolean;
  cue?: string;
  onInteract?: HudInteractListener;
}

const EXIT_MS = 140;

/**
 * Themed panel/window frame over the `HudTheme` frame, elevation, and motion tokens. It enters with
 * a short rise-and-fade and stays mounted through its exit when `open` turns false
 * (`data-state="open" | "closed"`); reduced motion skips both. Padding comes from
 * `--jg-panel-padding`, and the engine rules sit in a cascade layer, so a game's `className`
 * restyles it without `!important`. Not the `HudCanvas` layout slot (`HudPanel` in `@jgengine/core/hud/hudLayout.view`).
 *
 * @capability hud-surface themed panel frame with elevation, header slots, landmark element, and open/close transitions
 */
export const HudSurface = memoView("HudSurface", function HudSurface({
  as: Element = "div",
  open,
  title,
  aside,
  elevation = "raised",
  padding,
  width,
  interactive = true,
  cue,
  onInteract,
  style,
  children,
  ref,
  ...rest
}: HudSurfaceProps & { ref?: Ref<HTMLElement> }): ReactNode {
  useEngineStyles();
  const reduced = useReducedMotion();
  const shown = open ?? true;
  const presence = useMountPresence(shown, reduced ? 0 : EXIT_MS);
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
