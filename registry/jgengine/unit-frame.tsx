// DEPRECATED (#1033): a portrait + a bundled vitals array is the combo anti-pattern this retires.
// Compose your own frame from a portrait plus the atomic `@jgengine/react/bars` you need.
import type { ReactNode } from "react";

import { VitalBar, type VitalTone, type VitalValue } from "@/components/ui/vital-bar";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const chamfer = (cut: number) =>
  `polygon(${cut}px 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, ${cut}px 100%, 0 calc(100% - ${cut}px), 0 ${cut}px)`;

function DefaultPortrait() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="var(--jg-text-dim)" aria-hidden>
      <circle cx="12" cy="8.4" r="4.1" />
      <path d="M4 21c0-4.4 3.6-7.2 8-7.2s8 2.8 8 7.2v1H4z" />
    </svg>
  );
}

function LevelRosette({ level }: { level: number }) {
  return (
    <span
      data-jg="level-rosette"
      className="absolute flex items-center justify-center"
      style={{
        bottom: -7,
        left: -7,
        width: 22,
        height: 22,
        transform: "rotate(45deg)",
        background: "linear-gradient(135deg, var(--jg-accent-deep) 0%, var(--jg-surface-deep) 100%)",
        border: "1px solid var(--jg-accent)",
        boxShadow: "0 0 8px var(--jg-accent-glow)",
      }}
    >
      <span
        className="font-mono text-[10px] font-bold"
        style={{ transform: "rotate(-45deg)", color: "var(--jg-accent)" }}
      >
        {level}
      </span>
    </span>
  );
}

export interface UnitVital {
  tone: VitalTone;
  value: VitalValue;
}

export function UnitFrame({
  name,
  level,
  vitals,
  portrait,
  reverse = false,
  nameColor,
  width = 260,
  className,
  children,
}: {
  name: string;
  level?: number;
  vitals: readonly UnitVital[];
  portrait?: ReactNode;
  reverse?: boolean;
  nameColor?: string;
  width?: number;
  className?: string;
  children?: ReactNode;
}) {
  const portraitSize = 52;
  return (
    <div
      className={`flex items-start gap-2 ${reverse ? "flex-row-reverse" : "flex-row"} ${className ?? ""}`}
      data-jg="unit-frame"
      style={{ width }}
    >
      <div className="relative flex-shrink-0">
        <div
          className="p-[5px]"
          style={{
            width: portraitSize,
            height: portraitSize,
            clipPath: chamfer(6),
            background: "linear-gradient(180deg, var(--jg-surface) 0%, var(--jg-surface-deep) 100%)",
            border: "1px solid var(--jg-edge-bright)",
            boxShadow: "inset 0 0 12px rgba(0,0,0,0.7)",
          }}
        >
          {portrait ?? <DefaultPortrait />}
        </div>
        {level !== undefined && <LevelRosette level={level} />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span
          className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold tracking-[0.08em]"
          style={{
            color: nameColor ?? "var(--jg-text)",
            textShadow: HUD_TEXT_SHADOW,
            textAlign: reverse ? "right" : "left",
            fontFamily: "var(--jg-font-display)",
          }}
        >
          {name}
        </span>
        {vitals.map((vital, index) => (
          <VitalBar
            key={`${vital.tone}-${index}`}
            value={vital.value}
            tone={vital.tone}
            width="100%"
            height={index === 0 ? 14 : 8}
            showNumbers={index === 0}
            lean={5}
          />
        ))}
        {children}
      </div>
    </div>
  );
}
