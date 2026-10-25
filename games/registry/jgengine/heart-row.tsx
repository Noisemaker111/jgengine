import type { ReactNode } from "react";

const HEART_PATH =
  "M12 21.2C8.2 18.4 2.6 14 2.6 8.9 2.6 5.6 5 3.4 7.7 3.4c1.8 0 3.3 1 4.3 2.5 1-1.5 2.5-2.5 4.3-2.5 2.7 0 5.1 2.2 5.1 5.5 0 5.1-5.6 9.5-9.4 12.3z";

export function HeartRow({
  current,
  max,
  size = 20,
  icon,
  className,
}: {
  current: number;
  max: number;
  size?: number;
  icon?: (filled: boolean, index: number) => ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex gap-[3px] ${className ?? ""}`}
      data-jg="heart-row"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={current}
    >
      {Array.from({ length: max }, (_, index) => {
        const filled = index < current;
        if (icon !== undefined) return <span key={index}>{icon(filled, index)}</span>;
        return (
          <svg
            key={index}
            viewBox="0 0 24 24"
            width={size}
            height={size}
            style={{
              filter: filled
                ? "drop-shadow(0 0 4px color-mix(in srgb, var(--jg-danger) 67%, transparent)) drop-shadow(0 1px 1px rgba(0,0,0,0.8))"
                : "drop-shadow(0 1px 1px rgba(0,0,0,0.8))",
            }}
          >
            <path
              d={HEART_PATH}
              fill={filled ? "var(--jg-danger)" : "rgba(0,0,0,0.45)"}
              stroke={filled ? "#ffb3ad" : "var(--jg-edge)"}
              strokeWidth={filled ? 0.8 : 1.2}
            />
          </svg>
        );
      })}
    </div>
  );
}
