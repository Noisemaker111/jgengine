import type { ReactNode } from "react";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import type { HeistState } from "../../state/heistState";
import { mansionClockAt, secondsUntilDawn } from "../../schedule/mansionClock";

function useHeist(): HeistState | undefined {
  return useGameStore((ctx) => ctx.game.store.get("heist") as HeistState | undefined);
}

export function EndScreens(): ReactNode {
  const heist = useHeist();
  const { commands } = useGame();
  if (heist === undefined || (heist.status !== "lost" && heist.status !== "won")) return null;

  const restart = () => commands.run("restart", {});

  if (heist.status === "won" && heist.wonSummary !== null) {
    const margin = secondsUntilDawn(heist.wonSummary.elapsedSeconds);
    return (
      <Frame accent="#c9a227">
        <p className="font-serif text-xs uppercase tracking-[0.35em] text-[#c9a227]">The Job Is Done</p>
        <h2 className="mt-2 font-serif text-3xl font-bold text-[#f2e3c2]">Gone Before Dawn</h2>
        <p className="mt-3 text-sm text-[#e5d9c3]/90">
          Slipped out at {heist.wonSummary.atLabel}, with {Math.round(margin)}s of night still on the clock.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Stat label="Haul" value={heist.wonSummary.haulValue.toLocaleString()} />
          <Stat label="Strikes used" value={`${heist.wonSummary.strikesUsed} / 3`} />
        </div>
        <RestartButton onClick={restart} />
      </Frame>
    );
  }

  const reason = heist.lostReason;
  const clock = mansionClockAt(heist.frozenElapsed);
  return (
    <Frame accent="#7a1f2b">
      <p className="font-serif text-xs uppercase tracking-[0.35em] text-[#7a1f2b]">The Job Is Blown</p>
      <h2 className="mt-2 font-serif text-3xl font-bold text-[#f2e3c2]">{reason === "dawn" ? "Dawn Broke" : "Caught"}</h2>
      {reason === "dawn" ? (
        <p className="mt-3 text-sm text-[#e5d9c3]/90">
          The household woke at {clock.label} with you still inside. Dawn is not negotiable.
        </p>
      ) : (
        <p className="mt-3 text-sm text-[#e5d9c3]/90">
          {heist.caughtBy !== null
            ? `Spotted by ${heist.caughtBy.guardName} in the ${heist.caughtBy.roomName} at ${heist.caughtBy.atLabel}.`
            : "Spotted, three times over."}
        </p>
      )}
      <RestartButton onClick={restart} />
    </Frame>
  );
}

function Frame({ accent, children }: { accent: string; children: ReactNode }): ReactNode {
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#0b0f1c]/92 p-4">
      <div
        className="w-full max-w-lg rounded-lg border-2 bg-gradient-to-b from-[#1d2b4a] to-[#0b0f1c] p-6 shadow-2xl"
        style={{ borderColor: accent }}
      >
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="rounded border border-[#c9a227]/30 bg-black/25 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-[#c9a227]/80">{label}</p>
      <p className="font-serif text-lg text-[#f2e3c2]">{value}</p>
    </div>
  );
}

function RestartButton({ onClick }: { onClick: () => void }): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-6 flex w-full items-center justify-center gap-2 rounded border border-[#c9a227] bg-[#1d2b4a] px-4 py-3 font-serif text-base font-semibold uppercase tracking-wide text-[#f2e3c2] transition hover:bg-[#2a3c63]"
    >
      Try Again
      <kbd className="rounded border border-[#c9a227]/60 bg-black/30 px-1.5 py-0.5 font-mono text-[11px]">R</kbd>
    </button>
  );
}
