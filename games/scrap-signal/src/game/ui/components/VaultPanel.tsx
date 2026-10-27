import { useEffect } from "react";
import { HudButton } from "@jgengine/core/hud/hudButton.view";
import { useGame, useInventory } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { gunById } from "../../handroll";
import { VAULT, vaultOpenStore } from "../../items/vault";
import { RARITY_COLORS } from "../../palette";
import { ScrapPanel } from "./ScrapPanel";

function GunRow({ itemId, action, onClick }: { itemId: string; action: string; onClick: () => void }) {
  const gun = gunById(itemId);
  if (gun === undefined) return null;
  return (
    <HudButton block onClick={onClick} className="scrap-row scrap-row-amber">
      <span className="flex-1">
        <span className="block text-sm font-bold uppercase tracking-wider" style={{ color: RARITY_COLORS[gun.rarity] }}>{gun.name}</span>
        <span className="block text-[11px] text-stone-400">
          lvl {gun.level} {gun.rarity} {gun.manufacturer} {gun.family}{gun.element === "none" ? "" : ` · ${gun.element}`} · {gun.weapon.damage} dmg
        </span>
      </span>
      <span className="text-xs font-black uppercase text-amber-300">{action}</span>
    </HudButton>
  );
}

/** The Coretown vault: store the guns you are not carrying, take them back when you want them. */
export function VaultPanel() {
  const { commands } = useGame();
  const open = useStore(vaultOpenStore);
  const hotbar = useInventory("hotbar");
  const vault = useInventory(VAULT);
  useEffect(() => {
    if (open && typeof document !== "undefined" && document.exitPointerLock !== undefined) document.exitPointerLock();
  }, [open]);
  if (!open) return null;
  const stored = vault.filter((slot) => slot !== null);
  return (
    <ScrapPanel title="Coretown Vault" onClose={() => commands.run("vault.close", {})}>
      <span className="text-xs font-black uppercase tracking-widest text-stone-400">Carried</span>
      <div className="mt-1 mb-3 flex flex-col gap-1.5">
        {hotbar.map((slot, index) =>
          slot === null ? null : (
            <GunRow key={`h${index}`} itemId={slot.itemId} action="Store" onClick={() => commands.run("vault.deposit", { slot: index })} />
          ),
        )}
      </div>
      <span className="text-xs font-black uppercase tracking-widest text-stone-400">In the vault · {stored.length}/{vault.length}</span>
      <div className="mt-1 flex flex-col gap-1.5">
        {stored.length === 0 ? <span className="text-[12px] text-stone-500">Empty</span> : null}
        {vault.map((slot, index) =>
          slot === null ? null : (
            <GunRow key={`v${index}`} itemId={slot.itemId} action="Take" onClick={() => commands.run("vault.withdraw", { itemId: slot.itemId })} />
          ),
        )}
      </div>
    </ScrapPanel>
  );
}
