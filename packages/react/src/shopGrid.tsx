import { useEffect, useReducer, type CSSProperties, type ReactNode } from "react";

import { balance, type WalletState } from "@jgengine/core/economy/wallet";
import type { ShopPrice, ShopStock, ShopStockEntry } from "@jgengine/core/economy/shopStock";

import { GameIcon, iconForItemId, type GameIconName } from "./gameIcons";
import { HudFrame } from "./hudFrame";

/**
 * Subscribe to a shop's stock and re-render whenever it changes (buy, sell, restock, price, add,
 * remove, restore). Returns the current entry list — a detached snapshot safe to map over.
 *
 * @capability use-shop-stock React hook binding a shop-stock model — re-renders on any stock change and returns the entry list
 */
export function useShopStock(shop: ShopStock): ShopStockEntry[] {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => shop.subscribe(bump), [shop]);
  return shop.list();
}

/** Reskin tokens for {@link ShopGrid}. Falls back to shared `--jg-*` HudTheme tokens, then neutral defaults. */
export interface ShopGridTheme {
  /** Card background. Default reads `--jg-slot-bg`. */
  cardBg?: string;
  /** Card border. Default reads `--jg-slot-border`. */
  cardBorder?: string;
  /** Card corner radius. Default reads `--jg-slot-radius`. */
  cardRadius?: string;
  /** Accent for icons/prices/Buy button. Default reads `--jg-accent`. */
  accent?: string;
  /** Primary text color. */
  text?: string;
  /** Muted/secondary text color. */
  muted?: string;
  /** Font family. */
  fontFamily?: string;
}

function resolveTheme(theme: ShopGridTheme | undefined): Required<ShopGridTheme> {
  return {
    cardBg: theme?.cardBg ?? "var(--jg-slot-bg, rgba(12,14,20,0.72))",
    cardBorder: theme?.cardBorder ?? "var(--jg-slot-border, 1px solid rgba(255,255,255,0.12))",
    cardRadius: theme?.cardRadius ?? "var(--jg-slot-radius, 10px)",
    accent: theme?.accent ?? "var(--jg-accent, #38bdf8)",
    text: theme?.text ?? "#f1f5f9",
    muted: theme?.muted ?? "rgba(203,213,225,0.72)",
    fontFamily: theme?.fontFamily ?? "ui-sans-serif, system-ui, sans-serif",
  };
}

/** Default currency → icon mapping via {@link iconForItemId} (which knows "gold"/"gem"/… keywords). */
function currencyIcon(currency: string, override: Record<string, GameIconName> | undefined): GameIconName {
  return override?.[currency] ?? iconForItemId(currency) ?? "coin";
}

/** Default entry → icon mapping from the free-string `kind`, falling back to a chest. */
function entryIcon(entry: ShopStockEntry, iconFor: ((entry: ShopStockEntry) => GameIconName) | undefined): GameIconName {
  if (iconFor !== undefined) return iconFor(entry);
  return iconForItemId(entry.kind) ?? iconForItemId(entry.id) ?? "chest";
}

/** Props for {@link ShopGrid}. */
export interface ShopGridProps {
  /** The vendor stock model to render. */
  shop: ShopStock;
  /** The caller-owned wallet the grid buys/sells against. The shop never owns it. */
  wallet: WalletState;
  /** Called with the new wallet after a successful buy or sell — the caller adopts it. */
  onWalletChange: (wallet: WalletState) => void;
  /** Reskin tokens. */
  theme?: ShopGridTheme;
  /** Optional per-currency icon overrides, keyed by the free-string currency. */
  currencyIcons?: Record<string, GameIconName>;
  /** Optional entry→icon picker. Defaults to keyword matching on `kind`/`id`. */
  iconFor?: (entry: ShopStockEntry) => GameIconName;
  /** Show a Sell button on entries that carry a `sellPrice`. Default `false`. */
  showSell?: boolean;
  /**
   * Currencies to show in the wallet readout, in order. Default: every currency referenced by the
   * stock (prices + sell prices), in first-seen order.
   */
  walletCurrencies?: readonly string[];
  /** Panel header label. Default `"Shop"`. */
  title?: ReactNode;
  /** Human label for an entry — default is the capitalized `kind`. */
  labelFor?: (entry: ShopStockEntry) => ReactNode;
  /** Minimum card width (CSS length) for the responsive grid. Default `"140px"`. */
  minCardWidth?: string;
  className?: string;
  style?: CSSProperties;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

function referencedCurrencies(entries: readonly ShopStockEntry[]): string[] {
  const seen: string[] = [];
  const add = (currency: string): void => {
    if (!seen.includes(currency)) seen.push(currency);
  };
  for (const entry of entries) {
    add(entry.price.currency);
    if (entry.sellPrice !== undefined) add(entry.sellPrice.currency);
  }
  return seen;
}

function PriceTag({
  price,
  icon,
  accent,
  muted,
}: {
  price: ShopPrice;
  icon: GameIconName;
  accent: string;
  muted: string;
}): ReactNode {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: muted, fontVariantNumeric: "tabular-nums" }}>
      <GameIcon name={icon} size={15} color={accent} />
      <span style={{ fontWeight: 700, color: "inherit" }}>{price.amount}</span>
    </span>
  );
}

/**
 * A drop-in vendor/shop grid: item cards (icon, name, price with a currency glyph, stock count or
 * "∞") over a caller-owned wallet, plus a wallet balance readout. Each card's Buy button disables
 * when the wallet cannot afford it (`shop.canAfford`) or the item is sold out; an optional Sell
 * button appears for entries with a `sellPrice`. Buying/selling routes through the core shop model
 * and hands the debited/credited wallet back via `onWalletChange` — the component never owns the
 * wallet. Purely token-driven presentation (shared `--jg-*` HudTheme tokens, reskinnable via
 * {@link ShopGridTheme}); `kind` and `currency` are free strings the game styles, never interpreted.
 *
 * @capability shop-grid-host drop-in vendor/shop grid over a caller-owned wallet — item cards with icon/price/stock, afford-aware Buy, optional Sell, and a balance readout, token-themed
 */
export function ShopGrid({
  shop,
  wallet,
  onWalletChange,
  theme,
  currencyIcons,
  iconFor,
  showSell = false,
  walletCurrencies,
  title = "Shop",
  labelFor,
  minCardWidth = "140px",
  className,
  style,
}: ShopGridProps): ReactNode {
  const entries = useShopStock(shop);
  const t = resolveTheme(theme);
  const currencies = walletCurrencies ?? referencedCurrencies(entries);

  const onBuy = (entry: ShopStockEntry): void => {
    const result = shop.buy(entry.id, wallet);
    if (result.ok) onWalletChange(result.wallet);
  };
  const onSell = (entry: ShopStockEntry): void => {
    const result = shop.sell(entry.id, wallet);
    if (result.ok) onWalletChange(result.wallet);
  };

  const walletReadout: ReactNode = (
    <div data-shop-grid-wallet style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
      {currencies.map((currency) => (
        <span
          key={currency}
          data-shop-grid-balance={currency}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, color: t.text, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}
        >
          <GameIcon name={currencyIcon(currency, currencyIcons)} size={18} color={t.accent} />
          {balance(wallet, currency)}
        </span>
      ))}
    </div>
  );

  return (
    <HudFrame
      variation="themed"
      title={title}
      aside={walletReadout}
      interactive
      className={className}
      style={{ fontFamily: t.fontFamily, color: t.text, ...style }}
    >
      <div
        data-shop-grid
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill, minmax(${minCardWidth}, 1fr))`,
          gap: 10,
        }}
      >
        {entries.map((entry) => {
          const soldOut = entry.qty !== null && entry.qty <= 0;
          const affordable = shop.canAfford(entry.id, wallet);
          const buyDisabled = soldOut || !affordable;
          return (
            <div
              key={entry.id}
              data-shop-item={entry.id}
              data-kind={entry.kind}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: 10,
                background: t.cardBg,
                border: t.cardBorder,
                borderRadius: t.cardRadius,
                opacity: soldOut ? 0.55 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <div
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.28)",
                  }}
                >
                  <GameIcon name={entryIcon(entry, iconFor)} size={28} color={t.accent} />
                </div>
                <span
                  data-shop-item-qty
                  style={{ fontSize: 12, fontWeight: 700, color: t.muted, fontVariantNumeric: "tabular-nums" }}
                >
                  {entry.qty === null ? "∞" : `x${entry.qty}`}
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.text, lineHeight: 1.2 }}>
                {labelFor?.(entry) ?? capitalize(entry.kind)}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <PriceTag price={entry.price} icon={currencyIcon(entry.price.currency, currencyIcons)} accent={t.accent} muted={t.text} />
                {entry.sellPrice !== undefined ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: t.muted }}>
                    sell
                    <PriceTag price={entry.sellPrice} icon={currencyIcon(entry.sellPrice.currency, currencyIcons)} accent={t.muted} muted={t.muted} />
                  </span>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  data-shop-buy={entry.id}
                  disabled={buyDisabled}
                  onClick={() => onBuy(entry)}
                  style={{
                    flex: 1,
                    padding: "7px 8px",
                    borderRadius: 8,
                    border: "none",
                    fontWeight: 800,
                    fontSize: 12,
                    letterSpacing: "0.03em",
                    cursor: buyDisabled ? "not-allowed" : "pointer",
                    color: buyDisabled ? t.muted : "#0b1017",
                    background: buyDisabled ? "rgba(255,255,255,0.08)" : t.accent,
                  }}
                >
                  {soldOut ? "Sold Out" : "Buy"}
                </button>
                {showSell && entry.sellPrice !== undefined ? (
                  <button
                    type="button"
                    data-shop-sell={entry.id}
                    onClick={() => onSell(entry)}
                    style={{
                      padding: "7px 10px",
                      borderRadius: 8,
                      border: t.cardBorder,
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                      color: t.text,
                      background: "transparent",
                    }}
                  >
                    Sell
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </HudFrame>
  );
}
