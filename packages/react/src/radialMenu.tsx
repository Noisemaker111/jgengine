import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { radialIndexFromVector, radialSlicePosition } from "@jgengine/core/ui/radialMenu";

const TWO_PI = Math.PI * 2;

/** One selectable entry on a radial/quick menu (weapon or emote wheel). */
export interface RadialMenuOption {
  id: string;
  label?: string;
  /** Glyph/icon node the game supplies. */
  icon?: ReactNode;
  disabled?: boolean;
  /** Per-slice accent; falls back to the menu `accent`. */
  color?: string;
}

/** Props for {@link RadialMenu}. */
export interface RadialMenuProps {
  options: readonly RadialMenuOption[];
  /** Render nothing when false. Default true. */
  open?: boolean;
  onSelect: (id: string) => void;
  onClose?: () => void;
  /** Diameter in px. Default 300. */
  size?: number;
  /** Neutral inner-hub radius (dead zone) in px. Default 52. */
  innerRadius?: number;
  /** Force a highlighted slice (also the initial hover) — for controllers/tests. */
  highlightIndex?: number | null;
  accent?: string;
  className?: string;
  style?: CSSProperties;
}

function wedgePath(cx: number, cy: number, innerR: number, outerR: number, center: number, half: number): string {
  const point = (r: number, a: number): [number, number] => [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
  const start = center - half;
  const end = center + half;
  const [x0, y0] = point(outerR, start);
  const [x1, y1] = point(outerR, end);
  const [x2, y2] = point(innerR, end);
  const [x3, y3] = point(innerR, start);
  return `M${x0},${y0} A${outerR},${outerR} 0 0 1 ${x1},${y1} L${x2},${y2} A${innerR},${innerR} 0 0 0 ${x3},${y3} Z`;
}

/**
 * Radial / quick menu (weapon or emote wheel): a ring of selectable wedges the
 * player points at with the mouse (or a stick). Pointer angle drives the
 * highlight via core `radialIndexFromVector`; click/confirm fires `onSelect`,
 * the neutral hub closes. The game supplies option icons/labels and skins it.
 *
 * @capability radial-menu pointer/stick-driven radial quick menu (weapon/emote wheel) — angular slice selection with a neutral hub
 */
export function RadialMenu({
  options,
  open = true,
  onSelect,
  onClose,
  size = 300,
  innerRadius = 52,
  highlightIndex,
  accent = "var(--jg-accent, #38bdf8)",
  className,
  style,
}: RadialMenuProps): ReactNode {
  const count = options.length;
  const [hovered, setHovered] = useState<number | null>(highlightIndex ?? null);
  const active = highlightIndex !== undefined ? highlightIndex : hovered;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 3;
  const half = count > 0 ? Math.PI / count : 0;
  const labelRadius = (innerRadius + outerR) / 2;
  const slices = useMemo(
    () => options.map((_, index) => (count > 0 ? index * (TWO_PI / count) : 0)),
    [options, count],
  );

  if (!open || count === 0) return null;

  const commit = (): void => {
    if (active === null) {
      onClose?.();
      return;
    }
    const option = options[active];
    if (option !== undefined && option.disabled !== true) onSelect(option.id);
  };

  return (
    <div
      className={className}
      data-radial-menu
      style={{ position: "relative", width: size, height: size, userSelect: "none", ...style }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: "block", cursor: "pointer" }}
        onPointerMove={(event) => {
          if (highlightIndex !== undefined) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const px = ((event.clientX - rect.left) / rect.width) * size;
          const py = ((event.clientY - rect.top) / rect.height) * size;
          setHovered(radialIndexFromVector(px - cx, py - cy, count, { deadZone: innerRadius }));
        }}
        onClick={commit}
      >
        {slices.map((center, index) => {
          const option = options[index]!;
          const isActive = index === active;
          const color = option.color ?? accent;
          return (
            <path
              key={option.id}
              data-radial-option={option.id}
              data-highlighted={isActive}
              data-disabled={option.disabled === true}
              d={wedgePath(cx, cy, innerRadius, outerR, center, half * 0.92)}
              fill={isActive ? color : "rgba(17,22,30,0.82)"}
              fillOpacity={option.disabled === true ? 0.3 : isActive ? 0.9 : 0.82}
              stroke="rgba(148,163,184,0.35)"
              strokeWidth={1}
            />
          );
        })}
        <circle cx={cx} cy={cy} r={innerRadius - 6} fill="rgba(8,11,16,0.9)" stroke="rgba(148,163,184,0.3)" />
        {slices.map((_, index) => {
          const option = options[index]!;
          const at = radialSlicePosition(index, count, labelRadius);
          const isActive = index === active;
          return (
            <g key={option.id} transform={`translate(${cx + at.x} ${cy + at.y})`} style={{ pointerEvents: "none" }}>
              {option.icon !== undefined ? (
                <foreignObject x={-18} y={-24} width={36} height={30} style={{ overflow: "visible" }}>
                  <div style={{ display: "flex", justifyContent: "center", fontSize: 20 }}>{option.icon}</div>
                </foreignObject>
              ) : null}
              {option.label !== undefined ? (
                <text
                  y={option.icon !== undefined ? 16 : 4}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={isActive ? "#f8fafc" : "rgba(226,232,240,0.8)"}
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {option.label}
                </text>
              ) : null}
            </g>
          );
        })}
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize={12}
          fontWeight={700}
          fill="rgba(226,232,240,0.9)"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          style={{ pointerEvents: "none" }}
        >
          {active !== null && options[active] !== undefined ? options[active]!.label ?? "" : ""}
        </text>
      </svg>
    </div>
  );
}
