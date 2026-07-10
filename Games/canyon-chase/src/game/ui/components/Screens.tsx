import type { ReactNode } from "react";
import { useGame } from "@jgengine/react";
import { KeybindLegend } from "./PursuitHud";
import { TRUCK_SEEDS } from "../../run/truckSchedule";
import type { RunResult } from "../../run/runState";

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function PanelShell({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-auto flex w-full max-w-md flex-col gap-5 rounded-3xl border-2 border-[#ffc857]/50 bg-gradient-to-b from-[#241a2c] to-[#1b1220] p-8 text-center shadow-[0_40px_120px_rgba(0,0,0,0.7)]">
      {children}
    </div>
  );
}

export interface StartScreenProps {
  readonly selectedSeedId: string;
}

export function StartScreen({ selectedSeedId }: StartScreenProps) {
  const { commands } = useGame();
  return (
    <PanelShell>
      <div>
        <h1 className="text-3xl font-black uppercase tracking-[0.15em] text-[#ffc857]">Canyon Chase</h1>
        <p className="mt-2 text-sm text-[#e8d7c3]/85">
          The rock lies. The map doesn't. Chase the smuggler's rig to the border — trust the survey through every
          shadow wall, and don't get suckered by a mouth that only looks open.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[10px] uppercase tracking-[0.3em] text-[#e8d7c3]/60">Select Run</span>
        <div className="flex justify-center gap-2">
          {TRUCK_SEEDS.map((seed) => (
            <button
              key={seed.id}
              type="button"
              onClick={() => commands.run("selectSeed", { seedId: seed.id })}
              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                selectedSeedId === seed.id
                  ? "border-[#ffc857] bg-[#ffc857]/20 text-[#ffc857]"
                  : "border-[#e8d7c3]/25 text-[#e8d7c3]/70 hover:border-[#e8d7c3]/50"
              }`}
            >
              {seed.label}
            </button>
          ))}
        </div>
      </div>
      <KeybindLegend />
      <button
        type="button"
        autoFocus
        onClick={() => commands.run("startRun", {})}
        className="rounded-full border-2 border-[#ffc857] bg-[#ffc857] px-8 py-3 text-lg font-black uppercase tracking-[0.15em] text-[#241a2c] transition-transform hover:scale-105"
      >
        Start — Enter
      </button>
    </PanelShell>
  );
}

export interface WinScreenProps {
  readonly result: RunResult;
}

export function WinScreen({ result }: WinScreenProps) {
  const { commands } = useGame();
  return (
    <PanelShell>
      <h2 className="text-3xl font-black uppercase tracking-[0.15em] text-[#4ade80]">Got Him</h2>
      <p className="text-sm text-[#e8d7c3]/85">Border stays shut tonight. Ring closed in the riverbed straight.</p>
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Time" value={formatTime(result.timeSeconds)} />
        <Stat label="Shortcuts Trusted" value={`${result.shortcutsTrusted}/6`} />
        <Stat label="Surges" value={String(result.surgesTriggered)} />
      </div>
      <button
        type="button"
        autoFocus
        onClick={() => commands.run("restart", {})}
        className="rounded-full border-2 border-[#4ade80] bg-[#4ade80]/20 px-8 py-3 text-lg font-black uppercase tracking-[0.15em] text-[#4ade80] transition-transform hover:scale-105"
      >
        Restart — R
      </button>
    </PanelShell>
  );
}

export interface LoseScreenProps {
  readonly result: RunResult;
}

export function LoseScreen({ result }: LoseScreenProps) {
  const { commands } = useGame();
  return (
    <PanelShell>
      <h2 className="text-3xl font-black uppercase tracking-[0.15em] text-[#e0546b]">He's Through The Arch</h2>
      <p className="text-sm text-[#e8d7c3]/85">
        Final gap: {Math.round(result.finalGapMeters)}m.{" "}
        {result.missedShortcutLabel !== null
          ? `The survey was screaming about ${result.missedShortcutLabel} — you never trusted it.`
          : "You trusted every slot the survey gave you."}
      </p>
      <button
        type="button"
        autoFocus
        onClick={() => commands.run("restart", {})}
        className="rounded-full border-2 border-[#e0546b] bg-[#e0546b]/20 px-8 py-3 text-lg font-black uppercase tracking-[0.15em] text-[#e0546b] transition-transform hover:scale-105"
      >
        Restart — R
      </button>
    </PanelShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[#e8d7c3]/20 bg-black/25 px-2 py-3">
      <span className="text-[9px] uppercase tracking-[0.2em] text-[#e8d7c3]/60">{label}</span>
      <span className="text-lg font-bold text-[#e8d7c3]">{value}</span>
    </div>
  );
}
