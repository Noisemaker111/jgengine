import { useState } from "react";
import { useDisplayProfile } from "@jgengine/react/display";
import { GameCursor } from "@jgengine/react/gameCursor";
import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";
import { useViewportScrollLock } from "@jgengine/react/gameMenu";
import { useCurrency, useEntityStat, usePlayer } from "@jgengine/react/hooks";
import { useMenuNav } from "@jgengine/react/menuNav";
import { BurnerPhone, type PhonePad } from "../fiction/BurnerPhone";
import { HH, KeyLegend, money, navItem, useMenuSound, useMoveTick } from "../fiction/kit";
import { PhoneSettings, type SettingsPad } from "../fiction/PhoneSettings";

const HOME: readonly { id: "resume" | "save" | "settings"; label: string; icon: GameIconName }[] = [
  { id: "resume", label: "Back to the coast", icon: "arrowRight" },
  { id: "save", label: "Save progress", icon: "pin" },
  { id: "settings", label: "Settings & controls", icon: "gear" },
];

/**
 * Off the clock: the city stops and the courier pulls out the burner. The home screen resumes, saves
 * the bay or opens the Settings app; the softkeys and d-pad under the screen work like the keyboard.
 */
export function PausePhone({ onResume, onSave, notice, bayLabel, kept }: { onResume: () => void; onSave: () => void; notice: string; bayLabel: string; kept: string }) {
  const compact = useDisplayProfile().compact;
  const sound = useMenuSound();
  useViewportScrollLock(true);
  const [page, setPage] = useState<"home" | "settings">("home");
  const [pad, setPad] = useState<SettingsPad | null>(null);
  const { userId } = usePlayer();
  const cash = useCurrency("cash");
  const cred = useEntityStat(userId, "level")?.current ?? 1;
  const confirm = (id: string) => {
    sound.play("confirm");
    if (id === "resume") onResume();
    else if (id === "save") onSave();
    else setPage("settings");
  };
  const resume = () => {
    sound.play("back");
    onResume();
  };
  const nav = useMenuNav({ ids: HOME.map((item) => item.id), initialId: "resume", enabled: page === "home", onConfirm: confirm, onBack: resume });
  useMoveTick(nav.activeId, page === "home");
  const home = page === "home";
  const phonePad: PhonePad = home
    ? { up: () => nav.move("up"), down: () => nav.move("down"), ok: () => { if (nav.activeId !== null) confirm(nav.activeId); } }
    : { up: () => pad?.move("up"), down: () => pad?.move("down"), left: () => pad?.adjust(-1), right: () => pad?.adjust(1), ok: () => pad?.confirm() };
  return (
    <div className={`hh-pause ${compact ? "compact" : ""}`} role="presentation">
      <i className="hh-pause-scrim" aria-hidden="true" />
      {compact ? null : (
        <div className="hh-pause-side">
          <span className="hh-pause-kicker">Mainsail · the clock is stopped</span>
          <h1 className="hh-pause-title">Off the<br />clock</h1>
          <p className="hh-pause-line">The city and the delivery clock wait for you.</p>
          <KeyLegend items={[{ keys: ["↑", "↓"], label: "choose" }, { keys: ["Enter"], label: "select" }, { keys: ["Esc"], label: home ? "resume" : "back" }]} />
        </div>
      )}
      <BurnerPhone
        label="Paused"
        app={home ? "Off the clock" : "Settings"}
        className="hh-pause-phone"
        notice={home ? notice : undefined}
        softLeft={{ label: "Select", run: () => phonePad.ok?.() }}
        softRight={{ label: home ? "Resume" : "Back", run: home ? resume : () => setPage("home") }}
        pad={phonePad}
        keypad={!compact}
      >
        {home ? (
          <div className="hh-home">
            <div className="hh-home-wallet">
              <b>{money(cash)}</b>
              <span>Cred {cred}</span>
            </div>
            <nav className="hh-home-menu" aria-label="Pause menu" {...nav.containerProps}>
              {HOME.map((item) => (
                <button key={item.id} type="button" className="hh-home-row" {...navItem(nav.itemProps(item.id))} onClick={() => { nav.setActive(item.id); confirm(item.id); }}>
                  <GameIcon name={item.icon} size={18} />
                  <span>{item.label}</span>
                </button>
              ))}
              <GameCursor variant="chevron" color={HH.lcdInk} gap={2} thickness={3} arm={10} />
            </nav>
            <div className="hh-home-foot">
              <span>{bayLabel === "" ? "Not filed yet" : `Bay · ${bayLabel}`}</span>
              <span>{kept}</span>
            </div>
          </div>
        ) : (
          <PhoneSettings active={!home} onBack={() => setPage("home")} onPad={setPad} />
        )}
      </BurnerPhone>
    </div>
  );
}
