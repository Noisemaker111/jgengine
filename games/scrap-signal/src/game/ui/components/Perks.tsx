import type { PerkLine } from "../../handroll";
import { Plate, Stamp } from "../fiction/kit";

/**
 * A gun's perks on a card: a named legendary's signature in red text with its flavor line and the boss
 * that farms it, rolled perks as stamped steel chips with their one-line read.
 */
export function PerkList({ perks }: { perks: readonly PerkLine[] | undefined }) {
  // A field stash stored before perks existed (an older save) carries none.
  if (perks === undefined || perks.length === 0) return null;
  return (
    <span className="ss-perks">
      {perks.map((perk) =>
        perk.signature ? (
          <span key={perk.id} className="ss-perk-red">
            <em>"{perk.flavor}"</em>
            <b>{perk.name}</b>
            <small>{perk.text}</small>
            {perk.dropsFrom !== undefined ? <Stamp tone="dim" className="ss-perk-src">Drops from {perk.dropsFrom}</Stamp> : null}
          </span>
        ) : (
          <Plate key={perk.id} material="steel" cut="notch" depth={5} rim="#1b1f25" padding="0" className="ss-perk-chip">
            <b>{perk.name}</b>
            <small>{perk.text}</small>
          </Plate>
        ),
      )}
    </span>
  );
}

/** Live perk buffs on the held gun: "RAMPAGE x2 · 3s" stamps under the magazine. */
export function PerkBuffs({ buffs }: { buffs: readonly { label: string; stacks: number; leftMs: number }[] }) {
  if (buffs.length === 0) return null;
  return (
    <span className="ss-perk-buffs">
      {buffs.map((buff) => (
        <Stamp key={buff.label} tone="red">
          {buff.label}
          {buff.stacks > 1 ? ` x${buff.stacks}` : ""} · {Math.ceil(buff.leftMs / 1000)}s
        </Stamp>
      ))}
    </span>
  );
}
