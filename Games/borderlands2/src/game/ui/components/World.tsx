import { useCurrency, useGame, useGameStore } from "@jgengine/react/hooks";
import { BLACK_MARKET_UPGRADES, upgradeCost, type BlackMarketCounts } from "../../commands";
import { QUEST_ECHOES } from "../../quests/catalog";
import { TRAVEL_STATIONS } from "../../world/sites";
import { PANDORA } from "../../palette";

function useNowMs(): number {
  return useGameStore((ctx) => ctx.time.now() * 1000);
}

export function ZoneBanner() {
  const nowMs = useNowMs();
  const zone = useGameStore(
    (ctx) => ctx.game.store.get("currentZone") as { name: string; level: number; atMs: number } | undefined,
  );
  if (zone === undefined || nowMs - zone.atMs > 4000) return null;
  return (
    <div className="pointer-events-none flex flex-col items-center">
      <span className="border-b-2 border-amber-400 px-6 pb-1 text-3xl font-black uppercase tracking-[0.3em] text-stone-50 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
        {zone.name}
      </span>
      <span className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
        Recommended level {zone.level}
      </span>
    </div>
  );
}

export function EchoBox() {
  const nowMs = useNowMs();
  const echo = useGameStore((ctx) => ctx.game.store.get("echo") as { questId: string; atMs: number } | undefined);
  if (echo === undefined || nowMs - echo.atMs > 9000) return null;
  const line = QUEST_ECHOES[echo.questId];
  if (line === undefined) return null;
  return (
    <div className="max-w-[24rem] border-2 border-cyan-400/70 bg-black/80 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-300">
        ECHO — {line.speaker}
      </div>
      <div className="mt-1 text-xs font-semibold leading-relaxed text-stone-100">{line.line}</div>
    </div>
  );
}

export function EridiumPlate() {
  const eridium = useCurrency("eridium");
  return (
    <div className="flex skew-x-[-8deg] items-baseline gap-1 border-2 border-black/80 bg-black/70 px-3 py-1">
      <span className="text-sm font-black text-fuchsia-400">◆</span>
      <span className="text-lg font-black tabular-nums text-stone-50">{eridium}</span>
    </div>
  );
}

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[26rem] max-w-[92vw] border-2 border-amber-500/80 bg-stone-950/95 p-4 shadow-[0_8px_40px_rgba(0,0,0,0.9)]">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-lg font-black uppercase tracking-widest text-amber-300">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="border border-stone-600 px-2 py-0.5 text-xs font-bold uppercase text-stone-300 hover:border-amber-400 hover:text-amber-300"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function TravelPanel() {
  const { commands } = useGame();
  const open = useGameStore((ctx) => ctx.game.store.get("travelOpen") === true);
  const discovered = useGameStore(
    (ctx) => (ctx.game.store.get("discoveredStations") as readonly string[] | undefined) ?? [],
  );
  if (!open) return null;
  return (
    <PanelShell title="Fast Travel Network" onClose={() => commands.run("travel.close", {})}>
      <div className="flex flex-col gap-1.5">
        {TRAVEL_STATIONS.map((station) => {
          const known = discovered.includes(station.zoneId);
          return (
            <button
              key={station.zoneId}
              type="button"
              disabled={!known}
              onClick={() => commands.run("travel.go", { zoneId: station.zoneId })}
              className={`flex w-full items-center border px-3 py-2 text-left ${
                known
                  ? "border-stone-700 bg-stone-900/80 hover:border-cyan-400/70 hover:bg-stone-800"
                  : "cursor-not-allowed border-stone-800 bg-stone-950/60 opacity-50"
              }`}
            >
              <span className="flex-1 text-sm font-bold uppercase tracking-wider text-stone-100">
                {known ? station.name : "??? — undiscovered"}
              </span>
              {known ? <span className="text-xs font-black text-cyan-300">GO</span> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-wider text-stone-500">
        Walk up to a station in the world to register it
      </p>
    </PanelShell>
  );
}

export function BlackMarketPanel() {
  const { commands } = useGame();
  const open = useGameStore((ctx) => ctx.game.store.get("blackMarketOpen") === true);
  const eridium = useCurrency("eridium");
  const counts = useGameStore(
    (ctx) => (ctx.game.store.get("blackMarket") as BlackMarketCounts | undefined) ?? {},
  );
  if (!open) return null;
  return (
    <PanelShell title="Crazy Earl's Black Market" onClose={() => commands.run("blackmarket.close", {})}>
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-fuchsia-300">
        ◆ {eridium} eridium — badasses and bosses drop it
      </div>
      <div className="flex flex-col gap-1.5">
        {BLACK_MARKET_UPGRADES.map((upgrade) => {
          const owned = counts[upgrade.id] ?? 0;
          const cost = upgradeCost(owned);
          const affordable = eridium >= cost;
          return (
            <button
              key={upgrade.id}
              type="button"
              disabled={!affordable}
              onClick={() => commands.run("blackmarket.buy", { upgrade: upgrade.id })}
              className={`flex w-full items-center gap-3 border px-3 py-2 text-left ${
                affordable
                  ? "border-stone-700 bg-stone-900/80 hover:border-fuchsia-400/70 hover:bg-stone-800"
                  : "cursor-not-allowed border-stone-800 bg-stone-950/60 opacity-50"
              }`}
            >
              <span className="flex-1">
                <span className="block text-sm font-bold uppercase tracking-wider text-stone-100">
                  {upgrade.name} <span className="text-stone-500">(owned {owned})</span>
                </span>
                <span className="block text-[11px] text-stone-400">{upgrade.blurb}</span>
              </span>
              <span className="text-sm font-black tabular-nums text-fuchsia-300">◆ {cost}</span>
            </button>
          );
        })}
      </div>
    </PanelShell>
  );
}

export function VaultEnding() {
  const vault = useGameStore((ctx) => ctx.game.store.get("vaultOpen") as { atMs: number } | undefined);
  const nowMs = useNowMs();
  if (vault === undefined || nowMs - vault.atMs > 16000) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center">
      <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 220px 80px ${PANDORA.hudAmber}44` }} />
      <span className="text-5xl font-black uppercase tracking-[0.25em] text-amber-300 drop-shadow-[0_3px_16px_rgba(0,0,0,0.95)]">
        The Warrior Falls
      </span>
      <span className="mt-3 max-w-[30rem] text-center text-sm font-semibold leading-relaxed text-stone-100">
        The Vault opens. Legendary loot rains onto Hero's Pass — Pandora is yours to keep farming, Vault Hunter.
      </span>
    </div>
  );
}
