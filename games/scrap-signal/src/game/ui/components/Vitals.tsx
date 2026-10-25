import type { CSSProperties } from "react";
import { HudFade } from "@jgengine/react/hudFade";
import { useEntityStat, usePlayer } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { CHARACTERS } from "../../characters";
import { characterIdStore } from "../../stores";
import { Crt, Pips, Plate, SIGNAL, Stamp } from "../fiction/kit";

const PIPS = 12;

/**
 * The reclaimer's wrist unit: level stamp and chassis tag on the housing, shield and health as lit
 * pip rows on the tube, experience as a thin trace under them. It steps back out of a fight and
 * holds full strength while hostiles are near, the shield is recharging or health is low.
 */
export function VitalsPlate({ combat = false }: { combat?: boolean }) {
  const { userId } = usePlayer();
  const level = useEntityStat(userId, "level");
  const skillPoints = useEntityStat(userId, "skillPoints");
  const shield = useEntityStat(userId, "shield");
  const health = useEntityStat(userId, "health");
  const xp = useEntityStat(userId, "xp");
  const characterId = useStore(characterIdStore);
  const character = CHARACTERS.find((c) => c.id === characterId);
  const hp = health?.current ?? 0;
  const hpMax = health?.max ?? 1;
  const sh = shield?.current ?? 0;
  const shMax = shield?.max ?? 1;
  const low = hp / Math.max(1, hpMax) < 0.3;
  const points = Math.round(skillPoints?.current ?? 0);
  const xpRatio = xp === null || xp.max <= 0 ? 0 : Math.max(0, Math.min(1, xp.current / xp.max));
  // Wake on a pip changing, not on every point of regen.
  const step = (value: number, max: number) => Math.ceil((value / Math.max(1, max)) * PIPS);
  return (
    <HudFade watch={[step(sh, shMax), step(hp, hpMax), level?.current, points]} hold={combat || low || sh < shMax} dimTo={0.5} idleMs={5000}>
      <Plate material="carbon" cut="notch" depth={12} rim="#4a3b29" padding="0" className={`ss-vitals ${low ? "low" : ""}`} style={{ "--ss-char": character?.color ?? SIGNAL.amber } as CSSProperties}>
        <span className="ss-vitals-head">
          <span className="ss-level" title="Level">{level?.current ?? 1}</span>
          <span className="ss-vitals-tag">{character?.name ?? "Reclaimer"}<small>{character?.className ?? "Reclaimer"}</small></span>
          {points > 0 && <Stamp tone="phosphor" className="ss-points">K · +{points} pts</Stamp>}
        </span>
        <Crt className="ss-vitals-tube">
          <span className="ss-gauge shield"><b>SHD</b><Pips value={sh} max={shMax} count={PIPS} color={SIGNAL.shield} /><em>{Math.ceil(sh)}</em></span>
          <span className="ss-gauge health"><b>HP</b><Pips value={hp} max={hpMax} count={PIPS} color={SIGNAL.red} low={low} /><em>{Math.ceil(hp)}</em></span>
          <span className="ss-xp" aria-label={`Experience ${Math.round(xpRatio * 100)}%`}><i style={{ width: `${Math.round(xpRatio * 100)}%` }} /></span>
        </Crt>
      </Plate>
    </HudFade>
  );
}
