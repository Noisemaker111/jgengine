import { useEntityStat, useGame, usePlayer, useSceneEntities } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react";

import { LIVES, SCORE, START_LIVES } from "../catalog";
import {
  getForcefieldRemaining,
  getFrightenedRemaining,
  getLanternRemaining,
  getLevel,
  getLevelUpRemaining,
  getPhase,
  getShells,
  MAX_LEVEL,
  pelletsLeft,
} from "../../loop";

function ScorePanel({ userId }: { userId: string }) {
  const score = useEntityStat(userId, SCORE);
  return (
    <div className="rounded-md border border-red-500/40 bg-black/70 px-3 py-1.5 shadow-lg">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-400">Souls</div>
      <div className="font-mono text-2xl leading-none text-amber-200 tabular-nums">
        {String(score?.current ?? 0).padStart(5, "0")}
      </div>
    </div>
  );
}

function LivesPanel({ userId }: { userId: string }) {
  const lives = useEntityStat(userId, LIVES);
  const count = lives?.current ?? START_LIVES;
  return (
    <div className="flex items-center gap-2 rounded-md border border-red-500/40 bg-black/70 px-3 py-1.5 shadow-lg">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-400">Lives</span>
      <div className="flex gap-1">
        {Array.from({ length: Math.max(0, count) }, (_, index) => (
          <span key={index} className="h-4 w-4 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
        ))}
      </div>
    </div>
  );
}

function LevelPanel() {
  useSceneEntities();
  return (
    <div className="rounded-md border border-red-500/30 bg-black/70 px-3 py-1.5 text-center shadow-lg">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-300/80">Depth</div>
      <div className="font-mono text-2xl leading-none text-white tabular-nums">
        {getLevel()}/{MAX_LEVEL}
      </div>
    </div>
  );
}

function PelletCounter() {
  useSceneEntities();
  return (
    <div className="rounded-md border border-white/15 bg-black/70 px-3 py-1 text-center shadow-lg">
      <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">Souls left </span>
      <span className="font-mono text-sm text-amber-200 tabular-nums">{pelletsLeft()}</span>
    </div>
  );
}

function Pill({ label, tone, glow }: { label: string; tone: string; glow: string }) {
  return (
    <div
      className={`rounded-md border ${tone} bg-black/75 px-3 py-1.5 text-center font-mono text-xs font-bold uppercase tracking-widest shadow-lg`}
      style={{ boxShadow: `0 0 12px ${glow}` }}
    >
      {label}
    </div>
  );
}

function PowerBar() {
  useSceneEntities();
  const shields = getForcefieldRemaining();
  const lantern = getLanternRemaining();
  const shells = getShells();
  const fright = getFrightenedRemaining();
  return (
    <div className="flex flex-col items-center gap-1.5">
      {fright > 0 ? <Pill label={`The Hunt · ${fright.toFixed(1)}s`} tone="border-indigo-300/60 text-indigo-100" glow="rgba(99,102,241,0.5)" /> : null}
      {shields > 0 ? <Pill label={`Force Field · ${shields.toFixed(1)}s`} tone="border-cyan-300/60 text-cyan-100" glow="rgba(56,224,255,0.5)" /> : null}
      {lantern > 0 ? <Pill label={`Lantern · ${lantern.toFixed(1)}s`} tone="border-yellow-300/60 text-yellow-100" glow="rgba(255,225,77,0.5)" /> : null}
      {shells > 0 ? (
        <Pill label={`Double Barrel · ${shells} ▮ · Space`} tone="border-orange-400/70 text-orange-100" glow="rgba(255,122,41,0.55)" />
      ) : null}
    </div>
  );
}

function StatusBanner() {
  useSceneEntities();
  const { commands } = useGame();
  const phase = getPhase();
  if (phase === "levelup") {
    return (
      <Banner
        title={`DESCENDING`}
        subtitle={`Depth ${getLevel()} · ${getLevelUpRemaining().toFixed(1)}s`}
        tone="text-red-300 border-red-500/50"
      />
    );
  }
  if (phase === "won") {
    return (
      <Banner
        title="YOU ESCAPED"
        subtitle="Every soul devoured"
        tone="text-emerald-300 border-emerald-400/50"
        onRestart={() => commands.run("restart", {})}
      />
    );
  }
  if (phase === "lost") {
    return (
      <Banner
        title="DEVOURED"
        subtitle="The eyes found you"
        tone="text-red-500 border-red-600/60"
        onRestart={() => commands.run("restart", {})}
      />
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
      className={`pointer-events-auto rounded-2xl border-2 ${tone} bg-black/85 px-10 py-6 text-center shadow-2xl backdrop-blur-sm`}
    >
      <div className="font-mono text-4xl font-black tracking-[0.15em]">{title}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.3em] text-white/60">{subtitle}</div>
      {onRestart !== undefined ? (
        <button
          type="button"
          onClick={onRestart}
          className="mt-4 rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-white transition hover:bg-white/20"
        >
          Descend Again · R
        </button>
      ) : null}
    </div>
  );
}

export function GameUI() {
  const player = usePlayer();
  const layout = useHudLayout({ storageKey: "maze-muncher" });
  return (
    <HudCanvas layout={layout} className="select-none font-sans text-white">
      <div
        className="absolute inset-0"
        style={{ boxShadow: "inset 0 0 120px 40px rgba(0,0,0,0.55)", background: "radial-gradient(circle at 50% 50%, transparent 55%, rgba(0,0,0,0.35) 100%)" }}
      />
      <HudPanel id="score" anchor="top-left" inset={{ x: 16, y: 16 }} className="flex gap-2">
        <ScorePanel userId={player.userId} />
        <LevelPanel />
      </HudPanel>
      <HudPanel id="lives" anchor="top-right" inset={{ x: 16, y: 16 }}>
        <LivesPanel userId={player.userId} />
      </HudPanel>
      <HudPanel id="pellets" anchor="top" inset={{ x: 0, y: 16 }}>
        <PelletCounter />
      </HudPanel>
      <HudPanel id="power-bar" anchor="bottom" inset={{ x: 0, y: 24 }}>
        <PowerBar />
      </HudPanel>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <StatusBanner />
      </div>
    </HudCanvas>
  );
}
