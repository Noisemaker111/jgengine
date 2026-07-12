import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";
import { SettingsTrigger } from "@jgengine/react";
import { useGame, usePlayer } from "@jgengine/react/hooks";
import { useState } from "react";

import { CLASSES } from "../../classes/catalog";

const SUGGESTED_NAMES = ["Aldric", "Brynn", "Cael", "Dara", "Eirik", "Faye", "Gorm", "Isolde", "Kael", "Rowan", "Sable", "Thane"];

export function ClassSelect() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  void userId;
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState(() => SUGGESTED_NAMES[Math.floor(Math.random() * SUGGESTED_NAMES.length)] ?? "Adventurer");
  const nameValid = /^[A-Za-z][A-Za-z' -]{1,15}$/.test(name.trim());
  const ready = selected !== null && nameValid;
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center"
      style={{ background: "radial-gradient(ellipse at center, #15151f 0%, #08080d 80%)" }}
    >
      <SettingsTrigger className="pointer-events-auto absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-md border border-[#6f5a2a] bg-[#15151f]/90 text-[#c8a838] transition hover:border-[#ffd100]" />
      <div className="max-w-4xl px-6 text-center">
        <p
          className="text-sm uppercase tracking-[0.3em] text-[#c8a838]"
          style={{ fontFamily: "var(--wcc-font-display)" }}
        >
          World of ClaudeCraft
        </p>
        <h1 className="wcc-title mt-1 text-4xl font-bold">Choose Your Class</h1>
        <p className="mt-2 text-sm text-[#998d6a]">
          Nine callings, three zones, one road to the Hollow Crypt.
        </p>
        <input
          type="text"
          value={name}
          maxLength={16}
          placeholder="Name your hero"
          onChange={(event) => setName(event.target.value)}
          className="wcc-panel mx-auto mt-6 block w-72 rounded-md px-4 py-2.5 text-center text-white placeholder:text-[#6b6350] focus:border-[#ffd100] focus:outline-none"
          style={{ fontSize: 16, fontFamily: "var(--wcc-font-display)", letterSpacing: "0.05em" }}
        />
        <div className="mt-6 grid grid-cols-3 gap-3">
          {CLASSES.map((cls) => {
            const sel = selected === cls.id;
            return (
              <button
                key={cls.id}
                type="button"
                onClick={() => setSelected(cls.id)}
                className="wcc-panel group flex min-h-[92px] items-center gap-3 px-4 py-3 text-left transition"
                style={
                  sel
                    ? { boxShadow: `0 0 16px ${cls.color}`, borderColor: cls.color }
                    : undefined
                }
              >
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 bg-[radial-gradient(circle_at_35%_30%,#2c2c3a,#15151f)]"
                  style={{ color: cls.color, borderColor: sel ? cls.color : "#4a3d1d" }}
                >
                  <GameIcon name={cls.icon as GameIconName} size={30} />
                </span>
                <span>
                  <span
                    className="block font-semibold"
                    style={{ color: cls.color, fontFamily: "var(--wcc-font-display)" }}
                  >
                    {cls.name}
                  </span>
                  <span className="block text-xs capitalize text-[#998d6a]">{cls.resource}</span>
                  <span className="block text-xs text-stone-500">
                    {cls.abilities.slice(0, 2).map((ability) => ability.name).join(" · ")}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            if (selected !== null && nameValid) {
              commands.run("class.select", { classId: selected, name: name.trim() });
            }
          }}
          className="mt-8 rounded-lg px-14 py-3 text-2xl font-bold uppercase tracking-[3px] transition disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            fontFamily: "var(--wcc-font-display)",
            background: "linear-gradient(180deg, #f8da78 0%, #e2b03a 44%, #b7820f 100%)",
            color: "#2a1c05",
            border: "1px solid #ffe6a0",
            boxShadow: "0 2px 8px #000a, 0 0 26px rgba(255,209,0,0.28)",
          }}
        >
          Play
        </button>
      </div>
    </div>
  );
}
