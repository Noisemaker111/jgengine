import { START_BANK } from "../../config";
import { PALETTE } from "../../palette";
import { pachinkoStore } from "../../store";
import type { PachinkoSnapshot } from "../../types";

export function FeverBanner({ snap }: { snap: PachinkoSnapshot }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[14%] z-40 flex justify-center">
      <div
        className="animate-pulse rounded-2xl px-8 py-3 text-center"
        style={{
          background: `linear-gradient(120deg, ${PALETTE.feverA}, ${PALETTE.frame}, ${PALETTE.feverB})`,
          border: `2px solid ${PALETTE.bulb}`,
          boxShadow: `0 0 40px ${PALETTE.feverA}`,
        }}
      >
        <div className="text-[34px] font-black leading-none tracking-widest" style={{ color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
          FEVER!
        </div>
        <div className="mt-1 text-[11px] font-bold tracking-[0.22em]" style={{ color: PALETTE.bulb }}>
          ALL PAY DOUBLE · GATE 25
        </div>
        <div className="mt-1 text-[13px] font-black tabular-nums" style={{ color: "#fff" }}>
          {Math.ceil(snap.feverTimer)}s
        </div>
      </div>
    </div>
  );
}

export function BrokeScreen({ snap }: { snap: PachinkoSnapshot }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm" style={{ background: "rgba(20,10,6,0.72)" }}>
      <div
        className="flex w-[80%] max-w-sm flex-col items-center gap-4 rounded-2xl px-8 py-8 text-center"
        style={{ background: "linear-gradient(160deg, #2b180e, #170b06)", border: `1px solid ${PALETTE.brass}`, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}
      >
        <div className="text-[13px] font-bold uppercase tracking-[0.3em]" style={{ color: PALETTE.frameLight }}>
          Out of Balls
        </div>
        <div className="text-[46px] leading-none">🎴</div>
        <div className="flex gap-6 text-center">
          <div>
            <div className="text-[9px] uppercase tracking-widest opacity-60" style={{ color: PALETTE.backboard }}>
              Best Bank
            </div>
            <div className="text-[20px] font-black tabular-nums" style={{ color: PALETTE.gate }}>
              {snap.bestBank ?? 0}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest opacity-60" style={{ color: PALETTE.backboard }}>
              Best Fever
            </div>
            <div className="text-[20px] font-black tabular-nums" style={{ color: PALETTE.feverB }}>
              {snap.bestFever ?? 0}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => pachinkoStore.rebuy()}
          className="mt-1 select-none rounded-xl px-8 py-3 text-sm font-black tracking-wider transition active:scale-95"
          style={{ background: `linear-gradient(160deg, ${PALETTE.frameLight}, ${PALETTE.frame})`, border: `1px solid ${PALETTE.bulb}`, color: PALETTE.bulb }}
        >
          REBUY +{START_BANK}
          <div className="text-[8px] font-normal tracking-widest opacity-80">PRESS R</div>
        </button>
      </div>
    </div>
  );
}
