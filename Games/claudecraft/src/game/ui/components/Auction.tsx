import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";
import { useGame, useGameStore, useInventory, usePlayer } from "@jgengine/react/hooks";
import { useState } from "react";

import type { AuctionView } from "../../auction/systems";
import { itemDefById } from "../../items/catalog";
import { CLOSE_BUTTON, copperLabel, PANEL, PANEL_TITLE, QUALITY_COLORS } from "../theme";

function formatExpiry(sec: number): string {
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function AuctionPanel() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const open = useGameStore((ctx) => ctx.game.store.get(`auction:${userId}`) === true);
  const view = useGameStore((ctx) => ctx.game.store.get(`auctionView:${userId}`) as AuctionView | undefined);
  const bags = useInventory("bags");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  if (!open) return null;

  const collectionTotal = Object.values(view?.collection.currency ?? {}).reduce((sum, amount) => sum + amount, 0);
  const collectionItemCount = view?.collection.items.length ?? 0;

  return (
    <div className={`${PANEL} pointer-events-auto w-[760px] max-h-[76vh] overflow-hidden`}>
      <div className={PANEL_TITLE}>
        <span>World Market</span>
        <button type="button" className={CLOSE_BUTTON} onClick={() => commands.run("auction.close", {})}>
          ✕
        </button>
      </div>
      <div className="flex max-h-[64vh] gap-4 overflow-y-auto px-4 py-3 text-sm">
        <div className="min-w-0 flex-[1.2]">
          <input
            type="text"
            value={view?.query ?? ""}
            onChange={(event) => commands.run("auction.search", { query: event.target.value })}
            placeholder="Search listings..."
            className="mb-2 w-full rounded border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200 outline-none focus:border-amber-600"
          />
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80">
            Listings ({view?.listings.length ?? 0})
          </h3>
          <div className="space-y-0.5">
            {(view?.listings.length ?? 0) === 0 ? (
              <p className="py-3 text-center text-xs text-stone-500">No listings</p>
            ) : (
              view?.listings.map((listing) => {
                const item = itemDefById(listing.itemId);
                if (item === null) return null;
                return (
                  <div
                    key={listing.id}
                    className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-stone-800/70"
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border border-stone-700 bg-stone-900 ${QUALITY_COLORS[item.quality]}`}
                    >
                      <GameIcon name={item.icon as GameIconName} size={16} />
                    </span>
                    <span className={`min-w-0 flex-1 truncate text-xs ${QUALITY_COLORS[item.quality]}`}>
                      {item.name}
                      {listing.count > 1 ? ` ×${listing.count}` : ""}
                      <span className="block truncate text-[10px] text-stone-500">{listing.sellerName}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-amber-300">{copperLabel(listing.price)}</span>
                    <button
                      type="button"
                      className="shrink-0 rounded border border-amber-800/70 bg-amber-950/50 px-2 py-0.5 text-[10px] text-amber-100 hover:bg-amber-900/50"
                      onClick={() => commands.run("auction.buy", { listingId: listing.id })}
                    >
                      Buy
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80">
              My Listings ({view?.mine.length ?? 0}/{view?.maxListings ?? 0})
            </h3>
            <div className="space-y-0.5">
              {(view?.mine.length ?? 0) === 0 ? (
                <p className="py-2 text-center text-xs text-stone-500">No active listings</p>
              ) : (
                view?.mine.map((listing) => {
                  const item = itemDefById(listing.itemId);
                  return (
                    <div
                      key={listing.id}
                      className="flex items-center gap-2 rounded bg-stone-900/60 px-1.5 py-1 text-xs"
                    >
                      <span className={`min-w-0 flex-1 truncate ${item !== null ? QUALITY_COLORS[item.quality] : ""}`}>
                        {item?.name ?? listing.itemId}
                        {listing.count > 1 ? ` ×${listing.count}` : ""}
                      </span>
                      <span className="shrink-0 text-amber-300">{copperLabel(listing.price)}</span>
                      <span className="shrink-0 text-stone-500">{formatExpiry(listing.expiresInSec)}</span>
                      <button
                        type="button"
                        className="shrink-0 rounded border border-stone-700 bg-stone-900/70 px-1.5 py-0.5 text-[10px] hover:bg-stone-800"
                        onClick={() => commands.run("auction.cancel", { listingId: listing.id })}
                      >
                        Cancel
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80">Post a Listing</h3>
            <div className="max-h-28 space-y-0.5 overflow-y-auto rounded border border-stone-800 p-1">
              {bags.every((slot) => slot === null) ? (
                <p className="py-2 text-center text-xs text-stone-500">Empty bags</p>
              ) : (
                bags.map((slot, index) => {
                  if (slot === null) return null;
                  const item = itemDefById(slot.itemId);
                  if (item === null) return null;
                  return (
                    <button
                      key={`${slot.itemId}-${index}`}
                      type="button"
                      onClick={() => setSelectedItemId(slot.itemId)}
                      className={`flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-xs ${
                        selectedItemId === slot.itemId ? "bg-amber-900/40" : "hover:bg-stone-800/70"
                      }`}
                    >
                      <span className={QUALITY_COLORS[item.quality]}>
                        {item.name}
                        {slot.count > 1 ? ` ×${slot.count}` : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                value={priceInput}
                onChange={(event) => setPriceInput(event.target.value)}
                placeholder="Price (copper)"
                className="w-28 rounded border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200 outline-none focus:border-amber-600"
              />
              <button
                type="button"
                disabled={selectedItemId === null || priceInput.trim().length === 0}
                className="rounded border border-amber-800/70 bg-amber-950/50 px-2 py-1 text-xs text-amber-100 hover:bg-amber-900/50 disabled:opacity-40"
                onClick={() => {
                  if (selectedItemId === null) return;
                  const price = Number(priceInput);
                  if (!Number.isFinite(price) || price <= 0) return;
                  commands.run("auction.list", { itemId: selectedItemId, count: 1, price: Math.floor(price) });
                  setSelectedItemId(null);
                  setPriceInput("");
                }}
              >
                List ×1
              </button>
            </div>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80">Collection Box</h3>
            <div className="flex items-center justify-between rounded bg-stone-900/60 px-2 py-1.5 text-xs">
              <span className="text-stone-300">
                {collectionTotal > 0 ? copperLabel(collectionTotal) : "No copper"}
                {collectionItemCount > 0 ? ` · ${collectionItemCount} item stack(s)` : ""}
              </span>
              <button
                type="button"
                className="rounded border border-amber-800/70 bg-amber-950/50 px-2 py-0.5 text-[10px] text-amber-100 hover:bg-amber-900/50"
                onClick={() => commands.run("auction.collect", {})}
              >
                Collect
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
