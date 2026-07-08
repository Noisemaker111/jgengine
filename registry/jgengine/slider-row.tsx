import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const slantBar = (lean: number) =>
  `polygon(${lean}px 0, 100% 0, calc(100% - ${lean}px) 100%, 0 100%)`;

const clampFraction = (value: number) => (Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value)));

function HudLabel({ children }: { children: ReactNode }) {
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-[0.24em]"
      style={{ fontFamily: "var(--jg-font-display)", color: "var(--jg-text-dim)", textShadow: HUD_TEXT_SHADOW }}
    >
      {children}
    </span>
  );
}

export function SliderRow({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  format = (input: number) => `${Math.round(clampFraction((input - min) / (max - min)) * 100)}%`,
  width,
  className,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  format?: (value: number) => string;
  width?: number | string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fraction = clampFraction((value - min) / (max - min));

  function updateFromClientX(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return;
    const raw = clampFraction((clientX - rect.left) / rect.width);
    const rawValue = min + raw * (max - min);
    const stepped = Math.round(rawValue / step) * step;
    onChange?.(Math.min(max, Math.max(min, stepped)));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromClientX(event.clientX);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.buttons !== 1) return;
    updateFromClientX(event.clientX);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`} data-jg="slider-row" style={{ width }}>
      <div className="flex items-baseline justify-between">
        <HudLabel>{label}</HudLabel>
        <span className="font-mono text-[11px] font-bold" style={{ color: "var(--jg-text)" }}>
          {format(value)}
        </span>
      </div>
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative cursor-pointer touch-none"
        style={{
          height: 6,
          clipPath: slantBar(3),
          background: "var(--jg-surface-deep)",
          boxShadow: "inset 0 1px 3px rgba(0,0,0,0.85)",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            width: `${fraction * 100}%`,
            background: "linear-gradient(90deg, var(--jg-accent-deep) 0%, var(--jg-accent) 100%)",
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-2.5 w-2.5"
          style={{
            left: `calc(${fraction * 100}% - 5px)`,
            transform: "translateY(-50%) rotate(45deg)",
            background: "var(--jg-accent)",
            boxShadow: "0 0 8px var(--jg-accent-glow)",
          }}
        />
      </div>
    </div>
  );
}
