import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useEntityStat, useFeed, useGame, useGameStore, usePlayer } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, SettingsTrigger, useHudLayout } from "@jgengine/react";

import { keybinds } from "../keybinds";
import { goalProgress } from "../physics";
import { MAX_HEALTH, STATUS_FEED, type LevelResult } from "../tuning";

function Hearts({ userId }: { userId: string }) {
  const health = useEntityStat(userId, "health");
  const current = health === null ? MAX_HEALTH : Math.round(health.current);
  const max = health === null ? MAX_HEALTH : Math.round(health.max);
  return (
    <div className="flex items-center gap-1" aria-label="health">
      {Array.from({ length: max }, (_, index) => (
        <span
          key={index}
          className={`text-lg leading-none ${index < current ? "text-rose-400" : "text-white/20"}`}
        >
          {index < current ? "♥" : "♡"}
        </span>
      ))}
    </div>
  );
}

function Score({ userId }: { userId: string }) {
  const score = useEntityStat(userId, "score");
  const total = score === null ? 0 : Math.round(score.current);
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs uppercase tracking-widest text-amber-300/80">Score</span>
      <span className="tabular-nums text-lg font-semibold text-amber-200">{total}</span>
    </div>
  );
}

function GoalProgress({ userId }: { userId: string }) {
  const playerX = useGameStore((ctx) => ctx.scene.entity.get(userId)?.position[0] ?? null);
  const fraction = playerX === null ? 0 : goalProgress(playerX);
  return (
    <div className="flex w-56 flex-col gap-1" aria-label="progress to goal">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/50">
        <span>Start</span>
        <span>Flag</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-[width]"
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </div>
    </div>
  );
}

function useLevelResult(): LevelResult | null {
  const entries = useFeed({ action: STATUS_FEED, limit: 12 });
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const result = (entries[index]?.data as { result?: string } | undefined)?.result;
    if (result === "won" || result === "lost") return result;
  }
  return null;
}

function Banner({ userId }: { userId: string }) {
  const result = useLevelResult();
  const score = useEntityStat(userId, "score");
  const { commands } = useGame();
  if (result === null) return null;
  const won = result === "won";
  const restartLabel = actionLabel(keybinds, "restart") ?? "R";
  return (
    <div
      className={`pointer-events-auto rounded-xl border px-8 py-5 text-center shadow-2xl backdrop-blur ${
        won ? "border-emerald-400/60 bg-emerald-950/70" : "border-rose-500/60 bg-rose-950/70"
      }`}
    >
      <p className={`text-2xl font-black tracking-tight ${won ? "text-emerald-300" : "text-rose-300"}`}>
        {won ? "Flag Reached!" : "Game Over"}
      </p>
      <p className="mt-1 text-sm text-white/70">
        Score {score === null ? 0 : Math.round(score.current)}
      </p>
      <button
        type="button"
        onClick={() => commands.run("restart", {})}
        className="mt-4 inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-white/20"
      >
        Restart
        <kbd className="rounded border border-white/30 bg-black/30 px-1.5 py-0.5 text-[10px] font-semibold">
          {restartLabel}
        </kbd>
      </button>
    </div>
  );
}

export function GameUI() {
  const { userId } = usePlayer();
  const layout = useHudLayout({ storageKey: "platform-hopper" });
  return (
    <HudCanvas layout={layout} className="font-sans text-white">
      <HudPanel id="intro" anchor="top-left" inset={{ x: 16, y: 16 }} className="rounded-lg border border-white/15 bg-black/55 px-3 py-2 shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-300/80">Platform Hopper</p>
        <p className="mt-0.5 text-sm text-white/85">Run right, stomp the stompers, dodge the spikes, reach the flag.</p>
      </HudPanel>
      <HudPanel id="stats" anchor="top-right" inset={{ x: 16, y: 16 }} className="flex flex-col items-end gap-2 rounded-lg border border-white/15 bg-black/55 px-3 py-2 shadow-lg">
        <div className="flex items-center gap-2">
          <Hearts userId={userId} />
          <SettingsTrigger className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md border border-white/20 text-base text-white/70 transition hover:bg-white/15 hover:text-white" />
        </div>
        <Score userId={userId} />
      </HudPanel>
      <HudPanel id="goal-progress" anchor="top" inset={{ x: 0, y: 16 }}>
        <GoalProgress userId={userId} />
      </HudPanel>
      <div className="absolute inset-x-0 top-1/3 flex justify-center">
        <Banner userId={userId} />
      </div>
    </HudCanvas>
  );
}
