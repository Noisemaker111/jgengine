import { KeyHint } from "@jgengine/react";
import { PALETTE } from "../../palette";
import type { PinballSnapshot, ScoreEvent } from "../../types";

const card: React.CSSProperties = {
  background: `linear-gradient(160deg, rgba(42,28,20,0.94), rgba(21,13,9,0.94))`,
  border: `1px solid ${PALETTE.brassDark}`,
  boxShadow: "0 6px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,220,150,0.12)",
  color: PALETTE.cream,
};

export function Title() {
  return (
    <div className="rounded-xl px-3 py-2" style={card}>
      <div className="text-[12px] font-black leading-none tracking-[0.14em]" style={{ color: PALETTE.orangeLight }}>
        SOLID STATE
      </div>
      <div className="text-[15px] font-black leading-tight tracking-[0.12em]" style={{ color: PALETTE.tealLight }}>
        PINBALL
      </div>
      <div className="mt-0.5 text-[8px] tracking-[0.24em]" style={{ color: PALETTE.brassLight, opacity: 0.8 }}>
        1978 · TABLE No.1
      </div>
    </div>
  );
}

function LitRow({ label, on, color }: { label: string; on: boolean; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] uppercase tracking-widest" style={{ color: on ? color : "rgba(246,237,214,0.4)" }}>
        {label}
      </span>
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: on ? color : PALETTE.lampOff, boxShadow: on ? `0 0 7px ${color}` : "none" }}
      />
    </div>
  );
}

export function StatusReadout({ snap }: { snap: PinballSnapshot }) {
  return (
    <div className="flex w-40 flex-col gap-2 rounded-xl px-3 py-2.5" style={card}>
      <div>
        <div className="mb-1 text-[8px] uppercase tracking-[0.24em]" style={{ color: "rgba(246,237,214,0.55)" }}>
          Top Lanes
        </div>
        <div className="flex items-center gap-2">
          {snap.rolloverLabels.map((letter, i) => {
            const on = snap.rolloverLit[i] ?? false;
            return (
              <div
                key={i}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[13px] font-black"
                style={{
                  background: on ? PALETTE.lampOn : "rgba(0,0,0,0.35)",
                  color: on ? "#3a1c08" : "rgba(246,237,214,0.4)",
                  boxShadow: on ? `0 0 10px ${PALETTE.orangeLight}` : `inset 0 0 4px rgba(0,0,0,0.6)`,
                  border: `1px solid ${on ? PALETTE.orangeLight : PALETTE.brassDark}`,
                }}
              >
                {letter}
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-1 text-[8px] uppercase tracking-[0.24em]" style={{ color: "rgba(246,237,214,0.55)" }}>
          Drop Bank
        </div>
        <div className="flex items-center gap-1.5">
          {snap.dropUp.map((up, i) => (
            <span
              key={i}
              className="h-4 flex-1 rounded-sm"
              style={{
                background: up ? PALETTE.tealLight : "rgba(0,0,0,0.4)",
                boxShadow: up ? `0 0 5px ${PALETTE.tealLight}` : "none",
                border: `1px solid ${up ? PALETTE.tealDark : "rgba(90,60,40,0.5)"}`,
              }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1 border-t pt-1.5" style={{ borderColor: "rgba(201,154,68,0.25)" }}>
        <LitRow label={`Spot 5000`} on={snap.spotBonusLit} color={PALETTE.orangeLight} />
        <LitRow label="Extra Ball" on={snap.extraBallLit} color={PALETTE.tealLight} />
      </div>
      <div className="flex items-end justify-between border-t pt-1.5" style={{ borderColor: "rgba(201,154,68,0.25)" }}>
        <div className="flex flex-col">
          <span className="text-[8px] uppercase tracking-widest" style={{ color: "rgba(246,237,214,0.55)" }}>
            Bonus
          </span>
          <span className="text-[16px] font-black tabular-nums leading-none" style={{ color: PALETTE.orangeLight }}>
            {snap.accBonus}
          </span>
        </div>
        <span className="text-[13px] font-black" style={{ color: PALETTE.tealLight }}>
          ×{snap.multiplier}
        </span>
      </div>
    </div>
  );
}

const KIND_COLOR: Record<ScoreEvent["kind"], string> = {
  bumper: PALETTE.orangeLight,
  sling: PALETTE.orange,
  rollover: PALETTE.lampOn,
  drop: PALETTE.tealLight,
  bonus: PALETTE.brassLight,
  special: PALETTE.yellow,
};

export function ScoreFeed({ snap }: { snap: PinballSnapshot }) {
  return (
    <div className="w-36 rounded-xl px-3 py-2.5" style={card}>
      <div className="mb-1 text-[8px] uppercase tracking-[0.24em]" style={{ color: "rgba(246,237,214,0.55)" }}>
        Scoring
      </div>
      <div className="flex flex-col gap-1">
        {snap.events.length === 0 && <span className="text-[10px] opacity-40">Plunge to start</span>}
        {snap.events.map((e) => (
          <div key={e.seq} className="flex items-center gap-1.5 text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_COLOR[e.kind] }} />
            <span className="opacity-80">{e.label}</span>
            <span className="ml-auto font-bold tabular-nums" style={{ color: KIND_COLOR[e.kind] }}>
              {e.amount > 0 ? `+${e.amount}` : "•"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ControlBar({ snap }: { snap: PinballSnapshot }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl px-4 py-2.5" style={{ ...card, minWidth: 300 }}>
      <KeyHint className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[9px] tracking-wide" style={{ color: PALETTE.cream }}>
        <Key label="Z / ←" hint="Left Flip" />
        <Key label="/ / →" hint="Right Flip" />
        <Key label="↓" hint={snap.onPlunger ? "Hold Plunge" : "Plunger"} active={snap.charging} />
        <Key label="Space" hint="Nudge" active={snap.tiltCount > 0 && !snap.tilted} danger={snap.tilted} />
        <Key label="N" hint="New Game" />
      </KeyHint>
      <div className="text-center text-[8px] leading-tight tracking-[0.12em]" style={{ color: PALETTE.brassLight, opacity: 0.75 }}>
        Homage to the golden age of solid-state pinball (Bally/Williams, late 1970s)
      </div>
    </div>
  );
}

function Key({ label, hint, active, danger }: { label: string; hint: string; active?: boolean; danger?: boolean }) {
  const color = danger ? PALETTE.red : active ? PALETTE.orangeLight : PALETTE.brassLight;
  return (
    <span className="flex items-center gap-1">
      <span
        className="rounded px-1.5 py-0.5 text-[8px] font-bold"
        style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${color}`, color }}
      >
        {label}
      </span>
      <span className="opacity-70">{hint}</span>
    </span>
  );
}
