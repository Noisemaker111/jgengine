import { useEffect, useState } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";
import { withSeedParam } from "@jgengine/core/random/seedLink";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { SettingsTrigger } from "@jgengine/react";

import { keybinds } from "../keybinds";
import { type EchoMode } from "../echo/catalog";
import { BEST_LENGTH_FIELD, records } from "../echo/records";
import { getRun } from "../echo/run";
import { GameOverPanel } from "./components/GameOverPanel";
import { PadConsole } from "./components/PadConsole";
import { StatChip } from "./components/StatChip";

const GAME_CSS = `
.el-shell { background: radial-gradient(120% 100% at 50% 18%, #2b1e12 0%, #170f08 52%, #0b0704 100%); }
.el-console { position: relative; border-radius: 9999px; padding: 0; background: radial-gradient(120% 120% at 50% 35%, #241708 0%, #120b05 80%); box-shadow: 0 0 0 10px #1d130a, 0 0 0 12px rgba(217, 164, 65, 0.22), 0 24px 60px rgba(0, 0, 0, 0.65); }
.el-pad { position: absolute; width: 47.5%; height: 47.5%; border: none; padding: 0; cursor: default; transition: filter 110ms ease, box-shadow 140ms ease, transform 70ms ease; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.el-console[data-turn="true"] .el-pad { cursor: pointer; }
.el-console[data-turn="true"] .el-pad:active { transform: scale(0.965); }
.el-pad[data-lit="true"] { filter: brightness(1.35) saturate(1.2); z-index: 2; }
.el-pad-key { position: absolute; display: flex; align-items: center; justify-content: center; width: 1.35rem; height: 1.35rem; border-radius: 9999px; background: rgba(10, 6, 3, 0.55); color: rgba(255, 248, 230, 0.85); font-size: 11px; font-weight: 800; pointer-events: none; box-shadow: inset 0 0 0 1px rgba(255, 248, 230, 0.25); }
.el-hub { position: absolute; inset: 30.5%; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 9999px; background: radial-gradient(110% 110% at 50% 30%, #2e2113 0%, #191007 78%); box-shadow: 0 0 0 7px #0d0803, 0 0 26px rgba(0, 0, 0, 0.85), inset 0 3px 10px rgba(255, 240, 200, 0.08); z-index: 3; }
.el-console[data-over="true"] .el-hub { animation: el-alarm 620ms ease-in-out 2; }
.el-start { border: none; cursor: pointer; border-radius: 9999px; width: 72%; height: 72%; background: radial-gradient(120% 120% at 50% 32%, #f2c96a 0%, #d9a441 70%); color: #1a1108; font-weight: 900; letter-spacing: 0.22em; font-size: 14px; box-shadow: 0 6px 18px rgba(217, 164, 65, 0.35), inset 0 2px 6px rgba(255, 255, 255, 0.5); transition: transform 80ms ease, box-shadow 120ms ease; }
.el-start:hover { box-shadow: 0 8px 24px rgba(217, 164, 65, 0.5), inset 0 2px 6px rgba(255, 255, 255, 0.5); }
.el-start:active { transform: scale(0.96); }
@keyframes el-pulse-anim { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.el-pulse { animation: el-pulse-anim 900ms ease-in-out infinite; }
@keyframes el-alarm { 0%, 100% { box-shadow: 0 0 0 7px #0d0803, 0 0 26px rgba(0, 0, 0, 0.85); } 50% { box-shadow: 0 0 0 7px #0d0803, 0 0 42px rgba(255, 70, 80, 0.75); } }
@keyframes el-pop-anim { from { opacity: 0; transform: translateY(14px) scale(0.95); } to { opacity: 1; transform: none; } }
.el-pop { animation: el-pop-anim 320ms cubic-bezier(0.2, 0.9, 0.3, 1.1) 1 both; }
@keyframes el-fade-anim { from { opacity: 0; } to { opacity: 1; } }
.el-fade { animation: el-fade-anim 260ms ease-out 1 both; }
`;

const MODES: readonly { id: EchoMode; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "practice", label: "Practice" },
];

function KeyBadge({ action }: { action: string }) {
  const label = actionLabel(keybinds, action);
  if (label === null) return null;
  return (
    <span className="ml-1 rounded border border-white/15 bg-black/30 px-1 text-[10px] font-bold leading-tight text-[#e8cf9a]">
      {label}
    </span>
  );
}

export function GameUI() {
  const ctx = useGameContext();
  const layout = useHudLayout({ storageKey: "echo-lights:hud" });
  const run = useGameStore((current) => getRun(current));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  if (run === null) return null;

  const best = records.bestOf(BEST_LENGTH_FIELD);
  const runCommand = (name: string, input: Record<string, unknown> = {}) => {
    ctx.game.commands.run(name, input);
  };
  const copyChallenge = () => {
    const link = withSeedParam(window.location.href, run.seed);
    void navigator.clipboard
      ?.writeText(link)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <div className="el-shell absolute inset-0 select-none text-[#f3dfae]">
      <style>{GAME_CSS}</style>
      <HudCanvas layout={layout} className="text-[#f3dfae]">
        <HudPanel id="status" anchor="top" compact="keep">
          <div className="flex flex-col items-center gap-1.5">
            <h1 className="text-lg font-black uppercase tracking-[0.34em] text-[#e8cf9a] sm:text-xl">
              Echo Lights
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <StatChip label="Round">{run.phase === "idle" ? "—" : run.sequence.length}</StatChip>
              <StatChip label="Best">{best === null ? "—" : best}</StatChip>
              <StatChip label="Mode">
                {run.mode === "classic" ? "Classic" : "Practice"}
                {run.daily ? " · Daily" : ""}
              </StatChip>
            </div>
          </div>
        </HudPanel>

        <HudPanel id="console" anchor="center" compact="keep">
          <PadConsole
            run={run}
            onPad={(pad) => runCommand(["padGreen", "padRed", "padYellow", "padBlue"][pad] ?? "padGreen")}
            onStart={() => runCommand("newGame", { mode: run.mode, seed: run.seed, daily: run.daily })}
          />
        </HudPanel>

        <HudPanel id="controls" anchor="bottom" order={0} compact="chip" chip="Controls">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <div className="flex overflow-hidden rounded-full border border-[#d9a441]/40">
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => runCommand("setMode", { mode: mode.id })}
                  className={`cursor-pointer px-3 py-1.5 text-xs font-bold tracking-wider transition ${
                    run.mode === mode.id
                      ? "bg-[#d9a441] text-[#17100a]"
                      : "bg-transparent text-[#d9a441] hover:bg-[#d9a441]/15"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => runCommand("newGame", { mode: run.mode })}
              className="flex cursor-pointer items-center rounded-full bg-[#d9a441] px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-[#17100a] transition hover:bg-[#f2c96a]"
            >
              New game
              <KeyBadge action="newGame" />
            </button>
            <button
              type="button"
              onClick={() => runCommand("daily")}
              className="flex cursor-pointer items-center rounded-full border border-[#5fe38a]/40 px-3 py-1.5 text-xs font-bold text-[#8fe9ab] transition hover:bg-[#5fe38a]/10"
            >
              Daily
              <KeyBadge action="daily" />
            </button>
            <button
              type="button"
              onClick={copyChallenge}
              aria-label="Copy challenge link for this sequence"
              className="cursor-pointer rounded-full border border-[#d9a441]/40 px-3 py-1.5 text-xs font-semibold text-[#d9a441] transition hover:bg-[#d9a441]/15"
            >
              <span className="tabular-nums">{copied ? "Copied!" : `seed ${run.seed}`}</span>
            </button>
          </div>
        </HudPanel>

        <HudPanel id="credit" anchor="bottom" order={1} compact="keep" interactive={false}>
          <p className="rounded-full bg-black/45 px-3 py-1 text-center text-[10px] font-medium tracking-[0.08em] text-[#8a6f4d] ring-1 ring-white/5">
            Homage to Simon — Ralph Baer &amp; Howard Morrison (1978), after Atari&apos;s Touch Me
          </p>
        </HudPanel>
      </HudCanvas>

      {run.phase === "over" ? (
        <div className="el-fade absolute inset-0 z-20 flex items-center justify-center bg-[#080502]/75 backdrop-blur-[2px]">
          <GameOverPanel
            run={run}
            best={best}
            onPlayAgain={() => runCommand("newGame", { mode: "classic" })}
            onSameSequence={() => runCommand("newGame", { mode: "classic", seed: run.seed, daily: run.daily })}
            onPractice={() => runCommand("newGame", { mode: "practice", seed: run.seed })}
            onDaily={() => runCommand("daily")}
          />
        </div>
      ) : null}
    </div>
  );
}
