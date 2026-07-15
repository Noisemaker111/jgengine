import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react";
import { useGame } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";

import { actionLabel } from "@jgengine/core/input/actionBindings";

import { HEROES } from "../entities/players/catalog";
import { keybinds } from "../keybinds";
import { ROOM_COUNT, ROOMS } from "../rooms/catalog";
import { duetStore } from "../stores";
import type { HeroId } from "../types";

function key(action: string): string {
  return actionLabel(keybinds, action) ?? action;
}

function RoomBanner() {
  const roomIndex = useStore(duetStore, (s) => s.roomIndex);
  const room = ROOMS[roomIndex];
  if (room === undefined) return null;
  return (
    <div className="rounded-lg bg-slate-950/80 px-4 py-2 shadow-lg ring-1 ring-white/10">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        Room {roomIndex + 1} / {ROOM_COUNT}
      </div>
      <div className="text-lg font-bold text-white">{room.name}</div>
      <div className="mt-0.5 max-w-xs text-xs leading-snug text-slate-300">{room.objective}</div>
    </div>
  );
}

function HeroCard() {
  const active = useStore(duetStore, (s) => s.active) as HeroId;
  const hero = HEROES[active];
  return (
    <div
      className="rounded-lg bg-slate-950/85 px-4 py-3 shadow-lg ring-1"
      style={{ boxShadow: `0 0 24px ${hero.color}44`, borderColor: `${hero.color}55` }}
    >
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: hero.color }} />
        <span className="text-base font-bold" style={{ color: hero.color }}>
          {hero.name}
        </span>
        <span className="text-xs text-slate-400">{hero.title}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-200">
        <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-bold">{key("ability")}</kbd>
        <span className="font-semibold">{hero.ability}</span>
      </div>
      <div className="mt-1 max-w-xs text-xs leading-snug text-slate-400">{hero.abilityHint}</div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-300">
        <Legend k={key("swap")} label="Swap hero" />
        <Legend k="WASD" label="Move" />
        <Legend k={key("reset")} label="Reset" />
      </div>
    </div>
  );
}

function Legend({ k, label }: { k: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5">
      <kbd className="font-bold text-slate-200">{k}</kbd>
      <span className="text-slate-400">{label}</span>
    </span>
  );
}

function Toast() {
  const toast = useStore(duetStore, (s) => s.toast);
  if (toast === null) return null;
  return (
    <div className="rounded-full bg-slate-950/90 px-4 py-1.5 text-sm font-medium text-cyan-100 shadow-lg ring-1 ring-cyan-400/30">
      {toast}
    </div>
  );
}

function SolvedBadge() {
  const status = useStore(duetStore, (s) => s.status);
  if (status !== "solved") return null;
  return (
    <div className="rounded-xl bg-emerald-500/90 px-6 py-3 text-2xl font-black tracking-wide text-emerald-950 shadow-2xl">
      ROOM CLEAR
    </div>
  );
}

function CompleteOverlay() {
  const status = useStore(duetStore, (s) => s.status);
  const { commands } = useGame();
  if (status !== "complete") return null;
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-4 rounded-2xl bg-slate-950/92 px-10 py-8 text-center shadow-2xl ring-1 ring-white/15">
      <div className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Duet complete</div>
      <div className="text-3xl font-black text-white">Two keys, one door.</div>
      <div className="max-w-sm text-sm text-slate-300">
        Lumen and Anchor cleared every room together. Neither could have made it alone.
      </div>
      <button
        type="button"
        onClick={() => commands.run("duet.restart", {})}
        className="rounded-lg bg-cyan-400 px-6 py-2 font-bold text-slate-950 transition hover:bg-cyan-300"
      >
        Play again
      </button>
    </div>
  );
}

export function GameUI() {
  const layout = useHudLayout({ storageKey: "duet-keys" });
  return (
    <HudCanvas layout={layout} className="z-20 font-sans text-slate-100">
      <HudPanel id="room" anchor="top-left" compact="keep" interactive={false}>
        <RoomBanner />
      </HudPanel>
      <HudPanel id="hero" anchor="bottom-left" compact="keep" interactive={false}>
        <HeroCard />
      </HudPanel>
      <HudPanel id="toast" anchor="top" compact="keep" interactive={false}>
        <Toast />
      </HudPanel>
      <HudPanel id="solved" anchor="center" compact="keep" interactive={false}>
        <SolvedBadge />
      </HudPanel>
      <HudPanel id="complete" anchor="center" compact="keep" interactive>
        <CompleteOverlay />
      </HudPanel>
    </HudCanvas>
  );
}
