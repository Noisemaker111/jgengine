import { useEffect } from "react";
import { useCurrency, useGame } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { HudButton } from "@jgengine/react/hudButton";
import { AMMO_LABELS, AMMO_POOLS } from "../../ammo";
import { gearItems, AMMO_PRICES } from "../../items/gear/catalog";
import { FERRALON } from "../../palette";
import { ScrapPanel } from "./ScrapPanel";
import { Pips, SIGNAL } from "../fiction/kit";
import { reserveStore, ruskDownStore, vendorOpenStore } from "../../stores";

/** The emergency reserve: the rig’s tube flashes a reboot countdown across the middle of the view. */
export function ReserveOverlay() {
  const reserve = useStore(reserveStore);
  if (reserve.phase !== "downed") return null;
  const secondsLeft = reserve.secondsLeft;
  return (
    <div className="ss-reserve" role="alert">
      <div className="ss-reserve-bleed" />
      <span className="ss-reserve-title">Reboot Window!</span>
      <Pips value={secondsLeft} max={12} count={12} color={SIGNAL.red} className="ss-reserve-pips" />
      <span className="ss-reserve-hint">Get a kill for a Power Surge — {secondsLeft.toFixed(1)}s</span>
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

function BuyRow({ label, detail, cost, affordable, onBuy }: { label: string; detail?: string; cost: number; affordable: boolean; onBuy: () => void }) {
  return (
    <HudButton block onClick={onBuy} disabled={!affordable} className="scrap-row scrap-row-amber">
      <span className="flex-1">
        <span className="block text-sm font-bold uppercase tracking-wider text-stone-100">{label}</span>
        {detail !== undefined ? <span className="block text-[11px] text-stone-400">{detail}</span> : null}
      </span>
      <span className="text-sm font-black tabular-nums" style={{ color: FERRALON.hudXp }}>
        ${cost}
      </span>
    </HudButton>
  );
}

export function VendorPanel() {
  const { commands } = useGame();
  const vendor = useStore(vendorOpenStore);
  const cash = useCurrency("cash");
  const ruskDown = useStore(ruskDownStore);
  const open = vendor !== null;
  useCloseOnOpen(open);
  if (!open) return null;
  const close = () => commands.run("vendor.close", {});

  if (vendor === "bolt") {
    return (
      <ScrapPanel title="B0-LT Steward Bot" closeLabel="Close [Esc]" onClose={close}>
        <p className="text-sm font-semibold leading-relaxed text-stone-200">
          {ruskDown
            ? "Rusk’s blockade is down. The stolen modules are back on the relay, and Coretown can hear us again. Follow the signal toward the reactor or recover more equipment here."
            : "Reclaimer, our relay parts are scattered east of camp. Ripper drones stripped the repair stock, and Rusk’s blockade has cut off the recovery crews. Your mission log marks the next job."}
        </p>
        <p className="mt-3 text-[11px] uppercase tracking-wider text-stone-500">Missions track on the left of your HUD</p>
      </ScrapPanel>
    );
  }

  if (vendor === "sparx") {
    return (
      <ScrapPanel title="Dr. Sparx's Meds" closeLabel="Close [Esc]" onClose={close}>
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
      </ScrapPanel>
    );
  }

  return (
    <ScrapPanel title="Rigg Munitions" closeLabel="Close [Esc]" onClose={close}>
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
          detail="A mystery roll from Rigg's back room"
          cost={300}
          affordable={cash >= 300}
          onBuy={() => commands.run("vendor.gunOfTheDay", { vendor: "rigg" })}
        />
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-wider text-stone-500">No refunds.</p>
    </ScrapPanel>
  );
}
