/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode, Ref } from "@jgengine/core/ui/jsx";
import type { ButtonHTMLAttributes } from "@jgengine/core/ui/jsx/dom.view";

import { useEngineStyles } from "@jgengine/react/engineStyles";
import { memoView } from "../ui/memoView.view";
import { useHudInteract, type HudInteractListener } from "./hudInteract.view";

/** Visual weight of a {@link HudButton}. */
export type HudButtonVariant = "secondary" | "primary" | "danger" | "ghost";

/** Size of a {@link HudButton}; `icon` is a 28px square. */
export type HudButtonSize = "sm" | "md" | "lg" | "icon";

/** Props for {@link HudButton}: native button attributes plus theme-driven variant, size, and feedback hooks. */
export interface HudButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: HudButtonVariant;
  size?: HudButtonSize;
  /** Stretch to the container width. */
  block?: boolean;
  /** Native button type. Default `"button"`. */
  type?: "button" | "submit" | "reset";
  /** Feedback cue name, rendered as `data-jg-cue` and passed to `onInteract`. */
  cue?: string;
  /** Called on hover, press, focus, and activate — the seam a UI sound system hooks. */
  onInteract?: HudInteractListener;
  children?: ReactNode;
}

/**
 * Themed HUD button: reads the `HudTheme` slot, accent, elevation, motion, and state tokens, and
 * gets hover lift, press scale, a focus-visible ring, and a disabled state from the engine
 * stylesheet. `className` and `style` restyle it per game. Interactions report to `onInteract` and
 * the nearest `HudInteractProvider`.
 *
 * @capability hud-button themed button with hover lift, press scale, focus ring, disabled state, and an interaction cue seam
 */
export const HudButton = memoView("HudButton", function HudButton({
  variant = "secondary",
  size = "md",
  block,
  type = "button",
  cue,
  onInteract,
  onClick,
  onPointerEnter,
  onPointerDown,
  onFocus,
  disabled,
  children,
  ref,
  ...rest
}: HudButtonProps & { ref?: Ref<HTMLButtonElement> }): ReactNode {
  useEngineStyles();
  const report = useHudInteract("button", cue, onInteract);
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={disabled}
      data-jg-button=""
      data-variant={variant}
      data-size={size}
      data-block={block === true ? "" : undefined}
      data-jg-cue={cue}
      onPointerEnter={(event) => {
        if (disabled !== true) report("hover");
        onPointerEnter?.(event);
      }}
      onPointerDown={(event) => {
        if (disabled !== true) report("press");
        onPointerDown?.(event);
      }}
      onFocus={(event) => {
        report("focus");
        onFocus?.(event);
      }}
      onClick={(event) => {
        report("activate");
        onClick?.(event);
      }}
    >
      {children}
    </button>
  );
});
