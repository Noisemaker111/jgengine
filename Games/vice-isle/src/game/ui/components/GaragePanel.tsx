import { useCurrency, useEntityStat, useGame, usePlayer } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { bestRaceStore, garageStore } from "../../commands";
import { VEHICLES } from "../../entities/vehicles/catalog";
import { CRED_GATES } from "../../progression/cred";

const STOCK = VEHICLES.filter((v) => v.price > 0);

export function GaragePanel() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const open = useStore(garageStore, (v) => v ?? false);
  const cash = useCurrency("cash");
  const cred = useEntityStat(userId, "level")?.current ?? 1;
  const bestLap = useStore(bestRaceStore, (v) => v);
  if (!open) return null;
  return (
    <div className="pointer-events-auto w-80 border-2 border-black bg-[#f4e8c8] text-[#1b1e26] shadow-[6px_6px_0_#000]">
      <div className="flex items-center justify-between border-b-2 border-black bg-[#33c1b1] px-3 py-2">
        <span className="text-sm font-black uppercase tracking-widest">Sunset Motors</span>
        <span className="-skew-x-6 border-2 border-black bg-[#2f8f4e] px-2 text-sm font-black text-[#eaffdd]">${cash.toLocaleString()}</span>
      </div>
      <div className="flex flex-col gap-1 p-3">
        {STOCK.map((car) => {
          const gate = CRED_GATES[car.id];
          const locked = gate !== undefined && cred < gate;
          const affordable = cash >= car.price && !locked;
          return (
            <button
              key={car.id}
              type="button"
              disabled={!affordable}
              onClick={() => commands.run("garage.buy", { vehicle: car.id })}
              className={`flex items-center justify-between border-2 border-black px-2 py-1 text-left text-xs font-black uppercase ${
                affordable ? "bg-white hover:bg-[#d8f7f2]" : "bg-[#c9c2ad] text-black/40"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="inline-block h-3 w-6 -skew-x-12 border border-black" style={{ background: car.body }} />
                {car.label}
              </span>
              {locked ? (
                <span className="-skew-x-6 border border-black bg-[#6d2f8f] px-1 text-[10px] text-white">CRED {gate}</span>
              ) : (
                <span className="tabular-nums">${car.price.toLocaleString()}</span>
              )}
            </button>
          );
        })}
      </div>
      {bestLap !== undefined ? (
        <div className="mx-3 mb-1 border-2 border-black bg-[#12141a]/90 px-2 py-1 text-[10px] font-black uppercase text-[#33c1b1]">
          Ocean Loop best — {bestLap.toFixed(1)}s
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => commands.run("garage.close", {})}
        className="m-3 mt-0 -skew-x-6 border-2 border-black bg-[#c23b3b] px-3 py-1 text-xs font-black uppercase text-white hover:bg-[#e35555]"
      >
        Leave
      </button>
    </div>
  );
}
