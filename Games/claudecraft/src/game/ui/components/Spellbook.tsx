import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";
import { useEntityStat, useGame, useGameStore, usePlayer } from "@jgengine/react/hooks";
import { useState } from "react";

import { classById } from "../../classes/catalog";
import { CLOSE_BUTTON, PANEL, PANEL_TITLE } from "../theme";

export function SpellbookPanel() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const [pickedSlot, setPickedSlot] = useState(0);
  const classId = useGameStore((ctx) => ctx.game.store.get(`class:${userId}`)) as string | undefined;
  const level = useEntityStat(userId, "level")?.current ?? 1;
  const bar = useGameStore((ctx) => {
    const raw = ctx.game.store.get(`bar:${userId}`);
    return Array.isArray(raw) ? (raw as string[]) : [];
  });
  if (classId === undefined) return null;
  const cls = classById(classId);
  const abilities = [...cls.abilities].sort((a, b) => a.levelReq - b.levelReq);
  return (
    <div className={`${PANEL} pointer-events-auto w-[460px] max-h-[72vh] overflow-hidden`}>
      <div className={PANEL_TITLE}>
        <span>Spellbook · {cls.name}</span>
        <button type="button" className={CLOSE_BUTTON} onClick={() => commands.run("openSpellbook", {})}>
          ✕
        </button>
      </div>
      <div className="flex items-center gap-1.5 border-b border-amber-900/40 px-4 py-2">
        <span className="text-xs text-stone-400">Assign to slot</span>
        {Array.from({ length: 9 }, (_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setPickedSlot(index)}
            className={`h-7 w-7 rounded border text-xs font-bold ${
              pickedSlot === index
                ? "border-amber-400 bg-amber-900/60 text-amber-100"
                : "border-stone-700 bg-stone-900 text-stone-400 hover:border-amber-600"
            }`}
          >
            {index + 1}
          </button>
        ))}
      </div>
      <div className="max-h-[52vh] space-y-0.5 overflow-y-auto px-4 py-3">
        {abilities.map((ability) => {
          const known = ability.levelReq <= level;
          const slotIndex = bar.indexOf(ability.id);
          return (
            <button
              key={ability.id}
              type="button"
              disabled={!known}
              onClick={() => commands.run("spellbook.assign", { abilityId: ability.id, slot: pickedSlot })}
              className={`flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left ${
                known ? "hover:bg-stone-800/70" : "opacity-45"
              }`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-stone-700 bg-stone-900 text-amber-200">
                <GameIcon name={ability.icon as GameIconName} size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-amber-100">
                  {ability.name}
                  {slotIndex >= 0 && (
                    <span className="ml-2 rounded bg-amber-950/80 px-1 text-[10px] text-amber-400 ring-1 ring-amber-900">
                      slot {slotIndex + 1}
                    </span>
                  )}
                </span>
                <span className="block text-[11px] text-stone-400">
                  {known ? "" : `Learned at level ${ability.levelReq} · `}
                  {ability.cost > 0 ? `${ability.cost} ${cls.resource} · ` : ""}
                  {ability.castTime > 0 ? `${ability.castTime}s cast · ` : "Instant · "}
                  {ability.cooldown > 0 ? `${ability.cooldown}s cooldown · ` : ""}
                  {ability.range > 0 ? `${ability.range} yd` : "melee"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
