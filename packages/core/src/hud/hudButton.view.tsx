/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode, Ref } from "@jgengine/core/ui/jsx";
import type { ButtonHTMLAttributes } from "@jgengine/core/ui/jsx/dom.view";

import { useEngineStyles } from "@jgengine/ui/engineStyles";
import { memoView } from "../ui/memoView.view";
import { useHudInteract, type HudInteractListener } from "./hudInteract.view";

export type HudButtonVariant = "secondary" | "primary" | "danger" | "ghost";

export type HudButtonSize = "sm" | "md" | "lg" | "icon";

export interface HudButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: HudButtonVariant;
  size?: HudButtonSize;
  block?: boolean;
  type?: "button" | "submit" | "reset";
  cue?: string;
  onInteract?: HudInteractListener;
  children?: ReactNode;
}

/** @capability hud-button themed button with hover lift, press scale, focus ring, disabled state, and an interaction cue seam */
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
