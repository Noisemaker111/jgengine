import type { ReactNode } from "react";

import { KeybindBadge } from "@/components/ui/keybind-badge";

export type AbilitySlotState = "ready" | "cooldown" | "noResource" | "locked";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const chamfer = (cut: number) =>
  `polygon(${cut}px 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, ${cut}px 100%, 0 calc(100% - ${cut}px), 0 ${cut}px)`;

const clampFraction = (value: number) =>
  Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));

function LockGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" aria-hidden>
      <rect x="5" y="10" width="14" height="10" rx="0" fill="var(--jg-text-dim)" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="var(--jg-text-dim)" strokeWidth={2} fill="none" />
    </svg>
  );
}

function ChargePips({ charges, chargesMax }: { charges: number; chargesMax: number }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[3px] flex justify-center gap-[3px]">
      {Array.from({ length: chargesMax }, (_, index) => (
        <span
          key={index}
          className="h-[5px] w-[5px] rotate-45"
          style={{
            background: index < charges ? "var(--jg-accent)" : "transparent",
            border: `1px solid ${index < charges ? "var(--jg-accent)" : "var(--jg-edge)"}`,
          }}
        />
      ))}
    </div>
  );
}

export function AbilitySlotButton({
  icon,
  keybind,
  size = 46,
  state = "ready",
  cooldownFraction = 0,
  cooldownSeconds,
  charges,
  chargesMax,
  justCast = false,
  onActivate,
  className,
}: {
  icon?: ReactNode;
  keybind?: string;
  size?: number;
  state?: AbilitySlotState;
  cooldownFraction?: number;
  cooldownSeconds?: number;
  charges?: number;
  chargesMax?: number;
  justCast?: boolean;
  onActivate?: () => void;
  className?: string;
}) {
  const clamped = clampFraction(cooldownFraction);
  const showPips = chargesMax !== undefined && chargesMax > 1 && charges !== undefined;
  return (
    <button
      type="button"
      className={`relative overflow-hidden p-0 ${state === "ready" ? "cursor-pointer" : "cursor-default"} ${className ?? ""}`}
      data-jg="ability-slot"
      data-state={state}
      onClick={onActivate}
      disabled={state === "locked"}
      style={{
        width: size,
        height: size,
        border: "1px solid var(--jg-edge-bright)",
        clipPath: chamfer(6),
        color: "var(--jg-text)",
        background:
          state === "locked"
            ? "var(--jg-surface-deep)"
            : "linear-gradient(180deg, var(--jg-surface) 0%, var(--jg-surface-deep) 100%)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 3px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.6)",
      }}
    >
      {justCast && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            border: "2px solid var(--jg-accent)",
            animation: "jg-flash 0.35s ease-out forwards",
          }}
        />
      )}
      {state === "locked" ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <LockGlyph />
        </span>
      ) : (
        <>
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center"
            style={{
              filter:
                state === "cooldown"
                  ? "brightness(0.45) saturate(0.6)"
                  : state === "noResource"
                    ? "grayscale(1) drop-shadow(0 0 3px var(--jg-danger))"
                    : "none",
            }}
          >
            {icon}
          </span>
          {state === "noResource" && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-25"
              style={{ background: "var(--jg-danger)" }}
            />
          )}
          {state === "cooldown" && (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background: `conic-gradient(rgba(0,0,0,0.75) ${clamped * 360}deg, transparent 0deg)`,
                }}
              />
              {cooldownSeconds !== undefined && (
                <span
                  className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono font-bold"
                  style={{
                    fontSize: size / 2.6,
                    color: "var(--jg-text)",
                    textShadow: HUD_TEXT_SHADOW,
                  }}
                >
                  {Math.ceil(cooldownSeconds)}
                </span>
              )}
            </>
          )}
          {showPips && <ChargePips charges={charges ?? 0} chargesMax={chargesMax ?? 0} />}
        </>
      )}
      {keybind !== undefined && (
        <span className="absolute -bottom-[3px] -right-[3px]">
          <KeybindBadge label={keybind} size="sm" />
        </span>
      )}
    </button>
  );
}
