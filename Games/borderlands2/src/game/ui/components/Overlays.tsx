import { useEffect } from "react";
import { useCurrency, useGame, useGameStore } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { AMMO_LABELS, AMMO_POOLS } from "../../ammo";
import { gearItems, AMMO_PRICES } from "../../items/gear/catalog";
import { PANDORA } from "../../palette";
import { ffylStore, flyntDownStore, vendorOpenStore } from "../../stores";

export function FfylOverlay() {
  const nowMs = useGameStore((ctx) => ctx.time.now() * 1000);
  const ffyl = useStore(ffylStore);
  if (ffyl.phase !== "downed") return null;
  const secondsLeft = Math.max(0, (ffyl.untilMs - nowMs) / 1000);
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center">
      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 180px 60px rgba(160, 20, 10, 0.75)" }} />
      <span className="animate-pulse text-4xl font-black uppercase tracking-[0.2em] text-rose-500 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
        Fight For Your Life!
      </span>
      <span className="mt-2 text-lg font-bold text-stone-100">
        Get a kill for a Second Wind — {secondsLeft.toFixed(1)}s
      </span>
    </div>
  );
}

function useCloseOnOpen(open: boolean): void {
  useEffect(() => {
    if (open && typeof document !== "undefined" && document.exitPointerLock !== undefined) {
      document.exitPointerLock();
    }
  }, [open]);
}

function PanelFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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
            Close [Esc]
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BuyRow({ label, detail, cost, affordable, onBuy }: { label: string; detail?: string; cost: number; affordable: boolean; onBuy: () => void }) {
  return (
    <button
      type="button"
      onClick={onBuy}
      disabled={!affordable}
      className={`flex w-full items-center gap-3 border px-3 py-2 text-left transition-colors ${
        affordable
          ? "border-stone-700 bg-stone-900/80 hover:border-amber-400/70 hover:bg-stone-800"
          : "cursor-not-allowed border-stone-800 bg-stone-950/60 opacity-50"
      }`}
    >
      <span className="flex-1">
        <span className="block text-sm font-bold uppercase tracking-wider text-stone-100">{label}</span>
        {detail !== undefined ? <span className="block text-[11px] text-stone-400">{detail}</span> : null}
      </span>
      <span className="text-sm font-black tabular-nums" style={{ color: PANDORA.hudXp }}>
        ${cost}
      </span>
    </button>
  );
}

export function VendorPanel() {
  const { commands } = useGame();
  const vendor = useStore(vendorOpenStore);
  const cash = useCurrency("cash");
  const flyntDown = useStore(flyntDownStore);
  const open = vendor !== null;
  useCloseOnOpen(open);
  if (!open) return null;
  const close = () => commands.run("vendor.close", {});

  if (vendor === "claptrap") {
    return (
      <PanelFrame title="CL4P-TP Steward Bot" onClose={close}>
        <p className="text-sm font-semibold leading-relaxed text-stone-200">
          {flyntDown
            ? "OH MY GOD YOU ACTUALLY DID IT. Captain Flynt is dead and I am ALIVE. Sanctuary awaits, minion! (This demake ends here — go hunt legendaries.)"
            : "Minion! Bandits took over the camp east of here, the skags are eating my spare parts, and a horrible man named Captain Flynt keeps threatening to melt me. Check your mission log — and try not to die, it looks painful."}
        </p>
        <p className="mt-3 text-[11px] uppercase tracking-wider text-stone-500">Missions track on the left of your HUD</p>
      </PanelFrame>
    );
  }

  if (vendor === "zed") {
    return (
      <PanelFrame title="Dr. Zed's Meds" onClose={close}>
        <div className="flex flex-col gap-1.5">
          {gearItems
            .filter((item) => item.trade !== undefined && item.kind !== "ammo")
            .map((item) => (
              <BuyRow
                key={item.id}
                label={item.name}
                detail={item.kind === "health" ? `Restores ${item.heal} health` : "+25 max shield"}
                cost={item.trade?.buy.cash ?? 0}
                affordable={cash >= (item.trade?.buy.cash ?? 0)}
                onBuy={() => commands.run("vendor.buyGear", { itemId: item.id })}
              />
            ))}
        </div>
      </PanelFrame>
    );
  }

  return (
    <PanelFrame title="Marcus Munitions" onClose={close}>
      <div className="flex flex-col gap-1.5">
        {AMMO_POOLS.map((pool) => (
          <BuyRow
            key={pool}
            label={`${AMMO_LABELS[pool]} ammo`}
            detail={`+${AMMO_PRICES[pool].amount} rounds`}
            cost={AMMO_PRICES[pool].cash}
            affordable={cash >= AMMO_PRICES[pool].cash}
            onBuy={() => commands.run("vendor.buyAmmo", { pool })}
          />
        ))}
        <BuyRow
          label="Gun of the day"
          detail="A mystery roll from Marcus's back room"
          cost={300}
          affordable={cash >= 300}
          onBuy={() => commands.run("vendor.gunOfTheDay", { vendor: "marcus" })}
        />
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-wider text-stone-500">No refunds.</p>
    </PanelFrame>
  );
}
