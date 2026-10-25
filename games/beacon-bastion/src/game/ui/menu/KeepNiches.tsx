import type { ReactNode } from "react";
import { GameCursor } from "@jgengine/react/gameCursor";
import { GameFrame } from "@jgengine/react/gameFrame";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useMenuNav } from "@jgengine/react/menuNav";
import { relativeSavedAt } from "@jgengine/react/saveSlots";
import type { SaveSlotMeta } from "@jgengine/core/game/saveSlots";

import { KEEP_LABEL } from "../../save";
import { Brazier } from "../kit/Brazier";
import { FIRE } from "../theme";

/** The numbers a kept defense carries, read from the slot's meta (written by `refreshBeaconSlots`). */
function keepFacts(slot: SaveSlotMeta): { wave: number | null; gold: number | null; lives: number | null; commander: string | null; thumb: string | null } {
  const num = (key: string) => (typeof slot.meta[key] === "number" ? (slot.meta[key] as number) : null);
  const str = (key: string) => (typeof slot.meta[key] === "string" && String(slot.meta[key]).length > 0 ? String(slot.meta[key]) : null);
  return { wave: num("wave"), gold: num("gold"), lives: num("lives"), commander: str("character"), thumb: str("thumbnail") };
}

/** One kept defense's carved line: the wave it reached, its purse and its walls, each beside its glyph. */
function KeepFacts({ slot }: { slot: SaveSlotMeta }) {
  const facts = keepFacts(slot);
  return (
    <span className="bb-niche-facts">
      {facts.wave === null ? null : (
        <span>
          <GameIcon name="flag" size={13} /> Wave {facts.wave}
        </span>
      )}
      {facts.gold === null ? null : (
        <span>
          <GameIcon name="coin" size={13} color="#f6cf5a" /> {facts.gold}
        </span>
      )}
      {facts.lives === null ? null : (
        <span>
          <GameIcon name="heart" size={13} color="#e0624a" /> {facts.lives}
        </span>
      )}
    </span>
  );
}

/**
 * The keeps as niches cut into the tablet: each holds its last capture (or a cold brazier while it
 * stands empty), the commander's name, the wave it reached and a plank to take it up. Arrow keys,
 * the pad and the pointer all move the same cursor.
 */
export function KeepNiches({
  slots,
  recentId,
  enabled,
  onHold,
  onRaise,
  onBack,
}: {
  slots: readonly SaveSlotMeta[];
  recentId: string | null;
  enabled: boolean;
  onHold: (slot: string) => void;
  onRaise: (slot: string) => void;
  onBack: () => void;
}): ReactNode {
  const take = (id: string) => {
    const slot = slots.find((entry) => entry.id === id);
    if (slot === undefined) return;
    if (slot.empty) onRaise(id);
    else onHold(id);
  };
  const nav = useMenuNav({ ids: slots.map((slot) => slot.id), columns: slots.length, enabled, onConfirm: take, onBack });
  return (
    <GameFrame material="stone" tint="#57524a" cut="chamfer" depth={18} padding="18px 22px 22px" className="bb-tablet bb-keeps" data-keep-niches="">
      <h2 className="bb-carved">Keeps</h2>
      <div className="bb-niches" {...nav.containerProps} data-jg-cursor-scope="">
        {slots.map((slot) => {
          const facts = keepFacts(slot);
          const label = KEEP_LABEL[slot.id] ?? slot.id;
          return (
            <div key={slot.id} className="bb-niche" data-keep-slot={slot.id} data-empty={slot.empty ? "" : undefined} data-recent={slot.id === recentId ? "" : undefined}>
              <div className="bb-niche-arch" aria-hidden>
                {facts.thumb === null ? <Brazier size={40} strength={slot.empty ? 0 : 0.55} /> : <img src={facts.thumb} alt="" />}
              </div>
              <strong className="bb-niche-keep">{label}</strong>
              <span className="bb-niche-name">{slot.empty ? "Unclaimed" : (facts.commander ?? slot.name ?? label)}</span>
              {slot.empty ? <span className="bb-niche-when">No defense kept here</span> : <KeepFacts slot={slot} />}
              {slot.empty || slot.savedAt === undefined ? null : <span className="bb-niche-when">Kept {relativeSavedAt(slot.savedAt)}</span>}
              <GameFrame
                as="button"
                material={slot.empty ? "wood" : "enamel"}
                tint={slot.empty ? undefined : "#8a2414"}
                edge={slot.empty ? undefined : "#3a0e06"}
                cut="notch"
                depth={9}
                padding="7px 16px"
                className="bb-small-plank bb-niche-take"
                data-keep-take={slot.id}
                aria-label={slot.empty ? `Raise ${label}` : `Hold ${label}`}
                {...nav.itemProps(slot.id)}
                onClick={() => take(slot.id)}
              >
                {slot.empty ? "Raise" : "Hold"}
              </GameFrame>
            </div>
          );
        })}
        <GameCursor variant="brackets" color={FIRE} gap={4} arm={10} thickness={2} />
      </div>
    </GameFrame>
  );
}

/** Continue: the last keep held, on a dispatch - who held it, how far it got, and the way back to the wall. */
export function KeepDispatch({ slot, onHold }: { slot: SaveSlotMeta | null; onHold: (slot: string) => void }): ReactNode {
  if (slot === null) {
    return (
      <GameFrame material="paper" cut="torn" depth={12} padding="20px 24px 30px" className="bb-parchment">
        <h2 className="bb-ink-title">No keep held</h2>
        <p className="bb-ink-line">Raise one, then withdraw to the title to keep it.</p>
      </GameFrame>
    );
  }
  const facts = keepFacts(slot);
  const label = KEEP_LABEL[slot.id] ?? slot.id;
  return (
    <GameFrame material="paper" cut="torn" depth={12} padding="20px 24px 30px" className="bb-parchment bb-dispatch" data-keep-dispatch="">
      <h2 className="bb-ink-title">{label}</h2>
      {facts.thumb === null ? null : <img className="bb-dispatch-thumb" src={facts.thumb} alt="" />}
      <p className="bb-ink-line">
        Held by <b>{facts.commander ?? slot.name ?? "an unnamed commander"}</b>
        {slot.savedAt === undefined ? null : <>, kept {relativeSavedAt(slot.savedAt)}</>}.
      </p>
      <KeepFacts slot={slot} />
      <GameFrame
        as="button"
        material="enamel"
        tint="#8a2414"
        edge="#3a0e06"
        cut="hex"
        depth={14}
        padding="12px 30px"
        glow="rgba(255,150,60,0.55)"
        className="bb-raise"
        data-keep-take={slot.id}
        onClick={() => onHold(slot.id)}
      >
        Return to the wall
      </GameFrame>
    </GameFrame>
  );
}
