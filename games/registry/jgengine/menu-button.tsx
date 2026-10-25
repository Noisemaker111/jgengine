import { useState, type CSSProperties } from "react";

import { KeybindBadge } from "@/components/ui/keybind-badge";

const slantBar = (lean: number) =>
  `polygon(${lean}px 0, 100% 0, calc(100% - ${lean}px) 100%, 0 100%)`;

export function MenuButton({
  label,
  keybind,
  onActivate,
  variant = "primary",
  width,
  className,
}: {
  label: string;
  keybind?: string;
  onActivate?: () => void;
  variant?: "primary" | "ghost" | "danger";
  width?: number | string;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const gradient =
    variant === "danger"
      ? "linear-gradient(180deg, var(--jg-danger) 0%, #5c1410 100%)"
      : "linear-gradient(180deg, var(--jg-accent) 0%, var(--jg-accent-deep) 100%)";
  const variantStyle: CSSProperties =
    variant === "ghost"
      ? {
          background: hovered ? "rgba(255,255,255,0.06)" : "transparent",
          border: "1px solid var(--jg-edge-bright)",
          color: "var(--jg-text)",
        }
      : {
          background: gradient,
          border: "none",
          color: variant === "danger" ? "var(--jg-text)" : "var(--jg-surface-deep)",
          filter: hovered ? "brightness(1.15)" : "brightness(1)",
        };
  return (
    <button
      type="button"
      className={`inline-flex cursor-pointer items-center justify-center gap-2 px-[26px] py-[9px] text-[13px] font-bold uppercase tracking-[0.2em] transition-[filter,background] duration-150 ease-in-out ${className ?? ""}`}
      data-jg="menu-button"
      data-variant={variant}
      onClick={onActivate}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width,
        clipPath: slantBar(8),
        fontFamily: "var(--jg-font-display)",
        ...variantStyle,
      }}
    >
      {label}
      {keybind !== undefined && <KeybindBadge label={keybind} />}
    </button>
  );
}
