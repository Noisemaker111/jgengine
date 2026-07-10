import { actionLabel } from "@jgengine/core/input/actionBindings";

import { keybinds } from "../../keybinds";
import { LOOP_TEAL, TAPE_MAGENTA } from "../../track/palette";

function KeyBadge({ action, children }: { action: string; children: React.ReactNode }) {
  const label = actionLabel(keybinds, action) ?? "?";
  return (
    <span className="flex items-center gap-2 text-sm text-[#f5f2fa]/80">
      <span className="inline-flex min-w-[2rem] items-center justify-center rounded border border-[#6247aa]/70 bg-[#12101f] px-2 py-1 text-xs font-bold tracking-wide text-[#f5f2fa]">
        {label}
      </span>
      {children}
    </span>
  );
}

export function StartScreen({ bestLaps, onStart }: { bestLaps: number; onStart: () => void }) {
  return (
    <div className="pointer-events-auto flex h-full w-full flex-col items-center justify-center gap-6 bg-[#12101f]/90 px-6 text-center">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.5em] text-[#12b3a8]">Synthwave Tape-Loop Speedrunner</p>
        <h1 className="mt-2 text-5xl font-black uppercase tracking-widest text-[#f5f2fa] drop-shadow-[0_0_18px_rgba(232,61,132,0.65)]">
          Loop Station
        </h1>
      </div>
      <div className="max-w-md space-y-1 text-sm leading-relaxed text-[#f5f2fa]/85">
        <p>Run the circuit. Every clean lap is recorded and replays forever as a solid ghost.</p>
        <p>Touch a ghost — or miss the over/under jump — and the tape ends.</p>
        <p>Desync from your own history: brake, branch, and outrun your past.</p>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 rounded-lg border border-[#6247aa]/50 bg-[#1c1830]/70 px-6 py-4">
        <KeyBadge action="throttleUp">Pace up</KeyBadge>
        <KeyBadge action="throttleDown">Pace down</KeyBadge>
        <KeyBadge action="steerLeft">Steer / branch left</KeyBadge>
        <KeyBadge action="steerRight">Steer right</KeyBadge>
        <KeyBadge action="brakeDrift">Brake-drift</KeyBadge>
        <KeyBadge action="jumpHop">Jump-hop (over/under)</KeyBadge>
        <KeyBadge action="restartRun">Restart</KeyBadge>
        <KeyBadge action="startRun">Start</KeyBadge>
      </div>
      <p className="text-xs uppercase tracking-[0.3em] text-[#f5f2fa]/60">
        Best tape: <span style={{ color: TAPE_MAGENTA }}>{bestLaps}</span> laps survived
      </p>
      <button
        type="button"
        onClick={onStart}
        className="rounded-md px-8 py-3 text-lg font-black uppercase tracking-widest text-[#12101f] shadow-[0_0_25px_rgba(18,179,168,0.55)] transition hover:brightness-110"
        style={{ background: `linear-gradient(90deg, ${TAPE_MAGENTA}, ${LOOP_TEAL})` }}
      >
        Press Enter — Start
      </button>
    </div>
  );
}
