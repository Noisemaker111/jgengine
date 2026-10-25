import type { ReactNode } from "react";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useGameStore } from "@jgengine/react/hooks";
import { Battery, clockText, Lcd, SignalBars } from "./kit";

/** A physical key's job: the label printed on the screen above it and what pressing it does. */
export interface PhoneKey {
  label: string;
  run: () => void;
}

/** The d-pad's directions, for screens that let the keypad drive them. */
export interface PhonePad {
  up?: () => void;
  down?: () => void;
  left?: () => void;
  right?: () => void;
  ok?: () => void;
}

const NUMPAD = [
  ["1", ""], ["2", "ABC"], ["3", "DEF"],
  ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
  ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"],
  ["*", ""], ["0", "+"], ["#", ""],
] as const;

/** Keys never take focus from the menu on the screen: the screen keeps keyboard and gamepad focus. */
const keep = (event: { preventDefault: () => void }) => event.preventDefault();

function Pad({ dir, run }: { dir: "up" | "down" | "left" | "right"; run?: () => void }) {
  const icon = dir === "up" ? "arrowUp" : dir === "down" ? "arrowDown" : dir === "left" ? "arrowLeft" : "arrowRight";
  return (
    <button type="button" tabIndex={-1} className={`hh-pad ${dir}`} aria-label={dir} onMouseDown={keep} onClick={run} disabled={run === undefined}>
      <GameIcon name={icon} size={11} />
    </button>
  );
}

/**
 * The courier's burner: a chunky candybar phone with a stub antenna, an amber LCD and a rubber keypad.
 * Pause, settings and the city phone (T) are all apps on this one handset, so the player always
 * reaches for the same object. The keypad's softkeys and d-pad work; the number keys are just keys.
 */
export function BurnerPhone({
  app,
  children,
  softLeft,
  softRight,
  pad,
  notice,
  className,
  label,
  keypad = true,
}: {
  app: ReactNode;
  children: ReactNode;
  softLeft?: PhoneKey;
  softRight?: PhoneKey;
  pad?: PhonePad;
  notice?: ReactNode;
  className?: string;
  label: string;
  keypad?: boolean;
}) {
  const clock = useGameStore((ctx) => {
    const calendar = ctx.time.calendar();
    return clockText(calendar.hour, calendar.minute);
  });
  return (
    <div className={`hh-phone ${className ?? ""}`} role="dialog" aria-label={label}>
      <i className="hh-phone-antenna" aria-hidden="true" />
      <div className="hh-phone-body">
        <div className="hh-phone-top" aria-hidden="true">
          <i className="hh-earpiece" />
          <span className="hh-phone-brand">MAINSAIL<em>tel</em></span>
        </div>
        <div className="hh-phone-bezel">
          <Lcd className="hh-phone-lcd">
            <header className="hh-lcd-status">
              <SignalBars strength={3} />
              <span>{clock}</span>
              <Battery level={2} />
            </header>
            <div className="hh-lcd-app">{app}</div>
            <div className="hh-lcd-body">{children}</div>
            {notice === undefined || notice === null || notice === "" ? null : <div className="hh-lcd-notice" role="status">{notice}</div>}
            <footer className="hh-lcd-soft" aria-hidden="true">
              <span>{softLeft?.label ?? ""}</span>
              <span>{softRight?.label ?? ""}</span>
            </footer>
          </Lcd>
        </div>
        <div className="hh-phone-keys">
          <div className="hh-phone-nav">
            <button type="button" tabIndex={-1} className="hh-soft left" aria-label={softLeft?.label ?? "Left key"} onMouseDown={keep} onClick={softLeft?.run} disabled={softLeft === undefined}><i /></button>
            <div className="hh-dpad">
              <Pad dir="up" run={pad?.up} />
              <Pad dir="left" run={pad?.left} />
              <button type="button" tabIndex={-1} className="hh-pad ok" aria-label="OK" onMouseDown={keep} onClick={pad?.ok} disabled={pad?.ok === undefined}><i /></button>
              <Pad dir="right" run={pad?.right} />
              <Pad dir="down" run={pad?.down} />
            </div>
            <button type="button" tabIndex={-1} className="hh-soft right" aria-label={softRight?.label ?? "Right key"} onMouseDown={keep} onClick={softRight?.run} disabled={softRight === undefined}><i /></button>
          </div>
          {keypad ? (
            <div className="hh-numpad" aria-hidden="true">
              {NUMPAD.map(([digit, letters]) => (
                <span key={digit} className="hh-numkey"><b>{digit}</b><small>{letters}</small></span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
