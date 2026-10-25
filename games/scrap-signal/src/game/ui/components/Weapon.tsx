import type { CSSProperties } from "react";
import { GameIcon } from "@jgengine/react/gameIcons";
import { HudFade } from "@jgengine/react/hudFade";
import { useEntityStat, useGameStore, useInventory, usePlayer } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";
import { AMMO_LABELS, AMMO_STAT_IDS } from "../../ammo";
import { activePerkBuffs } from "../../combat/gunPerks";
import { gunById, isReloading, magLoaded, perkLines, type GunDef } from "../../handroll";
import { ELEMENT_COLORS, RARITY_COLORS } from "../../palette";
import { lastPickupStore, selectedSlotStore } from "../../stores";
import { Crt, Pips, Plate, SIGNAL, Stamp } from "../fiction/kit";
import { PerkBuffs, PerkList } from "./Perks";

export function useSelectedSlot(): number {
  return useStore(selectedSlotStore);
}

function useNowMs(): number {
  return useGameStore((ctx) => ctx.time.now() * 1000);
}

export function AmmoPlate({ combat = false }: { combat?: boolean }) {
  const ctx = useGameContext();
  const { userId } = usePlayer();
  const selected = useSelectedSlot();
  const slots = useInventory("hotbar");
  // Subscribe to the frame clock so the loaded count and reload state refresh live as the player fires;
  // magazine state is plain per-context data, not a reactive store, so this drives the re-read each frame.
  useNowMs();
  const stack = slots[selected] ?? null;
  const gun = stack === null ? undefined : gunById(stack.itemId);
  const reserve = useEntityStat(userId, AMMO_STAT_IDS[gun?.ammo ?? "pistol"]);
  const grenades = useEntityStat(userId, "grenades");

  if (gun === undefined) {
    return <Stamp tone="dim" className="ss-no-gun">No weapon · find a gun</Stamp>;
  }
  const loaded = magLoaded(ctx, gun);
  const reloading = isReloading(ctx, gun);
  const rarity = RARITY_COLORS[gun.rarity];
  const reserveCount = Math.round(reserve?.current ?? 0);
  const grenadeCount = Math.round(grenades?.current ?? 0);
  const buffs = activePerkBuffs(ctx, gun);
  return (
    <HudFade watch={[gun.id, loaded, reloading, reserveCount, grenadeCount]} hold={combat || reloading || loaded === 0} dimTo={0.5} idleMs={5000}>
      <Plate material="hull" tint="#283135" cut="notch" depth={12} rim="#34444a" padding="0" className="ss-ammo" style={{ "--ss-rarity": rarity } as CSSProperties}>
        <span className="ss-ammo-label">
          <b>{gun.name}</b>
          <small>
            {gun.manufacturer} {gun.family} · lv{gun.level} · {gun.weapon.damage} dmg
            {gun.element !== "none" ? <span style={{ color: ELEMENT_COLORS[gun.element] }}> · {gun.element}</span> : null}
          </small>
        </span>
        <span className="ss-ammo-body">
          <Crt className={`ss-ammo-tube ${reloading ? "reload" : loaded === 0 ? "empty" : ""}`}>
            <strong>{reloading ? "--" : String(loaded).padStart(2, "0")}</strong>
            <span>/ {reserveCount}</span>
          </Crt>
          <span className="ss-ammo-side">
            <span className="ss-grenades" title="Grenades"><GameIcon name="bomb" size={15} />{grenadeCount}</span>
            <span className="ss-ammo-pool">{AMMO_LABELS[gun.ammo]}</span>
          </span>
        </span>
        <Pips value={reloading ? 0 : loaded} max={gun.magSize} count={Math.min(gun.magSize, 24)} color={SIGNAL.amber} className="ss-mag" />
        <PerkBuffs buffs={buffs} />
        <span className="ss-ammo-foot">{reloading ? "Reloading…" : loaded === 0 ? "Empty · R to reload" : "R reload · G grenade"}</span>
      </Plate>
    </HudFade>
  );
}

/** The weapon cartridges slotted into the forearm rig; the live one rides up and lights. */
export function Hotbar({ combat = false }: { combat?: boolean }) {
  const selected = useSelectedSlot();
  const slots = useInventory("hotbar");
  const ids = [0, 1, 2, 3].map((index) => slots[index]?.itemId ?? "");
  return (
    <HudFade watch={[selected, ...ids]} hold={combat} dimTo={0.4} idleMs={4000}>
      <div className="ss-hotbar">
        {[0, 1, 2, 3].map((index) => {
          const stack = slots[index] ?? null;
          const gun = stack === null ? undefined : gunById(stack.itemId);
          const active = index === selected;
          return (
            <span key={index} className={`ss-cart ${active ? "active" : ""} ${gun === undefined ? "empty" : ""}`} style={{ "--ss-rarity": gun === undefined ? "#3b3f44" : RARITY_COLORS[gun.rarity] } as CSSProperties}>
              <span className="ss-cart-num">{index + 1}</span>
              <span className="ss-cart-label">{gun !== undefined ? gun.name : "empty"}</span>
            </span>
          );
        })}
      </div>
    </HudFade>
  );
}

/** The pickup scan: the new gun’s numbers on a tube for five seconds after it is picked up. */
export function ItemCard() {
  const nowMs = useNowMs();
  const pickup = useStore(lastPickupStore);
  if (pickup === null || nowMs - pickup.atMs > 5000) return null;
  const gun: GunDef | undefined = gunById(pickup.gunId);
  if (gun === undefined) return null;
  const rarity = RARITY_COLORS[gun.rarity];
  return (
    <Plate material="hull" tint="#283135" cut="notch" depth={12} rim="#34444a" padding="0" className="ss-scan" style={{ "--ss-rarity": rarity } as CSSProperties}>
      <span className="ss-scan-head"><Stamp tone="phosphor">Pickup scan</Stamp></span>
      <span className="ss-scan-name">{gun.name}</span>
      <span className="ss-scan-sub">{gun.rarity} {gun.manufacturer} {gun.family} · level {gun.level}</span>
      <Crt className="ss-scan-tube">
        <span>Damage</span><b>{gun.weapon.damage}{gun.weapon.pellets !== undefined ? ` ×${gun.weapon.pellets}` : ""}</b>
        <span>Fire rate</span><b>{(1000 / gun.weapon.fireIntervalMs).toFixed(1)}/s</b>
        <span>Magazine</span><b>{gun.magSize}</b>
        <span>Crit</span><b>{Math.round(gun.weapon.critChance * 100)}% ×{gun.weapon.critMult}</b>
        {gun.element !== "none" ? <><span style={{ color: ELEMENT_COLORS[gun.element] }}>Element</span><b style={{ color: ELEMENT_COLORS[gun.element] }}>{gun.element}</b></> : null}
      </Crt>
      <PerkList perks={perkLines(gun)} />
    </Plate>
  );
}
