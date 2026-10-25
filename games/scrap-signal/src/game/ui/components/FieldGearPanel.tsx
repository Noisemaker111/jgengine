import type { CSSProperties } from "react";
import { useGame } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { RARITY_COLORS } from "../../palette";
import { fieldGearStore } from "../../items/fieldGear";
import { Crt, Plate, Stamp } from "../fiction/kit";
import { PerkList } from "./Perks";

const STAT_LABEL: Record<string, string> = {
  damage: "damage",
  fireIntervalMs: "fire rate",
  spread: "spread",
  critChance: "crit",
  magSize: "mag",
  reloadMs: "reload",
};

function shown(stat: string, delta: number): string {
  if (stat === "critChance") return `${delta > 0 ? "+" : ""}${Math.round(delta * 100)}%`;
  if (stat === "fireIntervalMs" || stat === "reloadMs") return `${delta > 0 ? "+" : ""}${Math.round(delta)}ms`;
  return `${delta > 0 ? "+" : ""}${Math.round(delta * 10) / 10}`;
}

/** The loot scanner: what the gun on the ground would change, read off a tube, with three hard keys. */
export function FieldGearPanel() {
  const { commands } = useGame();
  const view = useStore(fieldGearStore);
  if (view === null) return null;
  const color = RARITY_COLORS[view.rarity as keyof typeof RARITY_COLORS] ?? "#d6d3d1";
  return (
    <Plate material="carbon" cut="notch" depth={12} rim="#4a3b29" padding="0" className="ss-stash" style={{ "--ss-rarity": color } as CSSProperties}>
      <span className="ss-stash-head">
        <Stamp tone="phosphor">Field stash</Stamp>
        <em>{view.runMass}/{view.runMass + Math.max(0, view.remaining)} carry</em>
      </span>
      <span className="ss-stash-name">{view.name}</span>
      <span className="ss-stash-sub">lvl {view.level} {view.rarity} {view.manufacturer}</span>
      <Crt className="ss-stash-tube">
        {view.deltas.map((delta) => (
          <span key={delta.stat} className="ss-stash-row">
            <span>{STAT_LABEL[delta.stat] ?? delta.stat}</span>
            <b className={delta.better === "candidate" ? "up" : delta.better === "equipped" ? "down" : ""}>{shown(delta.stat, delta.delta)}</b>
          </span>
        ))}
        {view.affixes.length > 0 ? <span className="ss-stash-affix">{view.affixes.join(" / ")}</span> : null}
        <span className={`ss-stash-verdict ${view.better === "candidate" ? "up" : view.better === "equipped" ? "down" : ""}`}>
          {view.better === "candidate" ? "▲ Upgrade" : view.better === "equipped" ? "▼ Worn gun is better" : "◆ Sidegrade"}
        </span>
      </Crt>
      <PerkList perks={view.perks} />
      <span className="ss-stash-keys">
        <Plate as="button" material="steel" cut="notch" depth={6} rim="#1b1f25" padding="0" className="ss-hwkey primary" disabled={!view.carried} onClick={() => commands.run("loot.equip", { dropId: view.dropId })}>Equip</Plate>
        <Plate as="button" material="steel" cut="notch" depth={6} rim="#1b1f25" padding="0" className="ss-hwkey" onClick={() => commands.run("loot.salvage", { dropId: view.dropId })}>Salvage</Plate>
        <Plate as="button" material="steel" cut="notch" depth={6} rim="#1b1f25" padding="0" className="ss-hwkey" disabled={!view.carried} onClick={() => commands.run("loot.bank", {})}>Bank</Plate>
      </span>
      <span className="ss-stash-foot">
        Stash {view.stash.length}
        {view.stash.length > 0 ? ` - ${view.stash.slice(-2).join(", ")}` : " - empty"}
      </span>
    </Plate>
  );
}
