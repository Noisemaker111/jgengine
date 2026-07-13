import type { ReactNode } from "react";
import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGame } from "@jgengine/react/hooks";

import { keybinds } from "../../keybinds";
import { MOVEMENTS } from "../../course/course";
import type { RunnerSnapshot } from "../../session/runnerEngine";

function KeyBadge({ action, label }: { action: string; label: string }) {
  const key = actionLabel(keybinds, action) ?? "?";
  return (
    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[#f8f4ff]/80">
      <kbd className="min-w-8 rounded border border-[#6d5f8d] bg-[#241b3a] px-2 py-1 text-center font-mono text-[#ffd166]">
        {key}
      </kbd>
      <span>{label}</span>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div
      className="pointer-events-auto flex w-full max-w-md flex-col items-center gap-6 rounded-lg border px-8 py-10 text-center"
      style={{ borderColor: "#6d5f8d", background: "radial-gradient(circle, #241b3aee 0%, #150f24f2 80%)" }}
    >
      {children}
    </div>
  );
}

export function StartScreen() {
  const { commands } = useGame();
  return (
    <div data-jg-menu className="contents">
      <Panel>
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-3xl tracking-[0.3em] text-[#f8f4ff]">PULSE RUNNER</h1>
        <p className="text-xs uppercase tracking-[0.35em] text-[#ffd166]">the world is the metronome</p>
      </div>
      <div className="flex items-center gap-3">
        {MOVEMENTS.map((movement, index) => (
          <div key={movement.id} className="flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase tracking-widest text-[#6d5f8d]">{movement.title}</span>
            <span className="font-serif text-xl text-[#f8f4ff]">{movement.bpm}</span>
            {index < MOVEMENTS.length - 1 ? <span className="text-[#6d5f8d]">→</span> : null}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <KeyBadge action="strideBeat" label="stride the beat" />
        <KeyBadge action="laneLeft" label="lane left" />
        <KeyBadge action="laneRight" label="lane right" />
        <KeyBadge action="lean" label="lean (speed nudge)" />
        <KeyBadge action="restart" label="restart" />
      </div>
      <button
        type="button"
        onClick={() => commands.run("start", {})}
        className="rounded-full border px-8 py-2 text-sm uppercase tracking-[0.3em] text-[#ffd166] transition-colors hover:bg-[#ffd16622]"
        style={{ borderColor: "#ffd166" }}
      >
        keep the pulse
      </button>
      <p className="text-[10px] uppercase tracking-[0.3em] text-[#6d5f8d]">press enter or space to start</p>
      </Panel>
    </div>
  );
}

export function WinScreen({ snapshot }: { snapshot: RunnerSnapshot }) {
  const { commands } = useGame();
  const overallGrade = snapshot.results.length === 0 ? "C" : snapshot.results[snapshot.results.length - 1]!.grade;
  return (
    <Panel>
      <h1 className="font-serif text-2xl tracking-[0.3em] text-[#ffd166]">SANCTUM REACHED</h1>
      <div className="flex flex-col gap-1">
        <span className="text-4xl font-serif text-[#f8f4ff]">{Math.round(snapshot.accuracy * 100)}%</span>
        <span className="text-xs uppercase tracking-[0.3em] text-[#6d5f8d]">beat accuracy</span>
      </div>
      <div className="flex gap-6">
        <div className="flex flex-col items-center">
          <span className="font-serif text-xl text-[#ffd166]">{overallGrade}</span>
          <span className="text-[10px] uppercase tracking-widest text-[#6d5f8d]">grade</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="font-serif text-xl text-[#f8f4ff]">{snapshot.longestPerfectStreak}</span>
          <span className="text-[10px] uppercase tracking-widest text-[#6d5f8d]">longest perfect streak</span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {snapshot.results.map((result) => (
          <div key={result.movementId} className="flex items-center justify-between gap-4 text-xs text-[#f8f4ff]/80">
            <span className="uppercase tracking-widest">{result.title}</span>
            <span className="text-[#ffd166]">{result.grade}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => commands.run("restart", {})}
        className="rounded-full border px-8 py-2 text-sm uppercase tracking-[0.3em] text-[#ffd166] transition-colors hover:bg-[#ffd16622]"
        style={{ borderColor: "#ffd166" }}
      >
        restart
      </button>
      <KeyBadge action="restart" label="restart" />
    </Panel>
  );
}

export function LoseScreen({ snapshot }: { snapshot: RunnerSnapshot }) {
  const { commands } = useGame();
  return (
    <Panel>
      <h1 className="font-serif text-2xl tracking-[0.3em] text-[#ef476f]">THE BEAT FORGIVES ONCE</h1>
      <p className="text-sm uppercase tracking-[0.25em] text-[#f8f4ff]/80">
        the dark caught you in {snapshot.defeatedAt ?? snapshot.movement.title}
      </p>
      <span className="text-3xl font-serif text-[#f8f4ff]">{Math.round(snapshot.accuracy * 100)}%</span>
      <button
        type="button"
        onClick={() => commands.run("restart", {})}
        className="rounded-full border px-8 py-2 text-sm uppercase tracking-[0.3em] text-[#ffd166] transition-colors hover:bg-[#ffd16622]"
        style={{ borderColor: "#ffd166" }}
      >
        restart
      </button>
      <KeyBadge action="restart" label="restart" />
    </Panel>
  );
}
