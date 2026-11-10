/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { GameIcon, type GameIconName } from "@jgengine/core/ui/icons/gameIcons.view";

/** Icons the engine's set already draws, by LLMville's name for them. */
const ENGINE_ICONS = {
  close: "cross",
  check: "check",
  next: "arrowRight",
  back: "arrowLeft",
  settings: "gear",
  coins: "coin",
} as const satisfies Record<string, GameIconName>;

/** LLMville's own line icons, for what the engine's set has no drawing of: account, chat and lab glyphs. */
const LINE_ICONS = {
  play: <polygon points="6 4 20 12 6 20 6 4" />,
  spinner: <path d="M21 12a9 9 0 1 1-6.2-8.56" />,
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  send: (
    <>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4Z" />
    </>
  ),
  chat: <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" />,
  award: (
    <>
      <circle cx="12" cy="8" r="6" />
      <path d="M8.2 13.9 7 22l5-3 5 3-1.2-8.1" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />
      <path d="M19 15v4" />
      <path d="M17 17h4" />
      <path d="M5 3v3" />
      <path d="M3.5 4.5h3" />
    </>
  ),
  cpu: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </>
  ),
  logOut: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  logIn: (
    <>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="m10 17 5-5-5-5" />
      <path d="M15 12H3" />
    </>
  ),
  pencil: (
    <>
      <path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </>
  ),
} as const satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ENGINE_ICONS | keyof typeof LINE_ICONS;

const isEngineIcon = (name: IconName): name is keyof typeof ENGINE_ICONS => name in ENGINE_ICONS;

/** One LLMville icon: the engine's drawing where it has one, LLMville's line drawing otherwise. Sized by `size` or by classes. */
export function Icon({
  name,
  size = 24,
  strokeWidth = 2,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string | undefined;
}) {
  if (isEngineIcon(name)) {
    return <GameIcon name={ENGINE_ICONS[name]} size={size} {...(className === undefined ? {} : { className })} />;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {LINE_ICONS[name]}
    </svg>
  );
}
