import { useEntityStat, useGame, usePlayer, useSceneEntities } from "@jgengine/react/hooks";

import { LIVES, SCORE, START_LIVES } from "../catalog";
import {
  getFrightenedRemaining,
  getLevel,
  getLevelUpRemaining,
  getPhase,
  MAX_LEVEL,
  pelletsLeft,
} from "../../loop";

function ScorePanel({ userId }: { userId: string }) {
  const score = useEntityStat(userId, SCORE);
  return (
    <div className="rounded-md border border-sky-400/40 bg-black/70 px-3 py-1.5 shadow-lg">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">Score</div>
      <div className="font-mono text-2xl leading-none text-yellow-300 tabular-nums">
        {String(score?.current ?? 0).padStart(5, "0")}
      </div>
    </div>
  );
}

function LivesPanel({ userId }: { userId: string }) {
  const lives = useEntityStat(userId, LIVES);
  const count = lives?.current ?? START_LIVES;
  return (
    <div className="flex items-center gap-2 rounded-md border border-yellow-400/40 bg-black/70 px-3 py-1.5 shadow-lg">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-yellow-300">Lives</span>
      <div className="flex gap-1">
        {Array.from({ length: Math.max(0, count) }, (_, index) => (
          <span key={index} className="h-4 w-4 rounded-full bg-yellow-300 shadow-[0_0_6px_rgba(253,224,71,0.7)]" />
        ))}
      </div>
    </div>
  );
}

function LevelPanel() {
  useSceneEntities();
  return (
    <div className="rounded-md border border-emerald-400/40 bg-black/70 px-3 py-1.5 text-center shadow-lg">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">Level</div>
      <div className="font-mono text-2xl leading-none text-white tabular-nums">
        {getLevel()}/{MAX_LEVEL}
      </div>
    </div>
  );
}

function PelletCounter() {
  useSceneEntities();
  return (
    <div className="rounded-md border border-white/20 bg-black/70 px-3 py-1 text-center shadow-lg">
      <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">Dots left </span>
      <span className="font-mono text-sm text-white tabular-nums">{pelletsLeft()}</span>
    </div>
  );
}

function StatusBanner() {
  useSceneEntities();
  const { commands } = useGame();
  const phase = getPhase();
  const fright = getFrightenedRemaining();
  if (phase === "levelup") {
    return (
      <Banner
        title={`LEVEL ${getLevel()}`}
        subtitle={`${getLevelUpRemaining().toFixed(1)}s to go`}
        tone="text-emerald-300 border-emerald-400/50"
      />
    );
  }
  if (phase === "won") {
    return (
      <Banner
        title="MAZE CLEARED"
        subtitle="Every dot devoured"
        tone="text-emerald-300 border-emerald-400/50"
        onRestart={() => commands.run("restart", {})}
      />
    );
  }
  if (phase === "lost") {
    return (
      <Banner
        title="GAME OVER"
        subtitle="The ghosts got you"
        tone="text-red-400 border-red-500/50"
        onRestart={() => commands.run("restart", {})}
      />
    );
  }
  if (fright > 0) {
    return (
      <div className="rounded-full border border-indigo-300/60 bg-indigo-600/30 px-4 py-1 text-center font-mono text-sm font-bold uppercase tracking-widest text-indigo-100 shadow-lg">
        Power! {fright.toFixed(1)}s
      </div>
    );
  }
  return null;
}

function Banner({
  title,
  subtitle,
  tone,
  onRestart,
}: {
  title: string;
  subtitle: string;
  tone: string;
  onRestart?: () => void;
}) {
  return (
    <div
      className={`pointer-events-auto rounded-2xl border-2 ${tone} bg-black/80 px-10 py-6 text-center shadow-2xl backdrop-blur-sm`}
    >
      <div className="font-mono text-4xl font-black tracking-[0.15em]">{title}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.3em] text-white/60">{subtitle}</div>
      {onRestart !== undefined ? (
        <button
          type="button"
          onClick={onRestart}
          className="mt-4 rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-white transition hover:bg-white/20"
        >
          Restart · R
        </button>
      ) : null}
    </div>
  );
}

export function GameUI() {
  const player = usePlayer();
  return (
    <div className="pointer-events-none absolute inset-0 select-none font-sans text-white">
      <div className="absolute left-4 top-4 flex gap-2">
        <ScorePanel userId={player.userId} />
        <LevelPanel />
      </div>
      <div className="absolute right-4 top-4">
        <LivesPanel userId={player.userId} />
      </div>
      <div className="absolute left-1/2 top-4 -translate-x-1/2">
        <PelletCounter />
      </div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <StatusBanner />
      </div>
    </div>
  );
}
