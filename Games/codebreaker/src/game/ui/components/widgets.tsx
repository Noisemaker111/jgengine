import type { ReactNode } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";

import { CODE_LENGTH, type Feedback } from "../../codebreaker";
import { keybinds } from "../../keybinds";
import { KEY_PLATE, PEGS, WELL_STYLE, keyPegStyle, pegStyle } from "../theme";

export function KeyHint({ action }: { action: string }) {
  const label = actionLabel(keybinds, action);
  if (label === null) return null;
  return (
    <kbd className="ml-1.5 rounded bg-black/40 px-1 text-[10px] font-bold leading-tight text-amber-100 ring-1 ring-amber-200/20">
      {label}
    </kbd>
  );
}

export function Btn({
  children,
  onClick,
  disabled,
  primary,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  active?: boolean;
}) {
  const base =
    "inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";
  const tone = primary
    ? "bg-emerald-500/90 text-emerald-950 shadow hover:bg-emerald-400"
    : active
      ? "bg-amber-400/90 text-amber-950 hover:bg-amber-300"
      : "bg-amber-100/10 text-amber-100 ring-1 ring-amber-200/15 hover:bg-amber-100/20";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${tone}`}>
      {children}
    </button>
  );
}

export function Toggle({ children, on, onClick }: { children: ReactNode; on: boolean; onClick: () => void }) {
  const cls = on
    ? "inline-flex items-center gap-1.5 rounded-lg bg-amber-400/90 px-3 py-1.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-300"
    : "inline-flex items-center gap-1.5 rounded-lg bg-amber-100/10 px-3 py-1.5 text-sm font-semibold text-amber-100 ring-1 ring-amber-200/15 transition hover:bg-amber-100/20";
  const dot = on ? "h-2 w-2 rounded-full bg-emerald-600" : "h-2 w-2 rounded-full bg-amber-100/30";
  return (
    <button type="button" onClick={onClick} className={cls}>
      <span className={dot} />
      {children}
    </button>
  );
}

export function Peg({ color, size }: { color: number | null; size: number }) {
  const def = color === null ? undefined : PEGS[color];
  if (def === undefined) {
    return (
      <span
        style={{ ...WELL_STYLE, width: size, height: size, borderRadius: "50%", display: "inline-block" }}
      />
    );
  }
  return (
    <span
      className="cb-pop inline-flex items-center justify-center"
      style={{
        ...pegStyle(def.color),
        width: size,
        height: size,
        borderRadius: "50%",
        fontSize: Math.round(size * 0.52),
        fontWeight: 800,
        color: "rgba(18,9,0,0.72)",
        textShadow: "0 1px 0 rgba(255,255,255,0.4)",
      }}
      title={def.name}
      aria-label={def.name}
    >
      {def.glyph}
    </span>
  );
}

export function ShieldPeg({ size }: { size: number }) {
  return (
    <span
      className="inline-flex items-center justify-center font-bold"
      style={{
        ...WELL_STYLE,
        width: size,
        height: size,
        borderRadius: "50%",
        fontSize: Math.round(size * 0.5),
        color: "rgba(255,220,170,0.4)",
      }}
      aria-label="hidden peg"
    >
      ?
    </span>
  );
}

export function KeyCluster({ feedback, size }: { feedback: Feedback; size: number }) {
  const cells: ("black" | "white" | "empty")[] = [];
  for (let i = 0; i < feedback.black; i += 1) cells.push("black");
  for (let i = 0; i < feedback.white; i += 1) cells.push("white");
  while (cells.length < CODE_LENGTH) cells.push("empty");
  const dot = Math.max(6, Math.round(size * 0.44));
  return (
    <span
      className="grid grid-cols-2 gap-[3px] rounded-md p-1"
      style={KEY_PLATE}
      aria-label={`${feedback.black} exact, ${feedback.white} misplaced`}
    >
      {cells.slice(0, CODE_LENGTH).map((kind, i) => (
        <span key={i} style={{ ...keyPegStyle(kind), width: dot, height: dot, borderRadius: "50%" }} />
      ))}
    </span>
  );
}
