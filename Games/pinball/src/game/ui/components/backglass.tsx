import { PALETTE } from "../../palette";
import type { PinballSnapshot } from "../../types";

const SEG: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgcde",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
};

const LINES: Record<string, [number, number, number, number]> = {
  a: [4, 3, 16, 3],
  b: [16, 4, 16, 17],
  c: [16, 19, 16, 32],
  d: [4, 33, 16, 33],
  e: [4, 19, 4, 32],
  f: [4, 4, 4, 17],
  g: [4, 18, 16, 18],
};

function Digit({ char, w }: { char: string; w: number }) {
  const on = SEG[char] ?? "";
  return (
    <svg viewBox="0 0 20 36" width={w} height={w * 1.8} style={{ display: "block" }}>
      {Object.entries(LINES).map(([seg, [x1, y1, x2, y2]]) => {
        const lit = on.includes(seg);
        return (
          <line
            key={seg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            strokeLinecap="round"
            strokeWidth={3}
            stroke={lit ? PALETTE.segOn : PALETTE.segOff}
            style={lit ? { filter: `drop-shadow(0 0 3px ${PALETTE.segOnGlow})` } : undefined}
          />
        );
      })}
    </svg>
  );
}

export function ScoreDisplay({ score, digits = 7, size = 15 }: { score: number; digits?: number; size?: number }) {
  const text = String(Math.min(score, 10 ** digits - 1)).padStart(digits, " ");
  return (
    <div className="flex items-center gap-[2px] rounded-md px-2 py-1.5" style={{ background: PALETTE.backglass, boxShadow: `inset 0 0 10px rgba(0,0,0,0.8), 0 0 0 2px ${PALETTE.backglassLip}` }}>
      {text.split("").map((ch, i) => (ch === " " ? <Digit key={i} char="" w={size} /> : <Digit key={i} char={ch} w={size} />))}
    </div>
  );
}

function Lamp({ on, label, color }: { on: boolean; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className="h-3 w-3 rounded-full"
        style={{ background: on ? color : PALETTE.lampOff, boxShadow: on ? `0 0 8px ${color}` : "inset 0 0 3px rgba(0,0,0,0.6)" }}
      />
      <span className="text-[8px] font-bold tracking-wide" style={{ color: on ? color : "rgba(246,237,214,0.35)" }}>
        {label}
      </span>
    </div>
  );
}

export function Backglass({ snap }: { snap: PinballSnapshot }) {
  const mults = ["1X", "2X", "3X", "5X"];
  const tiltDots = Array.from({ length: snap.tiltLimit }, (_, i) => i < snap.tiltCount);
  return (
    <div
      className="flex flex-col gap-2 rounded-xl px-3 py-2.5"
      style={{
        background: `linear-gradient(165deg, ${PALETTE.backglassLip}, ${PALETTE.backglass})`,
        border: `1px solid ${PALETTE.brassDark}`,
        boxShadow: `0 8px 26px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,220,150,0.15)`,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black tracking-[0.32em]" style={{ color: PALETTE.orangeLight }}>
          SOLID · STATE
        </span>
        <span className="text-[8px] tracking-[0.2em]" style={{ color: PALETTE.tealLight, opacity: 0.85 }}>
          ★ ★ ★
        </span>
      </div>
      <ScoreDisplay score={snap.score} />
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] uppercase tracking-widest" style={{ color: "rgba(246,237,214,0.6)" }}>
            Ball
          </span>
          {Array.from({ length: snap.ballsPerGame }, (_, i) => (
            <span
              key={i}
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background: i < snap.ballIndex ? PALETTE.lampOn : PALETTE.lampOff,
                boxShadow: i === snap.ballIndex - 1 && snap.phase !== "gameover" ? `0 0 7px ${PALETTE.lampOn}` : "none",
              }}
            />
          ))}
        </div>
        <div className="flex items-end gap-1.5">
          {mults.map((m, i) => (
            <Lamp key={m} on={i === snap.multiplierIndex} label={m} color={PALETTE.tealLight} />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between border-t px-0.5 pt-1.5" style={{ borderColor: "rgba(201,154,68,0.25)" }}>
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] uppercase tracking-widest" style={{ color: snap.tilted ? PALETTE.red : "rgba(246,237,214,0.6)" }}>
            {snap.tilted ? "Tilt" : "Tilt"}
          </span>
          {tiltDots.map((on, i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full"
              style={{ background: on ? PALETTE.red : PALETTE.lampOff, boxShadow: on ? `0 0 6px ${PALETTE.red}` : "none" }}
            />
          ))}
        </div>
        <span className="text-[8px] tracking-widest" style={{ color: PALETTE.orangeLight, opacity: 0.8 }}>
          × {snap.multiplier} BONUS
        </span>
      </div>
    </div>
  );
}
