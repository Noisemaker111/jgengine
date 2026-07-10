import { POWER_SWEET } from "../../config";
import { PALETTE } from "../../palette";
import { pachinkoStore } from "../../store";
import type { CatcherKind, PachinkoSnapshot } from "../../types";
import { BankSparkline } from "./BankSparkline";

const cardStyle: React.CSSProperties = {
  background: "linear-gradient(160deg, rgba(43,24,14,0.92), rgba(26,13,8,0.92))",
  border: `1px solid ${PALETTE.brassDark}`,
  boxShadow: "0 6px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,220,150,0.15)",
  color: PALETTE.backboard,
};

export function Title() {
  return (
    <div className="rounded-xl px-3 py-2" style={cardStyle}>
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-black tracking-[0.28em]" style={{ color: PALETTE.gate }}>
          PACHINKO
        </span>
        <span className="text-[15px] font-bold" style={{ color: PALETTE.frameLight }}>
          パチンコ
        </span>
      </div>
      <div className="text-[9px] tracking-wide" style={{ color: PALETTE.brassLight, opacity: 0.85 }}>
        Shōwa Parlor
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-widest opacity-70">{label}</span>
      <span className="text-[15px] font-bold tabular-nums" style={{ color: accent }}>
        {value}
      </span>
    </div>
  );
}

export function StatReadout({ snap }: { snap: PachinkoSnapshot }) {
  const dots = Array.from({ length: snap.feverTarget }, (_, i) => i < snap.gateHits);
  return (
    <div className="rounded-xl px-3 py-2.5" style={cardStyle}>
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-5 w-5 rounded-full"
          style={{ background: `radial-gradient(circle at 35% 30%, ${PALETTE.steelLight}, ${PALETTE.steelDark})` }}
        />
        <div className="flex flex-col leading-none">
          <span className="text-[9px] uppercase tracking-widest opacity-70">Ball Bank</span>
          <span className="text-[26px] font-black tabular-nums leading-none" style={{ color: PALETTE.gate }}>
            {snap.bank}
          </span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
        <Stat label="In Flight" value={String(snap.ballsInFlight)} accent={PALETTE.backboard} />
        <Stat label="Launched" value={String(snap.launched)} accent={PALETTE.backboard} />
        <Stat label="Best Bank" value={snap.bestBank === null ? "—" : String(snap.bestBank)} accent={PALETTE.brassLight} />
        <Stat label="Best Fever" value={snap.bestFever === null ? "—" : String(snap.bestFever)} accent={PALETTE.feverB} />
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[9px] uppercase tracking-widest opacity-70">Gate</span>
        {dots.map((on, i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: on ? PALETTE.gate : "rgba(255,255,255,0.14)", boxShadow: on ? `0 0 6px ${PALETTE.gateGlow}` : "none" }}
          />
        ))}
        <span className="ml-auto text-[9px] opacity-70">Fevers {snap.feverCount}</span>
      </div>
    </div>
  );
}

const KIND_COLOR: Record<CatcherKind, string> = {
  gutter: "rgba(255,255,255,0.28)",
  pocket: PALETTE.pocket3,
  gate: PALETTE.gate,
};

export function WinsFeed({ snap }: { snap: PachinkoSnapshot }) {
  return (
    <div className="w-40 rounded-xl px-3 py-2.5" style={cardStyle}>
      <div className="mb-1 text-[9px] uppercase tracking-widest opacity-70">Bank History</div>
      <BankSparkline data={snap.bankHistory} />
      <div className="mt-2 mb-1 text-[9px] uppercase tracking-widest opacity-70">Recent Drops</div>
      <div className="flex flex-col gap-1">
        {snap.wins.length === 0 && <span className="text-[10px] opacity-50">No drops yet</span>}
        {snap.wins.slice(0, 6).map((w) => (
          <div key={w.seq} className="flex items-center gap-2 text-[11px]">
            <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLOR[w.kind] }} />
            <span className="capitalize opacity-80">{w.kind === "gate" ? "GATE" : w.kind}</span>
            <span
              className="ml-auto font-bold tabular-nums"
              style={{ color: w.amount === 0 ? "rgba(255,255,255,0.35)" : w.fever ? PALETTE.feverB : PALETTE.brassLight }}
            >
              {w.amount === 0 ? "—" : `+${w.amount}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function hold(down: boolean) {
  pachinkoStore.setPointerHeld(down);
}

export function PowerControls({ snap }: { snap: PachinkoSnapshot }) {
  const sweetLeft = (POWER_SWEET - 0.06) * 100;
  const sweetWidth = 0.12 * 100;
  return (
    <div className="flex flex-col items-stretch gap-2 rounded-2xl px-4 py-3" style={{ ...cardStyle, minWidth: 300 }}>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-widest opacity-70">
            <span>Power</span>
            <span className="tabular-nums">{Math.round(snap.power * 100)}%</span>
          </div>
          <div className="relative h-4 w-full overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.45)", border: `1px solid ${PALETTE.brassDark}` }}>
            <div className="absolute top-0 bottom-0" style={{ left: `${sweetLeft}%`, width: `${sweetWidth}%`, background: "rgba(255,207,92,0.25)", borderLeft: `1px solid ${PALETTE.gate}`, borderRight: `1px solid ${PALETTE.gate}` }} />
            <div
              className="absolute top-0 bottom-0 left-0 rounded-full"
              style={{ width: `${snap.power * 100}%`, background: `linear-gradient(90deg, ${PALETTE.pocket3}, ${PALETTE.brassLight}, ${PALETTE.frameLight})` }}
            />
            <div className="absolute top-1/2 -translate-y-1/2 text-[7px] font-bold" style={{ left: `${POWER_SWEET * 100}%`, transform: "translate(-50%,-50%)", color: PALETTE.ink }}>
              GATE
            </div>
          </div>
        </div>
        <button
          type="button"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            hold(true);
          }}
          onPointerUp={() => hold(false)}
          onPointerCancel={() => hold(false)}
          onPointerLeave={() => hold(false)}
          className="select-none rounded-xl px-5 py-3 text-sm font-black tracking-wider transition active:scale-95"
          style={{
            background: snap.charging
              ? `linear-gradient(160deg, ${PALETTE.frameLight}, ${PALETTE.frame})`
              : `linear-gradient(160deg, ${PALETTE.frame}, ${PALETTE.frameDark})`,
            border: `1px solid ${PALETTE.bulb}`,
            color: PALETTE.bulb,
            boxShadow: snap.charging ? `0 0 18px ${PALETTE.gateGlow}` : "0 4px 10px rgba(0,0,0,0.4)",
          }}
        >
          {snap.charging ? "RELEASE" : "HOLD"}
          <div className="text-[8px] font-normal tracking-widest opacity-80">LAUNCH · SPACE</div>
        </button>
        <button
          type="button"
          onClick={() => pachinkoStore.toggleAutoFire()}
          className="select-none rounded-xl px-3 py-3 text-[11px] font-bold tracking-wide transition active:scale-95"
          style={{
            background: snap.autoFire ? `linear-gradient(160deg, ${PALETTE.pocket3}, #5f7f3f)` : "rgba(0,0,0,0.35)",
            border: `1px solid ${snap.autoFire ? PALETTE.bulb : PALETTE.brassDark}`,
            color: snap.autoFire ? "#10240a" : PALETTE.backboard,
          }}
        >
          AUTO
          <div className="text-[8px] font-normal tracking-widest opacity-80">{snap.autoFire ? "ON · F" : "OFF · F"}</div>
        </button>
      </div>
      <div className="text-center text-[8px] tracking-[0.24em]" style={{ color: PALETTE.brassLight, opacity: 0.7 }}>
        TRADITIONAL JAPANESE PACHINKO
      </div>
    </div>
  );
}
