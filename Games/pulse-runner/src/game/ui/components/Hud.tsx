import type { RunnerSnapshot } from "../../session/runnerEngine";

const JUDGEMENT_COPY: Record<string, string> = {
  perfect: "PERFECT",
  good: "GOOD",
  miss: "MISS",
};

const JUDGEMENT_COLOR: Record<string, string> = {
  perfect: "text-[#ffd166]",
  good: "text-[#f8f4ff]",
  miss: "text-[#ef476f]",
};

export function PulseMandala({ snapshot }: { snapshot: RunnerSnapshot }) {
  const percent = Math.round(snapshot.pulse * 100);
  const bloom = 0.5 + snapshot.pulse * 0.5;
  const ring = snapshot.resonance ? "#ffd166" : snapshot.pulse < 0.3 ? "#ef476f" : "#f8f4ff";
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 transition-all duration-300 sm:h-28 sm:w-28"
        style={{
          borderColor: ring,
          transform: `scale(${bloom})`,
          boxShadow: snapshot.resonance ? "0 0 26px #ffd16688" : "0 0 14px #6d5f8d55",
          background: "radial-gradient(circle, #241b3acc 0%, #150f24cc 70%)",
        }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        data-pulse={percent}
      >
        <div
          className="absolute inset-2 rounded-full border transition-opacity duration-300"
          style={{ borderColor: "#6d5f8d", opacity: 0.4 + snapshot.pulse * 0.4 }}
        />
        <span className="font-serif text-lg tracking-widest text-[#f8f4ff]">{percent}</span>
      </div>
      <span className="text-[10px] uppercase tracking-[0.3em] text-[#6d5f8d]">pulse</span>
    </div>
  );
}

export function BeatBar({ snapshot }: { snapshot: RunnerSnapshot }) {
  return (
    <div className="h-1 w-40 overflow-hidden rounded-full bg-[#241b3a] sm:w-56" data-beat-phase={snapshot.beat.phase.toFixed(2)}>
      <div
        className="h-full rounded-full bg-[#6d5f8d] transition-[width] duration-100 ease-linear"
        style={{ width: `${(1 - snapshot.beat.phase) * 100}%` }}
      />
    </div>
  );
}

export function AccuracyTicker({ snapshot }: { snapshot: RunnerSnapshot }) {
  if (snapshot.lastJudgement === null) return null;
  const { kind, atSec } = snapshot.lastJudgement;
  return (
    <div
      key={atSec}
      className={`pointer-events-none select-none font-serif text-sm font-semibold tracking-[0.35em] ${JUDGEMENT_COLOR[kind]}`}
      style={{ animation: "pulse-runner-float 0.7s ease-out" }}
    >
      {JUDGEMENT_COPY[kind]}
    </div>
  );
}

export function MovementProgress({ snapshot }: { snapshot: RunnerSnapshot }) {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-2 px-4">
      <span className="text-[10px] uppercase tracking-[0.4em] text-[#f8f4ff]/70">{snapshot.movement.title}</span>
      <div className="flex w-full items-center gap-1.5">
        {snapshot.checkpoints.map((checkpoint, index) => (
          <div key={checkpoint.id} className="flex flex-1 items-center gap-1.5">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full"
              style={{ background: "#241b3a" }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-150"
                style={{
                  background: checkpoint.cleared ? "#ffd166" : "#6d5f8d",
                  width:
                    index < snapshot.movementIndex || checkpoint.cleared
                      ? "100%"
                      : index === snapshot.movementIndex
                        ? `${snapshot.progress * 100}%`
                        : "0%",
                }}
              />
            </div>
            <div
              className="h-2 w-2 shrink-0 rounded-full border"
              style={{ borderColor: "#ffd166", background: checkpoint.cleared ? "#ffd166" : "transparent" }}
              aria-label={`checkpoint ${checkpoint.title}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResonanceFlash({ snapshot }: { snapshot: RunnerSnapshot }) {
  if (!snapshot.resonance) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 transition-opacity duration-300"
      style={{ background: "radial-gradient(circle, transparent 40%, #ffd16622 100%)" }}
      data-resonance="active"
    >
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 font-serif text-xs uppercase tracking-[0.5em] text-[#ffd166]">
        resonance
      </div>
    </div>
  );
}

export function StrikeMarks({ snapshot }: { snapshot: RunnerSnapshot }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`${snapshot.strikes} of 3 strikes`}>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-2.5 w-2.5 rounded-full border"
          style={{
            borderColor: "#ef476f",
            background: index < snapshot.strikes ? "#ef476f" : "transparent",
          }}
        />
      ))}
    </div>
  );
}
