import { useEffect, type ReactNode } from "react";
import { useCurrency, useGame, useGameStore, useInventory } from "@jgengine/react/hooks";
import { AMMO_LABELS, AMMO_POOLS } from "../../ammo";
import { gearById } from "../../items/gear/catalog";
import { AMMO_PRICES, GEAR_STOCK, MYSTERY_CRATE, stationById } from "../../objects/stations";
import { GrenadeIcon, MedkitIcon } from "./icons";

function BuyRow({
  label,
  detail,
  cost,
  affordable,
  onBuy,
  icon,
}: {
  label: string;
  detail?: string;
  cost: number;
  affordable: boolean;
  onBuy: () => void;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onBuy}
      disabled={!affordable}
      className={`flex min-h-12 w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
        affordable
          ? "border-slate-600/60 bg-slate-900/70 hover:border-cyan-400/60 hover:bg-slate-800/80"
          : "cursor-not-allowed border-slate-800 bg-slate-950/60 opacity-50"
      }`}
    >
      {icon}
      <span className="flex-1">
        <span className="block text-sm font-bold uppercase tracking-wider text-slate-100">{label}</span>
        {detail !== undefined ? <span className="block text-xs text-slate-400">{detail}</span> : null}
      </span>
      <span className="text-sm font-black tabular-nums text-amber-300">{cost} ◈</span>
    </button>
  );
}

export function ShopPanel() {
  const { commands } = useGame();
  const stationId = useGameStore((ctx) => ctx.game.store.get("shopOpen") as string | undefined);
  const scrap = useCurrency("scrap");
  const backpack = useInventory("backpack");
  const open = stationId !== undefined;

  useEffect(() => {
    if (open && typeof document !== "undefined" && document.exitPointerLock !== undefined) {
      document.exitPointerLock();
    }
  }, [open]);

  if (!open) return null;
  const station = stationById(stationId);
  const close = () => commands.run("shop.close", {});
  const backpackFull = backpack.every((slotEntry) => slotEntry !== null);

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/55">
      <div className="w-[26rem] max-w-[92vw] rounded-lg border border-slate-600/60 bg-slate-950/95 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
          <div>
            <div className="text-sm font-black uppercase tracking-[0.2em] text-cyan-100">
              {station?.name ?? "Requisition"}
            </div>
            <div className="text-xs font-semibold text-amber-300">{scrap} ◈ scrap</div>
          </div>
          <button
            type="button"
            onClick={close}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-600 text-lg font-bold text-slate-300 hover:bg-slate-800"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-4 py-4">
          <div>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Ammo</div>
            <div className="space-y-1.5">
              {AMMO_POOLS.map((pool) => (
                <BuyRow
                  key={pool}
                  label={`${AMMO_LABELS[pool]} +${AMMO_PRICES[pool].amount}`}
                  cost={AMMO_PRICES[pool].scrap}
                  affordable={scrap >= AMMO_PRICES[pool].scrap}
                  onBuy={() => commands.run("shop.buyAmmo", { pool })}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Gear</div>
            <div className="space-y-1.5">
              {GEAR_STOCK.map((itemId) => {
                const gear = gearById(itemId);
                if (gear?.trade === undefined) return null;
                const cost = gear.trade.buy.scrap ?? 0;
                return (
                  <BuyRow
                    key={itemId}
                    label={gear.name}
                    detail={gear.heal !== undefined ? `Restores ${gear.heal} health` : "Thrown explosive"}
                    cost={cost}
                    affordable={scrap >= cost && !backpackFull}
                    onBuy={() => commands.run("shop.buyGear", { itemId })}
                    icon={
                      gear.use === "throwGrenade" ? (
                        <GrenadeIcon className="h-6 w-6 text-amber-300" />
                      ) : (
                        <MedkitIcon className="h-6 w-6 text-emerald-300" />
                      )
                    }
                  />
                );
              })}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Gamble</div>
            <BuyRow
              label="Mystery Crate"
              detail="One weapon, rare or better — beam included"
              cost={MYSTERY_CRATE.scrap}
              affordable={scrap >= MYSTERY_CRATE.scrap}
              onBuy={() => commands.run("shop.mystery", { station: stationId })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
