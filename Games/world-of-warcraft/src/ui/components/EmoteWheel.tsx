import { Armchair, Hand, Music4, PartyPopper, type LucideIcon } from "lucide-react";
import { useGame } from "@jgengine/react/hooks";
import { closePanels } from "../uiController";
import { wowActionSlot } from "../wowStyles";

interface EmoteEntry {
  id: string;
  label: string;
  icon: LucideIcon;
  gradient: string;
}

const EMOTES: EmoteEntry[] = [
  { id: "wave", label: "Wave", icon: Hand, gradient: "from-sky-400 via-sky-600 to-sky-900" },
  { id: "dance", label: "Dance", icon: Music4, gradient: "from-fuchsia-400 via-fuchsia-600 to-fuchsia-900" },
  { id: "cheer", label: "Cheer", icon: PartyPopper, gradient: "from-amber-400 via-amber-600 to-amber-900" },
  { id: "sit", label: "Sit", icon: Armchair, gradient: "from-emerald-400 via-emerald-600 to-emerald-900" },
];

const SLOT_ANGLES = [-90, 0, 90, 180];
const WHEEL_RADIUS = 64;

export function EmoteWheel() {
  const { commands } = useGame();

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/35"
      onPointerDown={(event) => {
        event.stopPropagation();
        closePanels();
      }}
    >
      <div className="relative h-44 w-44" onPointerDown={(event) => event.stopPropagation()}>
        {EMOTES.map((emote, index) => {
          const angleRad = (SLOT_ANGLES[index]! * Math.PI) / 180;
          const x = Math.cos(angleRad) * WHEEL_RADIUS;
          const y = Math.sin(angleRad) * WHEEL_RADIUS;
          const Icon = emote.icon;
          return (
            <button
              key={emote.id}
              type="button"
              title={emote.label}
              className={[wowActionSlot, "absolute -translate-x-1/2 -translate-y-1/2"].join(" ")}
              style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}
              onClick={() => {
                commands.run("emote", { emoteId: emote.id });
                closePanels();
              }}
            >
              <div className={["absolute inset-0 bg-gradient-to-br opacity-90", emote.gradient].join(" ")} />
              <Icon className="relative z-[1] h-7 w-7 text-white drop-shadow-md" strokeWidth={2.25} />
              <span className="relative z-[1] mt-1 text-[10px] font-bold uppercase tracking-wide text-white drop-shadow">
                {emote.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
