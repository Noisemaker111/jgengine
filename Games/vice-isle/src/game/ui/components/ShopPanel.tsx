import { useCurrency, useGame, useGameStore } from "@jgengine/react/hooks";
import { SHOP_STORE_KEY } from "../../commands";
import { WANTED_STORE_KEY, type WantedSnapshot } from "../../handroll";
import { GEAR, WEAPONS } from "../../items/weapons/catalog";
import { ITEM_LABELS } from "../../content";

const STOCK = [...WEAPONS, ...GEAR].filter((item) => item.trade?.buy !== undefined && item.trade.shops?.includes("shop_ammunation"));

function BribeButton() {
  const { commands } = useGame();
  const stars = useGameStore((ctx) => (ctx.game.store.get(WANTED_STORE_KEY) as WantedSnapshot | undefined)?.stars ?? 0);
  if (stars === 0) return null;
  return (
    <button
      type="button"
      onClick={() => commands.run("shop.bribe", {})}
      className="mx-3 mb-1 -skew-x-6 border-2 border-black bg-[#4f7de8] px-3 py-1 text-xs font-black uppercase text-white hover:bg-[#6b93f0]"
    >
      Bribe VCPD — ${stars * 250} clears {stars}★
    </button>
  );
}

export function ShopPanel() {
  const { commands } = useGame();
  const open = useGameStore((ctx) => (ctx.game.store.get(SHOP_STORE_KEY) as string | undefined) ?? null);
  const cash = useCurrency("cash");
  if (open === null) return null;
  return (
    <div className="pointer-events-auto w-80 border-2 border-black bg-[#f4e8c8] text-[#1b1e26] shadow-[6px_6px_0_#000]">
      <div className="flex items-center justify-between border-b-2 border-black bg-[#ffb020] px-3 py-2">
        <span className="text-sm font-black uppercase tracking-widest">Ammu-Isle</span>
        <span className="-skew-x-6 border-2 border-black bg-[#2f8f4e] px-2 text-sm font-black text-[#eaffdd]">${cash.toLocaleString()}</span>
      </div>
      <div className="flex flex-col gap-1 p-3">
        {STOCK.map((item) => {
          const price = item.trade?.buy?.cash ?? 0;
          const affordable = cash >= price;
          return (
            <button
              key={item.id}
              type="button"
              disabled={!affordable}
              onClick={() => commands.run("shop.buy", { item: item.id })}
              className={`flex items-center justify-between border-2 border-black px-2 py-1 text-left text-xs font-black uppercase ${
                affordable ? "bg-white hover:bg-[#ffe9bd]" : "bg-[#c9c2ad] text-black/40"
              }`}
            >
              <span>{ITEM_LABELS[item.id] ?? item.id}</span>
              <span className="tabular-nums">${price}</span>
            </button>
          );
        })}
      </div>
      <BribeButton />
      <button
        type="button"
        onClick={() => commands.run("shop.close", {})}
        className="m-3 mt-0 -skew-x-6 border-2 border-black bg-[#c23b3b] px-3 py-1 text-xs font-black uppercase text-white hover:bg-[#e35555]"
      >
        Leave
      </button>
    </div>
  );
}
