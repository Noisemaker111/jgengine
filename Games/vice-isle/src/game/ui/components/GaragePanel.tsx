import { useCurrency, useGame, useGameStore } from "@jgengine/react/hooks";
import { GARAGE_STORE_KEY } from "../../commands";
import { VEHICLES } from "../../entities/vehicles/catalog";

const STOCK = VEHICLES.filter((v) => v.price > 0);

export function GaragePanel() {
  const { commands } = useGame();
  const open = useGameStore((ctx) => (ctx.game.store.get(GARAGE_STORE_KEY) as boolean | undefined) ?? false);
  const cash = useCurrency("cash");
  if (!open) return null;
  return (
    <div className="pointer-events-auto w-80 border-2 border-black bg-[#f4e8c8] text-[#1b1e26] shadow-[6px_6px_0_#000]">
      <div className="flex items-center justify-between border-b-2 border-black bg-[#33c1b1] px-3 py-2">
        <span className="text-sm font-black uppercase tracking-widest">Sunset Motors</span>
        <span className="-skew-x-6 border-2 border-black bg-[#2f8f4e] px-2 text-sm font-black text-[#eaffdd]">${cash.toLocaleString()}</span>
      </div>
      <div className="flex flex-col gap-1 p-3">
        {STOCK.map((car) => {
          const affordable = cash >= car.price;
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
              <span className="tabular-nums">${car.price.toLocaleString()}</span>
            </button>
          );
        })}
      </div>
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
