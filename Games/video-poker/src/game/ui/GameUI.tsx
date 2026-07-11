import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useDisplayProfile } from "@jgengine/react/display";
import { useEngineState } from "@jgengine/react/engineStore";
import { useGame } from "@jgengine/react/hooks";
import { SettingsTrigger } from "@jgengine/react";

import { keybinds } from "../keybinds";
import { HAND_LABELS } from "../paytable";
import type { PayingCategory } from "../paytable";
import { poker } from "../poker";
import { CardFace } from "./components/CardFace";
import { Paytable } from "./components/Paytable";

const CABINET: CSSProperties = {
  background: "linear-gradient(160deg, #7c1a1a 0%, #4a0d0d 58%, #310808 100%)",
  boxShadow: "0 26px 70px rgba(0,0,0,0.72)",
};

const SCREEN: CSSProperties = {
  backgroundColor: "#06140d",
  boxShadow: "inset 0 0 70px rgba(28,138,74,0.32), inset 0 0 14px rgba(0,0,0,0.92)",
};

const SCANLINES: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(0deg, rgba(0,0,0,0.30) 0, rgba(0,0,0,0.30) 1px, transparent 1px, transparent 3px)",
};

const KEYFRAMES = `
@keyframes vpFlashKf { 0%,100%{ background-color: rgba(251,191,36,0.12);} 50%{ background-color: rgba(251,191,36,0.42);} }
.vp-flash{ animation: vpFlashKf 0.6s ease-in-out 4; }
@keyframes vpWinKf { 0%{ transform: scale(1);} 50%{ transform: scale(1.06);} 100%{ transform: scale(1);} }
.vp-win{ animation: vpWinKf 0.45s ease-in-out 3; }
`;

function KeyBadge({ label }: { label: string }) {
  return (
    <kbd className="rounded border border-amber-500/50 bg-black/40 px-1.5 py-0.5 font-mono text-[0.6rem] text-amber-200">
      {label}
    </kbd>
  );
}

function CabinetButton({
  label,
  onClick,
  disabled,
  variant,
  hint,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant: "primary" | "secondary" | "danger";
  hint?: string;
}) {
  const palette =
    variant === "primary"
      ? "from-amber-300 to-amber-600 text-red-950 border-amber-200"
      : variant === "danger"
        ? "from-red-400 to-red-700 text-white border-red-200"
        : "from-amber-500/30 to-amber-700/20 text-amber-100 border-amber-500/60";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "relative rounded-lg border bg-gradient-to-b px-4 py-2 font-black uppercase tracking-wider transition",
        "shadow-[0_4px_0_rgba(0,0,0,0.45)] active:translate-y-0.5 active:shadow-none",
        palette,
        variant === "primary" ? "text-base sm:text-lg" : "text-xs sm:text-sm",
        disabled ? "cursor-not-allowed opacity-40 saturate-50" : "cursor-pointer hover:brightness-110",
      ].join(" ")}
    >
      {label}
      {hint !== undefined ? <span className="ml-2 hidden font-mono text-[0.6rem] opacity-70 sm:inline">{hint}</span> : null}
    </button>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-md border border-amber-500/40 bg-black/45 px-3 py-1">
      <span className="text-[0.55rem] font-bold uppercase tracking-[0.2em] text-amber-300/80">{label}</span>
      <span className={`font-mono text-lg font-black tabular-nums ${accent ? "text-amber-200" : "text-[#8ef2a8]"}`}>
        {value}
      </span>
    </div>
  );
}

export function GameUI() {
  const state = useEngineState(poker);
  const { commands } = useGame();
  const { compact } = useDisplayProfile();
  const keyLabel = (action: string): string => actionLabel(keybinds, action) ?? "";

  const [shownWin, setShownWin] = useState(0);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (state.lastWin <= 0) {
      setShownWin(0);
      setFlash(false);
      return;
    }
    setFlash(true);
    const target = state.lastWin;
    const start = performance.now();
    const duration = 700;
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setShownWin(Math.round(target * progress));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    const stop = window.setTimeout(() => setFlash(false), 1500);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(stop);
    };
  }, [state.resultId, state.lastWin]);

  const inDraw = state.phase === "draw";
  const dealt = state.hand.length > 0;
  const winRow: PayingCategory | null =
    state.phase === "bet" && state.lastCategory !== null && state.lastCategory !== "nothing"
      ? state.lastCategory
      : null;

  const play = (index: number) => commands.run("toggleHold", { index });

  const bankLabel = state.records.peakBank === null ? "—" : String(state.records.peakBank);
  const winLabel = state.records.biggestWin === null ? "—" : String(state.records.biggestWin);

  const banner = (() => {
    if (inDraw) {
      return { text: "Hold cards, then DRAW", tone: "text-amber-200", win: false };
    }
    if (state.lastCategory !== null && state.lastCategory !== "nothing") {
      return { text: `${HAND_LABELS[state.lastCategory]}  +${shownWin}`, tone: "text-amber-300", win: true };
    }
    if (state.lastCategory === "nothing") {
      return { text: "No Pay — deal again", tone: "text-[#8ef2a8]/70", win: false };
    }
    return { text: "Place your bet, then DEAL", tone: "text-[#8ef2a8]/80", win: false };
  })();

  return (
    <div className="flex min-h-full w-full items-center justify-center bg-[#170505] p-2 font-sans text-stone-100 sm:p-4">
      <style>{KEYFRAMES}</style>
      <div
        className="w-full max-w-3xl rounded-2xl border-4 border-amber-600/80 p-3 ring-1 ring-amber-900/60 sm:p-5"
        style={CABINET}
      >
        <header className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h1
              className="text-xl font-black uppercase leading-none tracking-[0.18em] text-amber-300 drop-shadow-[0_2px_2px_rgba(0,0,0,0.6)] sm:text-3xl"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              Video Poker
            </h1>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.35em] text-amber-100/70 sm:text-xs">
              Jacks or Better · 9/6
            </p>
          </div>
          <div className="flex items-center gap-2 text-right">
            <Stat label="Best Bank" value={bankLabel} />
            <Stat label="Top Win" value={winLabel} accent />
            <SettingsTrigger className="flex h-9 w-9 items-center justify-center rounded-md border border-amber-500/40 bg-black/45 text-amber-200 transition hover:bg-amber-500/20" />
          </div>
        </header>

        <div className="mb-3">
          <Paytable bet={state.bet} winRow={winRow} compact={compact} />
        </div>

        <div className="relative overflow-hidden rounded-xl border-2 border-amber-700/50 p-3 sm:p-5" style={SCREEN}>
          <div className="pointer-events-none absolute inset-0 opacity-60" style={SCANLINES} />
          <div className="relative flex items-end justify-center gap-1.5 sm:gap-3">
            {[0, 1, 2, 3, 4].map((index) => (
              <CardFace
                key={index}
                card={state.hand[index]}
                held={state.held[index] ?? false}
                faceDown={!dealt}
                interactive={inDraw}
                compact={compact}
                onClick={() => play(index)}
              />
            ))}
          </div>
          <div
            className={[
              "relative mt-3 flex h-8 items-center justify-center rounded-md text-center font-black uppercase tracking-wider",
              banner.tone,
              banner.win && flash ? "vp-win text-lg sm:text-2xl" : "text-sm sm:text-lg",
            ].join(" ")}
          >
            {banner.text}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Stat label="Bank" value={String(state.bank)} accent />
            <Stat label="Bet" value={String(state.bet)} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {state.broke ? (
              <CabinetButton label="Rebuy 200" variant="danger" hint={keyLabel("rebuy")} onClick={() => commands.run("rebuy", {})} />
            ) : (
              <>
                <CabinetButton
                  label="Bet One"
                  variant="secondary"
                  hint={keyLabel("betOne")}
                  disabled={!state.canBet}
                  onClick={() => commands.run("betOne", {})}
                />
                <CabinetButton
                  label="Bet Max"
                  variant="secondary"
                  hint={keyLabel("betMax")}
                  disabled={!state.canBet}
                  onClick={() => commands.run("betMax", {})}
                />
                <CabinetButton
                  label={inDraw ? "Draw" : "Deal"}
                  variant="primary"
                  hint={keyLabel("dealDraw")}
                  disabled={inDraw ? false : !state.canDeal}
                  onClick={() => commands.run("dealDraw", {})}
                />
              </>
            )}
          </div>
        </div>

        <footer className="mt-4 flex flex-col gap-2 border-t border-amber-800/50 pt-2 text-amber-100/60 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[0.65rem] italic tracking-wide">Lineage: Draw Poker (SIRCOMA/IGT, 1979)</span>
          <span className="flex flex-wrap items-center gap-1 text-[0.6rem]">
            <KeyBadge label={keyLabel("dealDraw")} /> deal/draw
            <span className="mx-1 opacity-40">·</span>
            <KeyBadge label="1" />–<KeyBadge label="5" /> hold
          </span>
        </footer>
      </div>
    </div>
  );
}
