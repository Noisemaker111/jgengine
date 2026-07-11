import { PALETTE } from "../../palette";
import { pinballStore } from "../../store";
import type { PinballSnapshot } from "../../types";
import { ScoreDisplay } from "./backglass";

const MSG_COLOR: Record<string, string> = {
  special: PALETTE.yellow,
  drop: PALETTE.tealLight,
  rollover: PALETTE.lampOn,
  bumper: PALETTE.orangeLight,
  sling: PALETTE.orange,
  bonus: PALETTE.brassLight,
  save: PALETTE.tealLight,
  tilt: PALETTE.red,
};

export function MessageBanner({ snap }: { snap: PinballSnapshot }) {
  if (snap.message === "" || snap.phase === "gameover") return null;
  const color = MSG_COLOR[snap.messageKind] ?? PALETTE.yellow;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[8%] z-30 flex justify-center">
      <div
        className="rounded-full px-6 py-1.5 text-center"
        style={{
          background: "rgba(21,13,9,0.82)",
          border: `2px solid ${color}`,
          boxShadow: `0 0 26px ${color}`,
        }}
      >
        <span className="text-[18px] font-black tracking-[0.16em]" style={{ color, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
          {snap.message}
        </span>
      </div>
    </div>
  );
}

export function SaverBadge({ snap }: { snap: PinballSnapshot }) {
  if (!snap.saverActive) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[16%] z-30 flex justify-center">
      <div
        className="flex items-center gap-2 rounded-full px-4 py-1"
        style={{ background: "rgba(21,13,9,0.8)", border: `1px solid ${PALETTE.tealLight}` }}
      >
        <span className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: PALETTE.tealLight, boxShadow: `0 0 8px ${PALETTE.tealLight}` }} />
        <span className="text-[10px] font-bold tracking-[0.22em]" style={{ color: PALETTE.tealLight }}>
          BALL SAVER {Math.ceil(snap.saverTimer)}
        </span>
      </div>
    </div>
  );
}

export function TiltBanner({ snap }: { snap: PinballSnapshot }) {
  if (!snap.tilted || snap.phase === "gameover") return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <div
        className="animate-pulse rounded-2xl px-10 py-4 text-center"
        style={{ background: "rgba(70,10,6,0.55)", border: `3px solid ${PALETTE.red}`, boxShadow: `0 0 50px ${PALETTE.red}` }}
      >
        <div className="text-[46px] font-black leading-none tracking-[0.2em]" style={{ color: "#fff", textShadow: `0 0 16px ${PALETTE.red}` }}>
          TILT
        </div>
        <div className="mt-1 text-[10px] font-bold tracking-[0.24em]" style={{ color: PALETTE.orangeLight }}>
          FLIPPERS DEAD · WAIT FOR DRAIN
        </div>
      </div>
    </div>
  );
}

export function PlungePrompt({ snap }: { snap: PinballSnapshot }) {
  if (snap.phase !== "ready") return null;
  return (
    <div className="pointer-events-none absolute bottom-[4%] right-[6%] z-20 flex flex-col items-center">
      <span className="text-[9px] font-bold tracking-[0.2em]" style={{ color: PALETTE.orangeLight }}>
        {snap.charging ? "RELEASE!" : "HOLD ↓"}
      </span>
      <span className="text-[8px] tracking-widest" style={{ color: PALETTE.brassLight, opacity: 0.8 }}>
        {snap.charging ? `${Math.round(snap.plungerCharge * 100)}%` : "PLUNGE"}
      </span>
    </div>
  );
}

function BestStat({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[8px] uppercase tracking-[0.22em]" style={{ color: "rgba(246,237,214,0.55)" }}>
        {label}
      </span>
      <span className="text-[20px] font-black tabular-nums leading-none" style={{ color }}>
        {value === null ? "—" : value.toLocaleString()}
      </span>
    </div>
  );
}

export function GameOverScreen({ snap }: { snap: PinballSnapshot }) {
  if (snap.phase !== "gameover") return null;
  const newRecord = snap.bestScore !== null && snap.score >= snap.bestScore;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm" style={{ background: "rgba(15,9,6,0.74)" }}>
      <div
        className="flex w-[84%] max-w-sm flex-col items-center gap-4 rounded-2xl px-8 py-7 text-center"
        style={{ background: `linear-gradient(160deg, ${PALETTE.cabinetLight}, ${PALETTE.cabinetDark})`, border: `1px solid ${PALETTE.brass}`, boxShadow: "0 22px 60px rgba(0,0,0,0.6)" }}
      >
        <div className="text-[12px] font-black uppercase tracking-[0.34em]" style={{ color: PALETTE.orangeLight }}>
          Game Over
        </div>
        <ScoreDisplay score={snap.score} digits={7} size={17} />
        {newRecord && (
          <div className="rounded-full px-4 py-1 text-[10px] font-black tracking-[0.2em]" style={{ background: PALETTE.yellow, color: "#3a1c08" }}>
            NEW HIGH SCORE!
          </div>
        )}
        <div className="flex gap-8">
          <BestStat label="Best Score" value={snap.bestScore} color={PALETTE.orangeLight} />
          <BestStat label="Best Ball" value={snap.bestBall} color={PALETTE.tealLight} />
        </div>
        <button
          type="button"
          onClick={() => pinballStore.newGame()}
          className="mt-1 select-none rounded-xl px-8 py-3 text-sm font-black tracking-[0.14em] transition active:scale-95"
          style={{ background: `linear-gradient(160deg, ${PALETTE.orangeLight}, ${PALETTE.orangeDark})`, border: `1px solid ${PALETTE.bulb}`, color: "#241009" }}
        >
          PLAY AGAIN
          <div className="text-[8px] font-normal tracking-[0.24em] opacity-80">PRESS N</div>
        </button>
      </div>
    </div>
  );
}
