import type { CSSProperties, ReactNode } from "react";

export const GAME_ICON_NAMES = [
  "sword",
  "dagger",
  "axe",
  "hammer",
  "bow",
  "arrow",
  "staff",
  "wand",
  "spear",
  "crossbow",
  "gun",
  "bomb",
  "shield",
  "helmet",
  "chestplate",
  "boots",
  "gauntlet",
  "ring",
  "amulet",
  "cloak",
  "backpack",
  "torch",
  "potionRed",
  "potionBlue",
  "scroll",
  "tome",
  "meat",
  "bread",
  "apple",
  "fish",
  "wood",
  "stone",
  "ore",
  "ingot",
  "gem",
  "crystal",
  "coin",
  "key",
  "chest",
  "feather",
  "fire",
  "frost",
  "lightning",
  "poison",
  "leaf",
  "skull",
  "heart",
  "star",
  "eye",
  "wing",
  "hourglass",
  "buffArrow",
  "debuffArrow",
  "map",
  "flag",
  "gear",
  "crosshairIcon",
  "pickaxe",
  "fist",
  "arrowUp",
  "arrowDown",
  "arrowLeft",
  "arrowRight",
  "jump",
  "sprint",
  "crouch",
  "hardDrop",
  "swap",
  "rotateCw",
  "rotateCcw",
  "restart",
  "hand",
  "pin",
  "pause",
  "menu",
  "skip",
  "check",
  "cross",
] as const;

export type GameIconName = (typeof GAME_ICON_NAMES)[number];

export function isGameIconName(value: string): value is GameIconName {
  return (GAME_ICON_NAMES as readonly string[]).includes(value);
}

const ROTATE_45 = "rotate(45 12 12)";

const ICONS: Record<GameIconName, ReactNode> = {
  sword: (
    <g transform={ROTATE_45}>
      <polygon points="12,2 14.6,15 9.4,15" />
      <rect x="7" y="15" width="10" height="1.8" rx="0.5" />
      <rect x="10.7" y="16.8" width="2.6" height="4" rx="1" />
      <circle cx="12" cy="21.6" r="1.6" />
    </g>
  ),
  dagger: (
    <g transform={ROTATE_45}>
      <polygon points="12,6 13.7,15 10.3,15" />
      <rect x="8.5" y="15" width="7" height="1.4" rx="0.4" />
      <rect x="10.8" y="16.4" width="2.4" height="3.2" rx="1" />
      <circle cx="12" cy="20.2" r="1.3" />
    </g>
  ),
  axe: (
    <g transform={ROTATE_45}>
      <rect x="11" y="6" width="2" height="15" rx="1" />
      <path d="M12,3 C17,3 21,6.5 20,10.5 C19,13 15,12.5 12,10 Z" />
    </g>
  ),
  hammer: (
    <g transform={ROTATE_45}>
      <rect x="11" y="9" width="2" height="13" rx="1" />
      <rect x="6" y="3" width="12" height="6" rx="1.5" />
    </g>
  ),
  bow: (
    <>
      <path d="M8,2 C3,7 3,17 8,22 C9,22 9.8,21 9,20 C5.5,16 5.5,8 9,4 C9.8,3 9,2 8,2 Z" />
      <rect x="7.6" y="2" width="0.9" height="20" />
    </>
  ),
  arrow: (
    <g transform={ROTATE_45}>
      <rect x="11" y="6" width="2" height="14" rx="1" />
      <polygon points="12,1 15,6 9,6" />
      <polygon points="12,19.5 8.5,23 11,19" />
      <polygon points="12,19.5 15.5,23 13,19" />
    </g>
  ),
  staff: (
    <>
      <rect x="11" y="6" width="2" height="16" rx="1" />
      <circle cx="12" cy="4" r="3" />
    </>
  ),
  wand: (
    <g transform={ROTATE_45}>
      <rect x="11.3" y="10" width="1.4" height="11" rx="0.7" />
      <path d="M12,1 L13,5.6 L17.5,6.5 L13,7.4 L12,12 L11,7.4 L6.5,6.5 L11,5.6 Z" />
    </g>
  ),
  spear: (
    <g transform={ROTATE_45}>
      <rect x="11.2" y="6" width="1.6" height="15" rx="0.8" />
      <polygon points="12,1 14,7 12,10.3 10,7" />
    </g>
  ),
  crossbow: (
    <>
      <path d="M7,3 C2,6 2,18 7,21 C8,21 8.6,20 7.8,19 C4.5,16 4.5,8 7.8,5 C8.6,4 8,3 7,3 Z" />
      <rect x="6.7" y="3" width="0.9" height="18" />
      <rect x="7" y="10.8" width="15" height="2.4" rx="1" />
      <polygon points="22,12 18,10.2 18,13.8" />
    </>
  ),
  gun: (
    <>
      <rect x="9" y="9" width="13" height="3.2" rx="1" />
      <rect x="5" y="12" width="4.4" height="9.5" rx="1.6" transform="rotate(18 7.2 16.7)" />
      <circle cx="8.6" cy="13.6" r="1.3" />
    </>
  ),
  bomb: (
    <>
      <circle cx="12" cy="14.5" r="7" />
      <rect x="14.2" y="3" width="1.6" height="6" rx="0.8" transform="rotate(35 15 9)" />
      <circle cx="17" cy="3.4" r="1.5" />
    </>
  ),
  shield: (
    <path
      fillRule="evenodd"
      d="M12,2 L19,5 L19,12 C19,17 15.5,20.5 12,22 C8.5,20.5 5,17 5,12 L5,5 Z M12,8 L14.3,11 L12,14 L9.7,11 Z"
    />
  ),
  helmet: (
    <>
      <path
        fillRule="evenodd"
        d="M4,13.2 C4,6.3 7.5,3 12,3 C16.5,3 20,6.3 20,13.2 L20,15 L4,15 Z M7.2,10.2 L16.8,10.2 L16.8,12 L7.2,12 Z"
      />
      <rect x="3" y="14.6" width="18" height="1.8" rx="0.9" />
    </>
  ),
  chestplate: (
    <>
      <path
        fillRule="evenodd"
        d="M6,7 L18,7 L20,10 L18,22 L6,22 L4,10 Z M11.3,8.5 L12.7,8.5 L12.7,20.5 L11.3,20.5 Z"
      />
      <circle cx="5.2" cy="8" r="2.6" />
      <circle cx="18.8" cy="8" r="2.6" />
    </>
  ),
  boots: (
    <>
      <path d="M7,3 L15,3 L15,14 L20,16.2 L20,19.2 L5,19.2 L5,16 L7,14 Z" />
      <rect x="4" y="19" width="17" height="2" rx="0.6" />
    </>
  ),
  gauntlet: (
    <>
      <rect x="6" y="10" width="12" height="9" rx="3" />
      <rect x="4" y="18" width="14" height="3" rx="1.2" />
      <rect x="6.6" y="4" width="2.4" height="7" rx="1.2" />
      <rect x="9.8" y="3.4" width="2.4" height="7.6" rx="1.2" />
      <rect x="13" y="3.4" width="2.4" height="7.6" rx="1.2" />
      <rect x="16.2" y="4.4" width="2.2" height="6.6" rx="1.1" />
      <rect x="2.6" y="12.5" width="4.6" height="3.4" rx="1.5" transform="rotate(-25 4.9 14.2)" />
    </>
  ),
  ring: (
    <>
      <path
        fillRule="evenodd"
        d="M12,10 C15.6,10 18.5,12.9 18.5,16.5 C18.5,20.1 15.6,23 12,23 C8.4,23 5.5,20.1 5.5,16.5 C5.5,12.9 8.4,10 12,10 Z M12,13.2 C10.1,13.2 8.7,14.7 8.7,16.5 C8.7,18.3 10.1,19.8 12,19.8 C13.9,19.8 15.3,18.3 15.3,16.5 C15.3,14.7 13.9,13.2 12,13.2 Z"
      />
      <polygon points="12,3.5 15.2,7.5 12,11 8.8,7.5" />
    </>
  ),
  amulet: (
    <>
      <path
        fillRule="evenodd"
        d="M12,2.5 C13.4,2.5 14.5,3.6 14.5,5 C14.5,6.4 13.4,7.5 12,7.5 C10.6,7.5 9.5,6.4 9.5,5 C9.5,3.6 10.6,2.5 12,2.5 Z M12,3.9 C11.4,3.9 10.9,4.4 10.9,5 C10.9,5.6 11.4,6.1 12,6.1 C12.6,6.1 13.1,5.6 13.1,5 C13.1,4.4 12.6,3.9 12,3.9 Z"
      />
      <polygon points="12,7 16.5,11.5 14.3,19.5 9.7,19.5 7.5,11.5" />
    </>
  ),
  cloak: (
    <>
      <path d="M12,2 C9,2 7,4 7,6.2 L4,20 C4,21.5 5.5,22 7,21 L12,18 L17,21 C18.5,22 20,21.5 20,20 L17,6.2 C17,4 15,2 12,2 Z" />
      <circle cx="12" cy="7" r="1.2" />
    </>
  ),
  backpack: (
    <>
      <rect x="6" y="8" width="12" height="13" rx="3" />
      <rect x="7" y="4" width="10" height="6.5" rx="3" />
      <rect x="7.6" y="2" width="1.7" height="7.5" rx="0.8" />
      <rect x="14.7" y="2" width="1.7" height="7.5" rx="0.8" />
      <rect x="9" y="15" width="6" height="4.4" rx="1.4" />
    </>
  ),
  torch: (
    <>
      <rect x="10.6" y="10" width="2.8" height="12" rx="1.2" />
      <rect x="9.8" y="13.2" width="4.4" height="1.2" rx="0.5" />
      <rect x="9.8" y="17" width="4.4" height="1.2" rx="0.5" />
      <path d="M12,1 C9.2,4 8.2,6.8 9.8,9 C9.9,7.6 10.7,7.2 11,8.1 C11.4,6.6 12.6,6.2 12.2,8.3 C14.2,7 14.8,4 12,1 Z" />
    </>
  ),
  potionRed: (
    <>
      <rect x="10.7" y="3" width="2.6" height="3" rx="0.8" />
      <rect x="10.3" y="1.4" width="3.4" height="2" rx="0.8" />
      <path d="M9,6 L15,6 L18,14 C18,19 15,22 12,22 C9,22 6,19 6,14 Z" />
    </>
  ),
  potionBlue: (
    <>
      <rect x="9.2" y="1.4" width="5.6" height="2" rx="0.8" />
      <path d="M9.5,3 L14.5,3 L14.5,18 C14.5,20.5 12,21.6 12,21.6 C12,21.6 9.5,20.5 9.5,18 Z" />
    </>
  ),
  scroll: (
    <>
      <path
        fillRule="evenodd"
        d="M5,9 L19,9 L19,15 L5,15 Z M6.6,10.6 L17.4,10.6 L17.4,11.3 L6.6,11.3 Z M6.6,12.5 L17.4,12.5 L17.4,13.2 L6.6,13.2 Z"
      />
      <circle cx="5" cy="12" r="2.6" />
      <circle cx="19" cy="12" r="2.6" />
    </>
  ),
  tome: (
    <>
      <path
        fillRule="evenodd"
        d="M4,4 L20,4 L20,21 L4,21 Z M7.1,5.5 L8,5.5 L8,19.5 L7.1,19.5 Z"
      />
      <polygon points="15,2 17.2,2 17.2,8.5 16.1,7 15,8.5" />
      <rect x="10.6" y="11" width="2.8" height="3.4" rx="0.6" />
    </>
  ),
  meat: (
    <>
      <path d="M6,4 C4,7 4,11 7,13 C9,15 15,15 17,13 C20,11 20,7 18,4 C15,1 9,1 6,4 Z" />
      <rect x="10.6" y="13" width="2.8" height="6" rx="1.2" />
      <circle cx="9.6" cy="20.3" r="1.8" />
      <circle cx="14.4" cy="20.3" r="1.8" />
    </>
  ),
  bread: (
    <path
      fillRule="evenodd"
      d="M3,15 C3,9 7,6 12,6 C17,6 21,9 21,15 C21,19 17,21 12,21 C7,21 3,19 3,15 Z M8.2,7.4 L10,7.4 L8.6,11.4 L6.8,11.4 Z M11.1,6.6 L12.9,6.6 L11.5,10.8 L9.7,10.8 Z M14,7.4 L15.8,7.4 L14.4,11.4 L12.6,11.4 Z"
    />
  ),
  apple: (
    <>
      <path d="M12,7.6 C8,7.6 5,10.6 5,14.9 C5,19 8,22 12,22 C16,22 19,19 19,14.9 C19,11.4 16.8,8.8 13.9,8 Z" />
      <rect x="11.3" y="2.6" width="1.4" height="4" rx="0.6" transform="rotate(14 12 4.6)" />
      <path d="M12.9,3.6 C14.2,2.6 16.2,3 16.2,5 C14.2,5.4 13.2,4.8 12.9,3.6 Z" />
    </>
  ),
  fish: (
    <>
      <path
        fillRule="evenodd"
        d="M3,12 C6,7 12,6 16,9 C18,10.5 18,13.5 16,15 C12,18 6,17 3,12 Z M7.4,11 C6.75,11 6.2,11.55 6.2,12.2 C6.2,12.85 6.75,13.4 7.4,13.4 C8.05,13.4 8.6,12.85 8.6,12.2 C8.6,11.55 8.05,11 7.4,11 Z"
      />
      <polygon points="16,9 21,6 21,18 16,15" />
      <polygon points="9,7.4 11,4 13,8" />
    </>
  ),
  wood: (
    <>
      <path
        fillRule="evenodd"
        d="M2,6.5 L22,6.5 L22,11 L2,11 Z M6.4,8.75 C6.4,7.75 5.6,6.95 4.6,6.95 C3.6,6.95 2.8,7.75 2.8,8.75 C2.8,9.75 3.6,10.55 4.6,10.55 C5.6,10.55 6.4,9.75 6.4,8.75 Z"
      />
      <path
        fillRule="evenodd"
        d="M2,13.5 L22,13.5 L22,18 L2,18 Z M6.4,15.75 C6.4,14.75 5.6,13.95 4.6,13.95 C3.6,13.95 2.8,14.75 2.8,15.75 C2.8,16.75 3.6,17.55 4.6,17.55 C5.6,17.55 6.4,16.75 6.4,15.75 Z"
      />
    </>
  ),
  stone: (
    <>
      <polygon points="4,20 3,13 8,8 14,9 13,15 9,20" />
      <polygon points="12,21 11,14 16,10 21,12 20,18 16,21" />
    </>
  ),
  ore: (
    <>
      <polygon points="4,20 3,12 9,7 17,8 20,14 17,20 10,22" />
      <polygon points="12,7 14,1 16,8 13,9.5" />
    </>
  ),
  ingot: (
    <>
      <polygon points="3,21 21,21 19,17 5,17" />
      <polygon points="4,16.5 20,16.5 18,12.5 6,12.5" />
      <polygon points="5,12 19,12 17,8 7,8" />
    </>
  ),
  gem: (
    <path
      fillRule="evenodd"
      d="M12,2 L19,9 L15,22 L9,22 L5,9 Z M9,9 L12,9 L10.4,13 Z"
    />
  ),
  crystal: (
    <>
      <polygon points="7,22 5,10 8,3 11,10 9,22" />
      <polygon points="14,22 12,6 15,1 18,7 16,22" />
      <polygon points="3,22 2,15 4,11 6,15 5,22" />
    </>
  ),
  coin: (
    <path
      fillRule="evenodd"
      d="M12,3 C16.97,3 21,7.03 21,12 C21,16.97 16.97,21 12,21 C7.03,21 3,16.97 3,12 C3,7.03 7.03,3 12,3 Z M12,5.4 C8.35,5.4 5.4,8.35 5.4,12 C5.4,15.65 8.35,18.6 12,18.6 C15.65,18.6 18.6,15.65 18.6,12 C18.6,8.35 15.65,5.4 12,5.4 Z M12,7.6 C9.57,7.6 7.6,9.57 7.6,12 C7.6,14.43 9.57,16.4 12,16.4 C14.43,16.4 16.4,14.43 16.4,12 C16.4,9.57 14.43,7.6 12,7.6 Z"
    />
  ),
  key: (
    <>
      <path
        fillRule="evenodd"
        d="M8,3 C10.32,3 12.2,4.88 12.2,7.2 C12.2,9.52 10.32,11.4 8,11.4 C5.68,11.4 3.8,9.52 3.8,7.2 C3.8,4.88 5.68,3 8,3 Z M8,5.1 C6.84,5.1 5.9,6.04 5.9,7.2 C5.9,8.36 6.84,9.3 8,9.3 C9.16,9.3 10.1,8.36 10.1,7.2 C10.1,6.04 9.16,5.1 8,5.1 Z"
      />
      <rect x="7" y="10" width="2" height="10.5" rx="0.6" />
      <rect x="9" y="16" width="3.2" height="1.7" />
      <rect x="9" y="19" width="2.4" height="1.7" />
    </>
  ),
  chest: (
    <>
      <path d="M3,11 C3,7 6,5 12,5 C18,5 21,7 21,11 Z" />
      <rect x="3" y="11" width="18" height="9" rx="1.5" />
      <rect x="3" y="13.4" width="18" height="1.4" />
      <rect x="10.4" y="12.6" width="3.2" height="3.6" rx="0.8" />
    </>
  ),
  feather: (
    <path
      fillRule="evenodd"
      d="M17,3 C10,3 5,9 5,16 C5,19 7,21 9,21 C9,19 9,17 10,16 C13,17 17,15 18,11 C19,8 19,5 17,3 Z M9.4,19.6 L16,6 L16.7,6.4 L10.1,20 Z"
    />
  ),
  fire: (
    <path d="M12,2 C8,7 5,11 6,15.5 C6.8,19 9.7,21.5 12.5,21.5 C16,21.5 19,18.7 18.6,14.8 C18.3,12 16.7,10.5 16.8,12.7 C16.9,14.4 15.8,15.3 14.9,14.2 C14,13 14.6,10.8 13.3,8.5 C12.5,7 11.7,5.5 12,2 Z" />
  ),
  frost: (
    <g>
      {[0, 60, 120].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 12 12)`}>
          <rect x="11.2" y="2" width="1.6" height="20" rx="0.8" />
          <rect x="9.4" y="2.6" width="5.2" height="1.4" />
          <rect x="9.4" y="20" width="5.2" height="1.4" />
        </g>
      ))}
    </g>
  ),
  lightning: <polygon points="13,2 5,14 11,14 9,22 19,9 12,9 14.5,2" />,
  poison: (
    <>
      <path d="M12,3 C16,9 19,13 19,16.5 C19,20.5 15.9,23 12,23 C8.1,23 5,20.5 5,16.5 C5,13 8,9 12,3 Z" />
      <circle cx="17.4" cy="6" r="1.6" />
      <circle cx="19.8" cy="9.6" r="1.1" />
    </>
  ),
  leaf: (
    <path
      fillRule="evenodd"
      d="M4,20 C4,10 11,3 20,3 C20,13 13,20 4,20 Z M5.4,18.9 L18.3,4.7 L18.9,5.3 L6,19.5 Z"
    />
  ),
  skull: (
    <path
      fillRule="evenodd"
      d="M6,12 C6,6 8.5,3 12,3 C15.5,3 18,6 18,12 L18,15 L15.4,15 L15.4,17 L13,17 L13,19 L11,19 L11,17 L8.6,17 L8.6,15 L6,15 Z M9.3,11 C8.36,11 7.6,11.76 7.6,12.7 C7.6,13.64 8.36,14.4 9.3,14.4 C10.24,14.4 11,13.64 11,12.7 C11,11.76 10.24,11 9.3,11 Z M14.7,11 C13.76,11 13,11.76 13,12.7 C13,13.64 13.76,14.4 14.7,14.4 C15.64,14.4 16.4,13.64 16.4,12.7 C16.4,11.76 15.64,11 14.7,11 Z M12,12.8 L13,15.2 L11,15.2 Z"
    />
  ),
  heart: (
    <path d="M12,21 C4,15 2,10.5 2,7.2 C2,4 4.5,2 7.2,2 C9.3,2 11,3.3 12,5.2 C13,3.3 14.7,2 16.8,2 C19.5,2 22,4 22,7.2 C22,10.5 20,15 12,21 Z" />
  ),
  star: (
    <polygon points="12,1.5 14.47,8.6 21.99,8.75 15.99,13.3 18.17,20.49 12,16.2 5.83,20.49 8.0,13.3 2.01,8.75 9.53,8.6" />
  ),
  eye: (
    <path
      fillRule="evenodd"
      d="M2,12 C6,5 18,5 22,12 C18,19 6,19 2,12 Z M15,12 C15,13.66 13.66,15 12,15 C10.34,15 9,13.66 9,12 C9,10.34 10.34,9 12,9 C13.66,9 15,10.34 15,12 Z"
    />
  ),
  wing: (
    <path d="M2,20 C4,20.5 10,21 15,20 C15,20 13,19.5 11,18 C15,19 19,17 20,14 C19,15.5 17,16 15,15 C19,14 21,10 21,6 C20,9 18,11 15,10 C13,9 14,6 13,2 C9,5 10,10 8,14 C6,18 2,20 2,20 Z" />
  ),
  hourglass: (
    <>
      <rect x="5" y="2" width="14" height="2" rx="1" />
      <rect x="5" y="20" width="14" height="2" rx="1" />
      <polygon points="6,4 18,4 12,12" />
      <polygon points="6,20 18,20 12,12" />
    </>
  ),
  buffArrow: (
    <>
      <path d="M12,3 L19,10.5 L16.7,10.5 L12,6.3 L7.3,10.5 L5,10.5 Z" />
      <path d="M12,10.5 L19,18 L16.7,18 L12,13.8 L7.3,18 L5,18 Z" />
    </>
  ),
  debuffArrow: (
    <>
      <path d="M5,6 L7.3,6 L12,10.2 L16.7,6 L19,6 L12,13.5 Z" />
      <path d="M5,13.5 L7.3,13.5 L12,17.7 L16.7,13.5 L19,13.5 L12,21 Z" />
    </>
  ),
  map: (
    <>
      <path
        fillRule="evenodd"
        d="M4,4 L9,6 L14,4 L20,6 L20,20 L15,18 L10,20 L4,18 Z M9.2,6.5 L9.9,6.5 L9.9,19.2 L9.2,19.2 Z M14.1,4.5 L14.8,4.5 L14.8,17.5 L14.1,17.5 Z"
      />
      <rect x="11.3" y="12" width="1.4" height="5" rx="0.7" transform="rotate(45 12 14.5)" />
      <rect x="11.3" y="12" width="1.4" height="5" rx="0.7" transform="rotate(-45 12 14.5)" />
    </>
  ),
  flag: (
    <>
      <rect x="5" y="2" width="1.8" height="20" rx="0.6" />
      <path d="M6.8,3 L19,6.5 L15,8.2 L19,10 L6.8,13.2 Z" />
    </>
  ),
  gear: (
    <>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <rect key={deg} x="11.2" y="1.4" width="1.6" height="4.2" rx="0.4" transform={`rotate(${deg} 12 12)`} />
      ))}
      <path fillRule="evenodd" d="M12,6 C15.31,6 18,8.69 18,12 C18,15.31 15.31,18 12,18 C8.69,18 6,15.31 6,12 C6,8.69 8.69,6 12,6 Z M12,9.5 C10.62,9.5 9.5,10.62 9.5,12 C9.5,13.38 10.62,14.5 12,14.5 C13.38,14.5 14.5,13.38 14.5,12 C14.5,10.62 13.38,9.5 12,9.5 Z" />
    </>
  ),
  crosshairIcon: (
    <>
      <path fillRule="evenodd" d="M12,4 C16.42,4 20,7.58 20,12 C20,16.42 16.42,20 12,20 C7.58,20 4,16.42 4,12 C4,7.58 7.58,4 12,4 Z M12,6.6 C9.02,6.6 6.6,9.02 6.6,12 C6.6,14.98 9.02,17.4 12,17.4 C14.98,17.4 17.4,14.98 17.4,12 C17.4,9.02 14.98,6.6 12,6.6 Z" />
      <rect x="11.2" y="1" width="1.6" height="3.4" />
      <rect x="11.2" y="19.6" width="1.6" height="3.4" />
      <rect x="1" y="11.2" width="3.4" height="1.6" />
      <rect x="19.6" y="11.2" width="3.4" height="1.6" />
      <circle cx="12" cy="12" r="1.3" />
    </>
  ),
  pickaxe: (
    <g transform={ROTATE_45}>
      <rect x="11" y="8" width="2" height="14" rx="1" />
      <path d="M4,5 C7,2 10,2 12,4 C10,6 8,7 5,8.2 C4,7.5 3.4,6 4,5 Z" />
      <path d="M20,5 C17,2 14,2 12,4 C14,6 16,7 19,8.2 C20,7.5 20.6,6 20,5 Z" />
    </g>
  ),
  fist: (
    <>
      <rect x="5" y="9" width="13" height="9" rx="4" />
      <rect x="8" y="17" width="7" height="4" rx="1.5" />
      <circle cx="7.6" cy="9.3" r="2.1" />
      <circle cx="10.3" cy="8.7" r="2.2" />
      <circle cx="13" cy="8.7" r="2.2" />
      <circle cx="15.6" cy="9.3" r="2" />
      <path d="M3,13 C1.5,13 1,15 2,16.5 C3,18 5,17.5 6,16 L7,13.5 C6,12.5 4,12.5 3,13 Z" />
    </>
  ),
  arrowUp: <polygon points="12,3 19.5,11 14.4,11 14.4,21 9.6,21 9.6,11 4.5,11" />,
  arrowDown: <polygon points="12,21 4.5,13 9.6,13 9.6,3 14.4,3 14.4,13 19.5,13" />,
  arrowLeft: <polygon points="3,12 11,4.5 11,9.6 21,9.6 21,14.4 11,14.4 11,19.5" />,
  arrowRight: <polygon points="21,12 13,4.5 13,9.6 3,9.6 3,14.4 13,14.4 13,19.5" />,
  jump: (
    <>
      <polygon points="12,2 19,9.5 14.3,9.5 14.3,16.5 9.7,16.5 9.7,9.5 5,9.5" />
      <rect x="5" y="19" width="14" height="2.4" rx="1.2" />
    </>
  ),
  sprint: (
    <>
      <polygon points="3.5,4.5 10.5,12 3.5,19.5 7.3,19.5 14.3,12 7.3,4.5" />
      <polygon points="11.5,4.5 18.5,12 11.5,19.5 15.3,19.5 22.3,12 15.3,4.5" />
    </>
  ),
  crouch: (
    <>
      <polygon points="4.5,3.5 12,10.5 19.5,3.5 19.5,7.3 12,14.3 4.5,7.3" />
      <polygon points="4.5,11.5 12,18.5 19.5,11.5 19.5,15.3 12,22.3 4.5,15.3" />
    </>
  ),
  hardDrop: (
    <>
      <polygon points="12,16.5 5,9 9.7,9 9.7,2 14.3,2 14.3,9 19,9" />
      <rect x="5" y="19" width="14" height="2.4" rx="1.2" />
    </>
  ),
  swap: (
    <>
      <polygon points="21,7.5 14.5,2 14.5,5.4 4,5.4 4,9.6 14.5,9.6 14.5,13" />
      <polygon points="3,16.5 9.5,11 9.5,14.4 20,14.4 20,18.6 9.5,18.6 9.5,22" />
    </>
  ),
  rotateCw: (
    <>
      <path d="M12,4.4 A8.1,8.1 0 1,1 3.9,12.5 L6.7,12.5 A5.3,5.3 0 1,0 12,7.2 Z" />
      <polygon points="11.2,2 16.9,5.8 11.2,9.6" />
    </>
  ),
  rotateCcw: (
    <>
      <path d="M12,4.4 A8.1,8.1 0 1,0 20.1,12.5 L17.3,12.5 A5.3,5.3 0 1,1 12,7.2 Z" />
      <polygon points="12.8,2 7.1,5.8 12.8,9.6" />
    </>
  ),
  restart: (
    <>
      <path d="M12,4.4 A8.1,8.1 0 1,0 20.1,12.5 L17.3,12.5 A5.3,5.3 0 1,1 12,7.2 Z" />
      <polygon points="12.8,2 7.1,5.8 12.8,9.6" />
      <circle cx="12" cy="12.5" r="2" />
    </>
  ),
  hand: (
    <>
      <rect x="6.9" y="9.6" width="10.2" height="11.4" rx="4" />
      <rect x="7.5" y="4" width="2.5" height="8" rx="1.25" />
      <rect x="10.75" y="2.8" width="2.5" height="9.2" rx="1.25" />
      <rect x="14" y="4" width="2.5" height="8" rx="1.25" />
      <rect x="3.8" y="11.6" width="4.6" height="3.2" rx="1.6" transform="rotate(-28 6.1 13.2)" />
    </>
  ),
  pin: (
    <path
      fillRule="evenodd"
      d="M12,2 C16,2 19,5 19,9 C19,14 12,22 12,22 C12,22 5,14 5,9 C5,5 8,2 12,2 Z M12,6.4 C10.56,6.4 9.4,7.56 9.4,9 C9.4,10.44 10.56,11.6 12,11.6 C13.44,11.6 14.6,10.44 14.6,9 C14.6,7.56 13.44,6.4 12,6.4 Z"
    />
  ),
  pause: (
    <>
      <rect x="6" y="4" width="4.2" height="16" rx="1.3" />
      <rect x="13.8" y="4" width="4.2" height="16" rx="1.3" />
    </>
  ),
  menu: (
    <>
      <rect x="4" y="5" width="16" height="2.8" rx="1.4" />
      <rect x="4" y="10.6" width="16" height="2.8" rx="1.4" />
      <rect x="4" y="16.2" width="16" height="2.8" rx="1.4" />
    </>
  ),
  skip: (
    <>
      <polygon points="5,4.5 15,12 5,19.5" />
      <rect x="16" y="4.5" width="3.2" height="15" rx="1.2" />
    </>
  ),
  check: <polygon points="3.5,13.5 6.3,10.7 9.5,13.9 17.7,4.5 20.5,7 9.5,19.5" />,
  cross: (
    <>
      <rect x="10.6" y="2.5" width="2.8" height="19" rx="1.4" transform="rotate(45 12 12)" />
      <rect x="10.6" y="2.5" width="2.8" height="19" rx="1.4" transform="rotate(-45 12 12)" />
    </>
  ),
};

export function GameIcon({
  name,
  size = 24,
  color,
  className,
}: {
  name: GameIconName;
  size?: number;
  color?: string;
  className?: string;
}) {
  const style: CSSProperties = { color, display: "block" };
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      data-jgui="icon"
      data-icon={name}
      className={className}
      style={style}
      fill="currentColor"
    >
      {ICONS[name]}
    </svg>
  );
}

const ITEM_ID_RULES: readonly [readonly string[], GameIconName][] = [
  [["crossbow"], "crossbow"],
  [["longbow", "shortbow", "recurve", "bow"], "bow"],
  [["dagger", "knife", "shiv"], "dagger"],
  [["greatsword", "broadsword", "sword", "blade", "saber", "sabre"], "sword"],
  [["axe", "hatchet"], "axe"],
  [["hammer", "mace", "club", "maul"], "hammer"],
  [["spear", "lance", "pike", "javelin"], "spear"],
  [["staff", "rod"], "staff"],
  [["wand"], "wand"],
  [["pistol", "rifle", "musket", "gun"], "gun"],
  [["arrow", "bolt"], "arrow"],
  [["bomb", "grenade", "dynamite", "tnt"], "bomb"],
  [["shield", "buckler"], "shield"],
  [["helmet", "helm", "hood", "cap"], "helmet"],
  [["chestplate", "breastplate", "cuirass", "armor", "armour", "vest"], "chestplate"],
  [["boots", "greaves", "shoe", "sabaton"], "boots"],
  [["gauntlet", "glove", "vambrace"], "gauntlet"],
  [["ring", "band"], "ring"],
  [["amulet", "necklace", "pendant", "locket"], "amulet"],
  [["cloak", "cape", "mantle"], "cloak"],
  [["backpack", "rucksack", "satchel", "bag", "pack"], "backpack"],
  [["torch"], "torch"],
  [["potionred", "redpotion", "healthpotion", "healingpotion"], "potionRed"],
  [["potionblue", "bluepotion", "manapotion", "energypotion"], "potionBlue"],
  [["potion", "elixir", "brew", "flask", "vial"], "potionRed"],
  [["scroll"], "scroll"],
  [["tome", "grimoire", "spellbook", "book"], "tome"],
  [["meat", "drumstick", "steak"], "meat"],
  [["bread", "loaf", "baguette"], "bread"],
  [["apple"], "apple"],
  [["fish", "salmon", "trout"], "fish"],
  [["wood", "log", "timber", "plank"], "wood"],
  [["ore"], "ore"],
  [["ingot", "bar"], "ingot"],
  [["gem", "jewel", "sapphire", "ruby", "emerald"], "gem"],
  [["crystal", "shard"], "crystal"],
  [["coin", "gold", "currency", "gil", "credit"], "coin"],
  [["key"], "key"],
  [["chest", "crate", "coffer"], "chest"],
  [["feather", "plume", "quill"], "feather"],
  [["stone", "rock", "pebble", "boulder"], "stone"],
  [["fire", "flame", "burn", "ember"], "fire"],
  [["frost", "ice", "snow", "chill"], "frost"],
  [["lightning", "thunder", "shock", "static"], "lightning"],
  [["poison", "venom", "toxic", "acid"], "poison"],
  [["leaf", "herb", "plant", "grass"], "leaf"],
  [["skull", "bone"], "skull"],
  [["heart", "life"], "heart"],
  [["star"], "star"],
  [["eye"], "eye"],
  [["wing", "feathers"], "wing"],
  [["hourglass", "time", "clock", "sand"], "hourglass"],
  [["buff", "boost"], "buffArrow"],
  [["debuff", "weaken", "curse"], "debuffArrow"],
  [["map"], "map"],
  [["flag", "banner", "pennant"], "flag"],
  [["gear", "cog", "sprocket"], "gear"],
  [["crosshair", "target", "scope", "reticle"], "crosshairIcon"],
  [["pickaxe", "pick"], "pickaxe"],
  [["fist", "punch", "knuckle"], "fist"],
];

type KeywordRule = readonly [readonly string[], GameIconName];

/** First rule whose any keyword is a substring of the lowercased value, or null. */
function matchKeywordRules(rules: readonly KeywordRule[], value: string): GameIconName | null {
  const id = value.toLowerCase();
  for (const [keywords, icon] of rules) {
    for (const keyword of keywords) {
      if (id.includes(keyword)) return icon;
    }
  }
  return null;
}

export function iconForItemId(itemId: string): GameIconName | null {
  return matchKeywordRules(ITEM_ID_RULES, itemId);
}

const ACTION_RULES: readonly [readonly string[], GameIconName][] = [
  [["rotatecw", "rotateright", "spincw"], "rotateCw"],
  [["rotateccw", "rotateleft", "spinccw"], "rotateCcw"],
  [["rotate", "spin"], "rotateCw"],
  [["harddrop", "slam"], "hardDrop"],
  [["softdrop"], "arrowDown"],
  [["jump", "hop", "leap"], "jump"],
  [["sprint", "dash", "boost"], "sprint"],
  [["crouch", "sneak", "duck", "slide"], "crouch"],
  [["hold", "swap", "stash", "switch"], "swap"],
  [["restart", "reset", "retry", "again", "newrun", "newgame"], "restart"],
  [["pause"], "pause"],
  [["menu", "options", "settings"], "menu"],
  [["endturn", "skip", "pass"], "skip"],
  [["ping", "waypoint", "marker"], "pin"],
  [["ability", "cast", "spell", "power", "special"], "lightning"],
  [["interact", "use", "activate", "talk", "grab", "pickup"], "hand"],
  [["attack", "strike", "melee", "punch", "hit"], "sword"],
  [["shoot", "fire", "aim"], "crosshairIcon"],
  [["mine", "dig"], "pickaxe"],
  [["build", "place"], "hammer"],
  [["inventory", "backpack", "bag"], "backpack"],
  [["map"], "map"],
  [["confirm", "accept", "submit"], "check"],
  [["cancel", "close", "dismiss"], "cross"],
  [["up", "forward"], "arrowUp"],
  [["down", "back"], "arrowDown"],
  [["left"], "arrowLeft"],
  [["right"], "arrowRight"],
];

/** Control glyph for a semantic action name (`hardDrop`, `sprint`, `shiftLeft`), or null when no rule matches. */
export function iconForAction(action: string): GameIconName | null {
  return matchKeywordRules(ACTION_RULES, action);
}
