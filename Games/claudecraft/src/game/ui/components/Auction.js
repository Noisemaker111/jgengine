import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useGame, useGameStore, useInventory, usePlayer } from "@jgengine/react/hooks";
import { formatDurationCompact } from "@jgengine/core/format/duration";
import { useState } from "react";
import { itemDefById } from "../../items/catalog";
import { CLOSE_BUTTON, copperLabel, PANEL, PANEL_TITLE, QUALITY_COLORS } from "../theme";
export function AuctionPanel() {
    const { commands } = useGame();
    const { userId } = usePlayer();
    const open = useGameStore((ctx) => ctx.game.store.get(`auction:${userId}`) === true);
    const view = useGameStore((ctx) => ctx.game.store.get(`auctionView:${userId}`));
    const bags = useInventory("bags");
    const [selectedItemId, setSelectedItemId] = useState(null);
    const [priceInput, setPriceInput] = useState("");
    if (!open)
        return null;
    const collectionTotal = Object.values(view?.collection.currency ?? {}).reduce((sum, amount) => sum + amount, 0);
    const collectionItemCount = view?.collection.items.length ?? 0;
    return (_jsxs("div", { className: `${PANEL} pointer-events-auto w-[760px] max-h-[76vh] overflow-hidden`, children: [_jsxs("div", { className: PANEL_TITLE, children: [_jsx("span", { children: "World Market" }), _jsx("button", { type: "button", className: CLOSE_BUTTON, onClick: () => commands.run("auction.close", {}), children: "\u2715" })] }), _jsxs("div", { className: "flex max-h-[64vh] gap-4 overflow-y-auto px-4 py-3 text-sm", children: [_jsxs("div", { className: "min-w-0 flex-[1.2]", children: [_jsx("input", { type: "text", value: view?.query ?? "", onChange: (event) => commands.run("auction.search", { query: event.target.value }), placeholder: "Search listings...", className: "mb-2 w-full rounded border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200 outline-none focus:border-amber-600" }), _jsxs("h3", { className: "mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80", children: ["Listings (", view?.listings.length ?? 0, ")"] }), _jsx("div", { className: "space-y-0.5", children: (view?.listings.length ?? 0) === 0 ? (_jsx("p", { className: "py-3 text-center text-xs text-stone-500", children: "No listings" })) : (view?.listings.map((listing) => {
                                    const item = itemDefById(listing.itemId);
                                    if (item === null)
                                        return null;
                                    return (_jsxs("div", { className: "flex items-center gap-2 rounded px-1.5 py-1 hover:bg-stone-800/70", children: [_jsx("span", { className: `flex h-7 w-7 shrink-0 items-center justify-center rounded border border-stone-700 bg-stone-900 ${QUALITY_COLORS[item.quality]}`, children: _jsx(GameIcon, { name: item.icon, size: 16 }) }), _jsxs("span", { className: `min-w-0 flex-1 truncate text-xs ${QUALITY_COLORS[item.quality]}`, children: [item.name, listing.count > 1 ? ` ×${listing.count}` : "", _jsx("span", { className: "block truncate text-[10px] text-stone-500", children: listing.sellerName })] }), _jsx("span", { className: "shrink-0 text-[11px] text-amber-300", children: copperLabel(listing.price) }), _jsx("button", { type: "button", className: "shrink-0 rounded border border-amber-800/70 bg-amber-950/50 px-2 py-0.5 text-[10px] text-amber-100 hover:bg-amber-900/50", onClick: () => commands.run("auction.buy", { listingId: listing.id }), children: "Buy" })] }, listing.id));
                                })) })] }), _jsxs("div", { className: "min-w-0 flex-1 space-y-3", children: [_jsxs("div", { children: [_jsxs("h3", { className: "mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80", children: ["My Listings (", view?.mine.length ?? 0, "/", view?.maxListings ?? 0, ")"] }), _jsx("div", { className: "space-y-0.5", children: (view?.mine.length ?? 0) === 0 ? (_jsx("p", { className: "py-2 text-center text-xs text-stone-500", children: "No active listings" })) : (view?.mine.map((listing) => {
                                            const item = itemDefById(listing.itemId);
                                            return (_jsxs("div", { className: "flex items-center gap-2 rounded bg-stone-900/60 px-1.5 py-1 text-xs", children: [_jsxs("span", { className: `min-w-0 flex-1 truncate ${item !== null ? QUALITY_COLORS[item.quality] : ""}`, children: [item?.name ?? listing.itemId, listing.count > 1 ? ` ×${listing.count}` : ""] }), _jsx("span", { className: "shrink-0 text-amber-300", children: copperLabel(listing.price) }), _jsx("span", { className: "shrink-0 text-stone-500", children: formatDurationCompact(listing.expiresInSec) }), _jsx("button", { type: "button", className: "shrink-0 rounded border border-stone-700 bg-stone-900/70 px-1.5 py-0.5 text-[10px] hover:bg-stone-800", onClick: () => commands.run("auction.cancel", { listingId: listing.id }), children: "Cancel" })] }, listing.id));
                                        })) })] }), _jsxs("div", { children: [_jsx("h3", { className: "mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80", children: "Post a Listing" }), _jsx("div", { className: "max-h-28 space-y-0.5 overflow-y-auto rounded border border-stone-800 p-1", children: bags.every((slot) => slot === null) ? (_jsx("p", { className: "py-2 text-center text-xs text-stone-500", children: "Empty bags" })) : (bags.map((slot, index) => {
                                            if (slot === null)
                                                return null;
                                            const item = itemDefById(slot.itemId);
                                            if (item === null)
                                                return null;
                                            return (_jsx("button", { type: "button", onClick: () => setSelectedItemId(slot.itemId), className: `flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-xs ${selectedItemId === slot.itemId ? "bg-amber-900/40" : "hover:bg-stone-800/70"}`, children: _jsxs("span", { className: QUALITY_COLORS[item.quality], children: [item.name, slot.count > 1 ? ` ×${slot.count}` : ""] }) }, `${slot.itemId}-${index}`));
                                        })) }), _jsxs("div", { className: "mt-1.5 flex items-center gap-1.5", children: [_jsx("input", { type: "number", min: 1, value: priceInput, onChange: (event) => setPriceInput(event.target.value), placeholder: "Price (copper)", className: "w-28 rounded border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200 outline-none focus:border-amber-600" }), _jsx("button", { type: "button", disabled: selectedItemId === null || priceInput.trim().length === 0, className: "rounded border border-amber-800/70 bg-amber-950/50 px-2 py-1 text-xs text-amber-100 hover:bg-amber-900/50 disabled:opacity-40", onClick: () => {
                                                    if (selectedItemId === null)
                                                        return;
                                                    const price = Number(priceInput);
                                                    if (!Number.isFinite(price) || price <= 0)
                                                        return;
                                                    commands.run("auction.list", { itemId: selectedItemId, count: 1, price: Math.floor(price) });
                                                    setSelectedItemId(null);
                                                    setPriceInput("");
                                                }, children: "List \u00D71" })] })] }), _jsxs("div", { children: [_jsx("h3", { className: "mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80", children: "Collection Box" }), _jsxs("div", { className: "flex items-center justify-between rounded bg-stone-900/60 px-2 py-1.5 text-xs", children: [_jsxs("span", { className: "text-stone-300", children: [collectionTotal > 0 ? copperLabel(collectionTotal) : "No copper", collectionItemCount > 0 ? ` · ${collectionItemCount} item stack(s)` : ""] }), _jsx("button", { type: "button", className: "rounded border border-amber-800/70 bg-amber-950/50 px-2 py-0.5 text-[10px] text-amber-100 hover:bg-amber-900/50", onClick: () => commands.run("auction.collect", {}), children: "Collect" })] })] })] })] })] }));
}
