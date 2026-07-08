import { useState, type CSSProperties, type ReactNode } from "react";

import { HudPanel } from "@/components/ui/hud-panel";

export type RarityTierName = "common" | "uncommon" | "rare" | "epic" | "legendary";

const chamfer = (cut: number) =>
  `polygon(${cut}px 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, ${cut}px 100%, 0 calc(100% - ${cut}px), 0 ${cut}px)`;

const rarityColor = (rarity: RarityTierName | undefined) => `var(--jg-rarity-${rarity ?? "common"})`;

function HoverButton({
  onClick,
  disabled,
  style,
  hoverStyle,
  dataJg,
  className,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  style: CSSProperties;
  hoverStyle: CSSProperties;
  dataJg?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      data-jg={dataJg}
      className={className}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...style, ...(hovered && disabled !== true ? hoverStyle : {}) }}
    >
      {children}
    </button>
  );
}

function IconWell({ size, children }: { size: number; children?: ReactNode }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        clipPath: chamfer(5),
        border: "1px solid var(--jg-edge-bright)",
        background: "linear-gradient(180deg, var(--jg-surface) 0%, var(--jg-surface-deep) 100%)",
      }}
    >
      {children}
    </div>
  );
}

function CoinGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="var(--jg-accent)" />
      <circle cx="12" cy="12" r="8.2" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
    </svg>
  );
}

export interface VendorListing {
  id: string;
  icon?: ReactNode;
  name: string;
  rarity?: RarityTierName;
  price: number;
  priceIcon?: ReactNode;
  affordable?: boolean;
  stock?: number;
}

export function VendorPanel({
  title = "Vendor",
  listings,
  balance,
  onBuy,
  width = 340,
  className,
}: {
  title?: string;
  listings: readonly VendorListing[];
  balance?: { amount: number; icon?: ReactNode };
  onBuy?: (id: string) => void;
  width?: number;
  className?: string;
}) {
  return (
    <div className={className} data-jg="vendor-panel">
      <HudPanel
        title={title}
        width={width}
        actions={
          balance !== undefined ? (
            <span className="flex items-center gap-1">
              {balance.icon ?? <CoinGlyph />}
              <span className="font-mono text-xs font-bold" style={{ color: "var(--jg-text)" }}>
                {balance.amount}
              </span>
            </span>
          ) : undefined
        }
      >
        <div className="flex flex-col">
          {listings.map((listing, index) => {
            const color = rarityColor(listing.rarity);
            const affordable = listing.affordable ?? true;
            return (
              <HoverButton
                key={listing.id}
                dataJg="vendor-row"
                disabled={!affordable}
                onClick={onBuy === undefined ? undefined : () => onBuy(listing.id)}
                className={`flex w-full items-center gap-2 px-1 py-1.5 text-left ${affordable ? "cursor-pointer" : "cursor-not-allowed"}`}
                style={{
                  border: "none",
                  background: index % 2 === 1 ? "rgba(255,255,255,0.025)" : "transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  color: "var(--jg-text)",
                }}
                hoverStyle={{ background: "rgba(255,255,255,0.04)" }}
              >
                <IconWell size={34}>{listing.icon}</IconWell>
                <span className="flex min-w-0 flex-1 items-baseline gap-1">
                  <span
                    className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold"
                    style={{ color }}
                  >
                    {listing.name}
                  </span>
                  {listing.stock !== undefined && (
                    <span className="shrink-0 font-mono text-[10.5px]" style={{ color: "var(--jg-text-dim)" }}>
                      ×{listing.stock}
                    </span>
                  )}
                </span>
                <span
                  className="flex shrink-0 items-center gap-1 font-mono text-xs font-bold"
                  style={{ color: affordable ? "var(--jg-accent)" : "color-mix(in srgb, var(--jg-danger) 60%, transparent)" }}
                >
                  {listing.priceIcon ?? <CoinGlyph />}
                  {listing.price}
                </span>
              </HoverButton>
            );
          })}
        </div>
      </HudPanel>
    </div>
  );
}
