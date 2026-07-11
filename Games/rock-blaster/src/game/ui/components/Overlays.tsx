import type { CSSProperties, ReactNode } from "react";

import { blasterStore, type BlasterSnapshot } from "../../blaster/store";

const PANEL: CSSProperties = {
  background: "rgba(2, 6, 16, 0.82)",
  border: "1px solid rgba(150, 190, 255, 0.35)",
  boxShadow: "0 0 40px rgba(40, 90, 180, 0.35)",
  borderRadius: 14,
};

const TITLE: CSSProperties = {
  color: "#f4f8ff",
  textShadow: "0 0 18px rgba(150, 210, 255, 0.7)",
  letterSpacing: "0.36em",
};

function Backdrop({ children, dim }: { children: ReactNode; dim: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center p-4"
      style={{ background: `rgba(0, 0, 0, ${dim})` }}
    >
      {children}
    </div>
  );
}

function PrimaryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pointer-events-auto mt-5 cursor-pointer px-6 py-2 font-mono text-sm font-bold uppercase tracking-[0.28em]"
      style={{
        color: "#02121f",
        background: "#bfe0ff",
        borderRadius: 999,
        boxShadow: "0 0 22px rgba(150, 210, 255, 0.55)",
      }}
    >
      {label}
    </button>
  );
}

export function StartOverlay({ snap }: { snap: BlasterSnapshot }) {
  return (
    <Backdrop dim={0.55}>
      <div className="flex flex-col items-center px-10 py-8 text-center font-mono" style={PANEL}>
        <div className="text-4xl font-black uppercase" style={TITLE}>
          Rock Blaster
        </div>
        <div className="mt-2 text-[11px] uppercase tracking-[0.3em]" style={{ color: "#7fb0ff" }}>
          Inertial vector combat
        </div>
        <div className="mt-5 text-xs leading-relaxed" style={{ color: "#a9c4ef" }}>
          Rotate ← → / A D · Thrust ↑ / W · Fire Space
          <br />
          Hyperspace Shift · Pause P/Esc
        </div>
        <div className="mt-4 text-sm uppercase tracking-[0.2em]" style={{ color: "#ffcf6a" }}>
          Hi-Score {snap.best.toLocaleString()}
        </div>
        <PrimaryButton label="Launch" onClick={() => blasterStore.confirm()} />
        <div className="mt-3 text-[10px] uppercase tracking-[0.24em]" style={{ color: "#6c86b8" }}>
          or press Fire / Enter
        </div>
      </div>
    </Backdrop>
  );
}

export function PauseOverlay() {
  return (
    <Backdrop dim={0.68}>
      <div className="flex flex-col items-center px-12 py-8 text-center font-mono" style={PANEL}>
        <div className="text-3xl font-black uppercase" style={TITLE}>
          Paused
        </div>
        <PrimaryButton label="Resume" onClick={() => blasterStore.confirm()} />
        <div className="mt-3 text-[10px] uppercase tracking-[0.24em]" style={{ color: "#6c86b8" }}>
          P / Esc to resume · R to restart
        </div>
      </div>
    </Backdrop>
  );
}

export function GameOverOverlay({ snap }: { snap: BlasterSnapshot }) {
  return (
    <Backdrop dim={0.72}>
      <div className="flex flex-col items-center px-12 py-8 text-center font-mono" style={PANEL}>
        <div className="text-3xl font-black uppercase" style={{ ...TITLE, color: "#ff9d7a" }}>
          Game Over
        </div>
        <div className="mt-5 text-5xl font-black leading-none" style={{ color: "#f4f8ff" }}>
          {snap.score.toLocaleString()}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.3em]" style={{ color: "#7fb0ff" }}>
          Final Score
        </div>
        {snap.newBest ? (
          <div className="mt-3 text-sm font-bold uppercase tracking-[0.3em]" style={{ color: "#ffcf6a" }}>
            ★ New Best ★
          </div>
        ) : (
          <div className="mt-3 text-sm uppercase tracking-[0.2em]" style={{ color: "#ffcf6a" }}>
            Hi-Score {snap.best.toLocaleString()}
          </div>
        )}
        <PrimaryButton label="Play Again" onClick={() => blasterStore.restart()} />
        <div className="mt-3 text-[10px] uppercase tracking-[0.24em]" style={{ color: "#6c86b8" }}>
          or press Fire / Enter
        </div>
      </div>
    </Backdrop>
  );
}
