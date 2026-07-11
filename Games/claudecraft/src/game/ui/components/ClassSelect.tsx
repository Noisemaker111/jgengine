import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";
import { SettingsTrigger } from "@jgengine/react";
import { useGame, usePlayer } from "@jgengine/react/hooks";

import { CLASSES } from "../../classes/catalog";

export function ClassSelect() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  void userId;
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-stone-950/90">
      <SettingsTrigger className="pointer-events-auto absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-md border border-stone-700 bg-stone-950/80 text-amber-300 transition hover:border-amber-500 hover:bg-stone-800" />
      <div className="max-w-4xl px-6 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-amber-500/80">World of ClaudeCraft</p>
        <h1 className="mt-1 font-serif text-4xl font-bold text-amber-100">Choose your class</h1>
        <p className="mt-2 text-sm text-stone-400">
          Nine callings, three zones, one road to the Hollow Crypt.
        </p>
        <div className="mt-8 grid grid-cols-3 gap-3">
          {CLASSES.map((cls) => (
            <button
              key={cls.id}
              type="button"
              onClick={() => commands.run("class.select", { classId: cls.id })}
              className="group flex min-h-[92px] items-center gap-3 rounded-lg border border-stone-700 bg-stone-900/80 px-4 py-3 text-left transition hover:border-amber-500 hover:bg-stone-800"
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-stone-600"
                style={{ color: cls.color, borderColor: `${cls.color}66` }}
              >
                <GameIcon name={cls.icon as GameIconName} size={30} />
              </span>
              <span>
                <span className="block font-semibold" style={{ color: cls.color }}>
                  {cls.name}
                </span>
                <span className="block text-xs capitalize text-stone-400">{cls.resource}</span>
                <span className="block text-xs text-stone-500">
                  {cls.abilities.slice(0, 2).map((ability) => ability.name).join(" · ")}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
