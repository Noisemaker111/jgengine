import { useGame, useGameStore, usePlayer } from "@jgengine/react/hooks";

import type { FiestaRecord, FiestaView } from "../../arena/fiesta";
import { fiestaRecordKey, fiestaStoreKey } from "../../arena/fiesta";
import { CLOSE_BUTTON, PANEL, PANEL_TITLE } from "../theme";

const TIER_COLORS: Record<string, string> = {
  silver: "border-stone-400/60 text-stone-200",
  gold: "border-amber-400/70 text-amber-200",
  prismatic: "border-fuchsia-400/70 text-fuchsia-200",
};

export function ArenaPanel() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const record = useGameStore(
    (ctx) => ctx.game.store.get(fiestaRecordKey(userId)) as FiestaRecord | undefined,
  );
  const fiesta = useGameStore(
    (ctx) => ctx.game.store.get(fiestaStoreKey(userId)) as FiestaView | undefined,
  );
  return (
    <div className={`${PANEL} pointer-events-auto w-[360px]`}>
      <div className={PANEL_TITLE}>
        <span>The Ashen Coliseum</span>
        <button type="button" className={CLOSE_BUTTON} onClick={() => commands.run("openArena", {})}>
          ✕
        </button>
      </div>
      <div className="space-y-3 px-4 py-3 text-sm">
        <div className="text-center">
          <div
            className="text-3xl font-bold text-[#ffb24a]"
            style={{ textShadow: "0 0 10px #cc5a1466, 1px 1px 2px #000" }}
          >
            {(record?.wins ?? 0) * 25 + 1500}
          </div>
          <div className="text-xs text-stone-400">
            Rating — <span className="text-[#7fdc4f]">{record?.wins ?? 0} wins</span> /{" "}
            <span className="text-[#ff7a6a]">{record?.losses ?? 0} losses</span>
          </div>
        </div>
        <div className="rounded border border-[#5a4a20] bg-stone-950/60 px-3 py-2 text-xs text-stone-400">
          The Ashen Coliseum is a ranked arena for the live world. Play online to enter the queue and
          climb the ladder.
        </div>
        <div className="rounded border border-fuchsia-800/60 bg-fuchsia-950/20 px-3 py-2">
          <div className="mb-1 text-sm font-semibold text-[#ff3df0]">2v2 FIESTA — Practice</div>
          <p className="mb-2 text-xs text-stone-400">
            Fight beside Sir Botsworth against Botzo the Arcane and Sneakbot. Score takedowns, grab
            augments, survive the ring. First to 15.
          </p>
          {fiesta?.active === true ? (
            <button
              type="button"
              className="w-full rounded border border-stone-600 bg-stone-900/70 px-2 py-1.5 text-xs text-stone-300 hover:bg-stone-800"
              onClick={() => commands.run("fiesta.leave", {})}
            >
              Forfeit Match
            </button>
          ) : (
            <button
              type="button"
              className="w-full rounded border border-fuchsia-600/70 bg-fuchsia-950/60 px-2 py-1.5 text-xs font-semibold text-fuchsia-100 hover:bg-fuchsia-900/50"
              onClick={() => {
                commands.run("fiesta.start", {});
                commands.run("openArena", {});
              }}
            >
              Enter the FIESTA
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function FiestaBanner() {
  const { userId } = usePlayer();
  const view = useGameStore(
    (ctx) => ctx.game.store.get(fiestaStoreKey(userId)) as FiestaView | undefined,
  );
  if (view?.active !== true) return null;
  const minutes = Math.floor(view.timeLeft / 60);
  const seconds = Math.floor(view.timeLeft % 60);
  return (
    <div className="pointer-events-none flex flex-col items-center gap-1">
      <div
        className="rounded-md border border-[#cc5a14] bg-gradient-to-b from-[#1a120bdd] to-[#0d0805dd] px-4 py-1.5 text-center shadow-lg"
        style={{ boxShadow: "inset 0 0 16px #cc5a1422" }}
      >
        <div className="text-lg font-bold tracking-wide">
          <span className="text-[#7fdc4f]">{view.scoreA}</span>
          <span className="mx-2 text-[#d8cba0]">FIESTA</span>
          <span className="text-[#ff8d7a]">{view.scoreB}</span>
        </div>
        <div className="text-[11px] text-[#d8cba0]">
          {view.status === "countdown"
            ? `Steel yourself… ${view.countdown}`
            : view.status === "over"
              ? "The bout is decided. Returning to the world…"
              : `First to ${view.scoreLimit} · ${minutes}:${String(seconds).padStart(2, "0")}${view.inRing ? "" : " · RING!"}`}
        </div>
      </div>
      {view.pop !== null && (
        <div
          className="text-2xl font-black tracking-widest drop-shadow-lg"
          style={{ color: view.pop.color, textShadow: "2px 2px 3px #000" }}
        >
          {view.pop.text}
        </div>
      )}
      {view.playerRespawnIn > 0 && (
        <div className="rounded bg-stone-950/80 px-3 py-1 text-sm text-[#ff8d7a]">
          Respawn in {Math.ceil(view.playerRespawnIn)}…
        </div>
      )}
    </div>
  );
}

export function FiestaHud() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const view = useGameStore(
    (ctx) => ctx.game.store.get(fiestaStoreKey(userId)) as FiestaView | undefined,
  );
  if (view?.active !== true) return null;
  return (
    <div className="pointer-events-auto flex w-64 flex-col gap-2">
      <div className="rounded-md border border-fuchsia-800/70 bg-stone-950/85 px-3 py-2 text-sm shadow-lg">
        <div className="mb-1 font-semibold text-[#ff3df0]">Ashen Coliseum · Fiesta</div>
        {view.fighters.map((fighter) => (
          <div key={fighter.name} className="mb-0.5 flex items-center gap-2 text-xs">
            <span
              className={`w-24 truncate ${fighter.team === "a" ? "text-[#7fdc4f]" : "text-[#ff8d7a]"}`}
            >
              {fighter.name}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded bg-stone-800">
              <div
                className={fighter.team === "a" ? "h-full bg-emerald-500" : "h-full bg-red-500"}
                style={{
                  width: `${fighter.dead ? 0 : Math.round((fighter.hp / Math.max(1, fighter.hpMax)) * 100)}%`,
                }}
              />
            </div>
            {fighter.dead && (
              <span className="text-[10px] text-stone-500">
                {fighter.respawnIn > 0 ? `${Math.ceil(fighter.respawnIn)}s` : "down"}
              </span>
            )}
          </div>
        ))}
        {view.augments.length > 0 && (
          <div className="mt-1 text-[10px] text-[#32e0ff]">
            {view.augments.map((aug) => aug.name).join(" · ")}
          </div>
        )}
      </div>
      {view.offer !== null && (
        <div className="rounded-md border border-amber-700/70 bg-stone-950/90 px-3 py-2 shadow-lg">
          <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[#ffd24a]">
            Choose an augment
          </div>
          <div className="flex flex-col gap-1.5">
            {view.offer.map((aug) => (
              <button
                key={aug.id}
                type="button"
                className={`rounded border bg-stone-900/80 px-2 py-1.5 text-left hover:bg-stone-800 ${TIER_COLORS[aug.tier] ?? TIER_COLORS.silver}`}
                onClick={() => commands.run("fiesta.pick", { augmentId: aug.id })}
              >
                <div className="text-xs font-semibold">{aug.name}</div>
                <div className="text-[10px] text-stone-400">{aug.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
