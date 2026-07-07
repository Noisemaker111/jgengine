import type { LucideIcon } from "lucide-react";
import { Fish, Flame, FlaskConical, Heart, Orbit, Snowflake, Sword } from "lucide-react";

export const wowPanel =
  "rounded-md border-2 border-amber-700/70 bg-gradient-to-b from-stone-950/98 via-stone-900/95 to-stone-950/98 shadow-[0_8px_32px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(251,191,36,0.2)] backdrop-blur-sm";

export const wowPanelHeader = "text-sm font-bold uppercase tracking-wider text-amber-200 drop-shadow-sm";

export const wowBarTrack = "relative h-5 overflow-hidden rounded-sm border border-black/60 bg-black/70 shadow-inner";

export const wowActionSlot =
  "pointer-events-auto relative flex h-[4.5rem] w-[4.5rem] flex-col items-center justify-center overflow-hidden rounded-md border-2 border-stone-600 bg-gradient-to-b from-stone-800 to-stone-950 shadow-[inset_0_2px_6px_rgba(0,0,0,0.5)] transition hover:border-amber-400 hover:shadow-[0_0_12px_rgba(251,191,36,0.35)] disabled:cursor-default disabled:opacity-50";

export const wowKeybind =
  "absolute left-1 top-0.5 z-10 text-[11px] font-bold leading-none text-amber-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]";

export const wowMicroButton =
  "pointer-events-auto flex h-12 w-12 items-center justify-center rounded-md border-2 text-amber-50 shadow-lg transition";

export const wowMicroButtonIdle =
  "border-amber-800/80 bg-gradient-to-b from-stone-800 to-stone-950 hover:border-amber-400 hover:from-stone-700 hover:to-stone-900";

export const wowMicroButtonActive =
  "border-amber-300 bg-gradient-to-b from-amber-600/40 to-amber-900/50 shadow-[0_0_14px_rgba(251,191,36,0.4)]";

export interface AbilityVisual {
  icon: LucideIcon;
  gradient: string;
  accent: string;
  imageUrl?: string;
}

const abilityVisuals: Record<string, AbilityVisual> = {
  iron_sword: {
    icon: Sword,
    gradient: "from-stone-500 via-stone-600 to-stone-800",
    accent: "text-stone-100",
    imageUrl: "/game-assets/wow/icons/sword-slash-attack.png",
  },
  fireball: {
    icon: Flame,
    gradient: "from-orange-400 via-red-500 to-red-800",
    accent: "text-orange-100",
    imageUrl: "/game-assets/wow/icons/fireball-spell.png",
  },
  frostbolt: {
    icon: Snowflake,
    gradient: "from-sky-300 via-blue-500 to-indigo-800",
    accent: "text-sky-100",
    imageUrl: "/game-assets/wow/icons/lightning-bolt-spell.png",
  },
  flash_heal: {
    icon: Heart,
    gradient: "from-emerald-300 via-green-500 to-emerald-800",
    accent: "text-emerald-50",
    imageUrl: "/game-assets/wow/icons/healing-potion.png",
  },
  health_potion: {
    icon: FlaskConical,
    gradient: "from-rose-400 via-red-600 to-rose-900",
    accent: "text-rose-50",
    imageUrl: "/game-assets/wow/icons/healing-potion.png",
  },
  fishing_rod: {
    icon: Fish,
    gradient: "from-cyan-300 via-teal-500 to-teal-800",
    accent: "text-cyan-50",
  },
  capture_orb: {
    icon: Orbit,
    gradient: "from-violet-400 via-purple-600 to-purple-900",
    accent: "text-violet-50",
  },
};

const defaultVisual: AbilityVisual = {
  icon: Sword,
  gradient: "from-amber-600 via-amber-700 to-amber-900",
  accent: "text-amber-50",
};

export function abilityVisualFor(itemId: string): AbilityVisual {
  return abilityVisuals[itemId] ?? defaultVisual;
}
