import { iconForItemId } from "@jgengine/react/gameIcons";
import { HudFade } from "@jgengine/react/hudFade";
import { useEntityStat, useGame, useInventory, usePlayer } from "@jgengine/react/hooks";
import { IconTreatment, schoolForItem } from "@jgengine/react/iconTreatment";
import { actionGlyph, useInputDevice } from "@jgengine/react/inputDevice";
import { useStore } from "@jgengine/react/store";
import { slotStore } from "../../commands";
import { ITEM_LABELS } from "../../content";
import { AMMO_STAT_IDS, weaponById } from "../../items/weapons/catalog";
import { keybinds } from "../../keybinds";

/**
 * What you carry, as the pockets of a courier's belt: each filled slot a small dark pouch with its
 * item, the rounds left on an amber tab and the key that draws it. The held one sits up and glows; the
 * belt dims while nothing changes. Tappable on touch.
 */
export function Hotbar() {
  const { userId } = usePlayer();
  const { commands } = useGame();
  const device = useInputDevice();
  const slots = useInventory("hotbar");
  const selected = useStore(slotStore, (v) => v ?? 0);
  const ammo = { ammo_9mm: useEntityStat(userId, "ammo_9mm")?.current, ammo_shell: useEntityStat(userId, "ammo_shell")?.current };
  const filled = slots.slice(0, 4).map((slot, index) => ({ itemId: slot?.itemId ?? null, index })).filter((slot): slot is { itemId: string; index: number } => slot.itemId !== null);
  if (filled.length === 0) return null;
  return (
    <HudFade watch={[selected, ammo.ammo_9mm, ammo.ammo_shell, filled.length]} idleMs={5000} dimTo={0.62} className="hh-belt">
      {filled.map(({ itemId, index }) => {
        const weapon = weaponById(itemId);
        const rounds = weapon === undefined || weapon.ammo === "none" ? undefined : ammo[AMMO_STAT_IDS[weapon.ammo] as keyof typeof ammo];
        const action = `selectSlot${index + 1}`;
        const glyph = device === "touch" ? null : actionGlyph(keybinds, action, device);
        const label = ITEM_LABELS[itemId] ?? itemId;
        return (
          <button key={index} type="button" className="hh-pouch" aria-pressed={index === selected} aria-label={label} onClick={() => commands.run(action, {})}>
            {glyph === null ? null : <kbd className="hh-pouch-key">{glyph}</kbd>}
            <IconTreatment icon={iconForItemId(itemId) ?? "gun"} school={schoolForItem(itemId)} size={26} />
            <small className="hh-pouch-name">{label}</small>
            {rounds === undefined ? null : <b className="hh-pouch-ammo">{rounds}</b>}
          </button>
        );
      })}
    </HudFade>
  );
}
