import { useCurrency, useGame, useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { ScrapPanel } from "./ScrapPanel";
import { useStore } from "@jgengine/react/store";
import { BLACK_MARKET_UPGRADES, upgradeCost } from "../../commands";
import { QUEST_ECHOES } from "../../quests/catalog";
import {
  blackMarketOpenStore,
  blackMarketStore,
  currentZoneStore,
  discoveredStationsStore,
  echoStore,
  travelOpenStore,
  reactorOpenStore,
} from "../../stores";
import { TRAVEL_STATIONS } from "../../world/sites";
import { FERRALON } from "../../palette";
import { Plate, Waveform } from "../fiction/kit";
import { Counter } from "./Mission";

function useNowMs(): number {
  return useGameStore((ctx) => ctx.time.now() * 1000);
}

export function ZoneBanner() {
  const nowMs = useNowMs();
  const zone = useStore(currentZoneStore);
  if (zone === null || nowMs - zone.atMs > 4000) return null;
  return (
    <div key={zone.name} className="scrap-banner ss-zone">
      <span className="ss-zone-name">{zone.name}</span>
      <span className="ss-zone-level">Recommended level {zone.level}</span>
    </div>
  );
}

/** An incoming transmission from a crewmate, on the rig’s radio strip. */
export function EchoBox() {
  const nowMs = useNowMs();
  const echo = useStore(echoStore);
  if (echo === null || nowMs - echo.atMs > 9000) return null;
  const line = QUEST_ECHOES[echo.questId];
  if (line === undefined) return null;
  return (
    <Plate material="carbon" cut="notch" depth={10} rim="#2c4d4a" padding="0" className="ss-echo">
      <span className="ss-echo-head"><span className="ss-led on" aria-hidden="true" /><b>ECHO — {line.speaker}</b><Waveform seed={line.speaker.length} /></span>
      <span className="ss-echo-line">{line.line}</span>
    </Plate>
  );
}

export function CoresPlate() {
  const cores = useCurrency("cores");
  return <Counter icon="gem" value={cores} color="#e879f9" label="Cores" />;
}

export function TravelPanel() {
  const { commands } = useGame();
  const open = useStore(travelOpenStore);
  const discovered = useStore(discoveredStationsStore);
  if (!open) return null;
  return (
    <ScrapPanel title="Fast Travel Network" onClose={() => commands.run("travel.close", {})}>
      <div className="flex flex-col gap-1.5">
        {TRAVEL_STATIONS.map((station) => {
          const known = discovered.includes(station.zoneId);
          return (
            <HudButton
              key={station.zoneId}
              block
              disabled={!known}
              onClick={() => commands.run("travel.go", { zoneId: station.zoneId })}
              className="scrap-row scrap-row-cyan"
            >
              <span className="flex-1 text-sm font-bold uppercase tracking-wider text-stone-100">
                {known ? station.name : "??? — undiscovered"}
              </span>
              {known ? <span className="text-xs font-black text-cyan-300">GO</span> : null}
            </HudButton>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-wider text-stone-500">
        Walk up to a station in the world to register it
      </p>
    </ScrapPanel>
  );
}

export function BlackMarketPanel() {
  const { commands } = useGame();
  const open = useStore(blackMarketOpenStore);
  const cores = useCurrency("cores");
  const counts = useStore(blackMarketStore);
  if (!open) return null;
  return (
    <ScrapPanel title="Switchboard Exchange" onClose={() => commands.run("blackmarket.close", {})}>
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-fuchsia-300">
        ◆ {cores} cores — elites and bosses drop it
      </div>
      <div className="flex flex-col gap-1.5">
        {BLACK_MARKET_UPGRADES.map((upgrade) => {
          const owned = counts[upgrade.id] ?? 0;
          const cost = upgradeCost(owned);
          const affordable = cores >= cost;
          return (
            <HudButton
              key={upgrade.id}
              block
              disabled={!affordable}
              onClick={() => commands.run("blackmarket.buy", { upgrade: upgrade.id })}
              className="scrap-row scrap-row-fuchsia"
            >
              <span className="flex-1">
                <span className="block text-sm font-bold uppercase tracking-wider text-stone-100">
                  {upgrade.name} <span className="text-stone-500">(owned {owned})</span>
                </span>
                <span className="block text-[11px] text-stone-400">{upgrade.blurb}</span>
              </span>
              <span className="text-sm font-black tabular-nums text-fuchsia-300">◆ {cost}</span>
            </HudButton>
          );
        })}
      </div>
    </ScrapPanel>
  );
}

export function ReactorEnding() {
  const reactor = useStore(reactorOpenStore);
  const nowMs = useNowMs();
  if (reactor === null || nowMs - reactor.atMs > 16000) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center">
      <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 220px 80px ${FERRALON.hudAmber}44` }} />
      <span className="text-5xl font-black uppercase tracking-[0.25em] text-amber-300 drop-shadow-[0_3px_16px_rgba(0,0,0,0.95)]">
        The Colossus Falls
      </span>
      <span className="mt-3 max-w-[30rem] text-center text-sm font-semibold leading-relaxed text-stone-100">
        The Reactor opens. Legendary loot rains onto Ember Gate — Ferralon is yours to keep farming, Reclaimer.
      </span>
    </div>
  );
}
