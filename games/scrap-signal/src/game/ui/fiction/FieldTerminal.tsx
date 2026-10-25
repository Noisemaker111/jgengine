import type { CSSProperties, ReactNode } from "react";
import { useDisplayProfile } from "@jgengine/react";
import { GameCursor } from "@jgengine/react/gameCursor";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useCurrency, useEntityStat, usePlayer } from "@jgengine/react/hooks";
import { useMenuNav } from "@jgengine/react/menuNav";
import { useStore } from "@jgengine/react/store";
import { CHARACTERS } from "../../characters";
import { characterIdStore } from "../../stores";
import { ReclaimerPortrait } from "../components/Portrait";
import { Crt, Key, navItem, Plate, SIGNAL, SignalBars, Stamp } from "./kit";
import { TerminalSettings } from "./TerminalSettings";

export type TerminalPage = "menu" | "settings";

/**
 * The reclaimer's forearm terminal, raised into view: a carbon housing strapped over the sleeve, the
 * chassis ID on a small tube at the left and the working screen at the right.
 */
export function FieldTerminalShell({ label, children, foot, compact, signal = 1 }: { label: string; children: ReactNode; foot?: ReactNode; compact: boolean; signal?: number }) {
  const characterId = useStore(characterIdStore);
  const character = CHARACTERS.find((c) => c.id === characterId) ?? CHARACTERS[0]!;
  return (
    <div className={`ss-arm ${compact ? "compact" : ""}`}>
      {!compact && <i className="ss-sleeve" aria-hidden="true" />}
      {!compact && <><i className="ss-strap left" aria-hidden="true" /><i className="ss-strap right" aria-hidden="true" /></>}
      <Plate material="carbon" cut="notch" depth={compact ? 16 : 24} rim="#4a3b29" rimWidth={3} padding="0" className="ss-wrist" style={{ "--ss-char": character.color } as CSSProperties}>
        <header className="ss-wrist-head">
          <span className="ss-led on" aria-hidden="true" /><span className="ss-led amber" aria-hidden="true" />
          <Stamp tone="amber">{label}</Stamp>
          <span className="ss-wrist-serial">RC-{character.id.toUpperCase()} · FERRALON</span>
          <SignalBars strength={signal} color={SIGNAL.amber} />
        </header>
        <div className="ss-wrist-grid">
          <TerminalId />
          <Crt className="ss-wrist-screen">{children}</Crt>
        </div>
        {foot !== undefined && <footer className="ss-wrist-foot">{foot}</footer>}
      </Plate>
    </div>
  );
}

/** The chassis ID tube: portrait, name, class and the wallet. */
function TerminalId() {
  const { userId } = usePlayer();
  const characterId = useStore(characterIdStore);
  const character = CHARACTERS.find((c) => c.id === characterId) ?? CHARACTERS[0]!;
  const level = useEntityStat(userId, "level");
  const points = useEntityStat(userId, "skillPoints");
  const cash = useCurrency("cash");
  const cores = useCurrency("cores");
  return (
    <aside className="ss-wrist-id">
      <Crt className="ss-id-tube" tint={character.color}>
        <ReclaimerPortrait id={character.id} color={character.color} />
      </Crt>
      <div className="ss-id-name" style={{ color: character.color }}>{character.name}</div>
      <div className="ss-id-class">{character.className}</div>
      <dl className="ss-id-read">
        <div><dt>LV</dt><dd>{level?.current ?? 1}</dd></div>
        <div><dt><GameIcon name="coin" size={13} /></dt><dd>{cash}</dd></div>
        <div><dt><GameIcon name="gem" size={13} /></dt><dd>{cores}</dd></div>
        {(points?.current ?? 0) > 0 && <div className="hot"><dt>PTS</dt><dd>{Math.round(points?.current ?? 0)}</dd></div>}
      </dl>
    </aside>
  );
}

const MENU = [
  { id: "resume", label: "Resume run", note: "Back into the wastes" },
  { id: "save", label: "Save checkpoint", note: "World, chassis and loot" },
  { id: "settings", label: "Settings & controls", note: "Display, sound, keys" },
] as const;

/** The pause screen: the run on hold, three commands on the tube, the controls on the keys below. */
export function PauseTerminal({ page, onPage, onResume, onSave, saveMessage }: { page: TerminalPage; onPage: (page: TerminalPage) => void; onResume: () => void; onSave: () => void; saveMessage: string }) {
  const profile = useDisplayProfile();
  const compact = profile.compact;
  const confirm = (id: string) => {
    if (id === "resume") onResume();
    else if (id === "save") onSave();
    else onPage("settings");
  };
  const nav = useMenuNav({ ids: MENU.map((m) => m.id), initialId: "resume", enabled: page === "menu", onConfirm: confirm, onBack: onResume });
  return (
    <div className="ss-scrim" role="dialog" aria-modal="true" aria-label="Run paused">
      <FieldTerminalShell
        compact={compact}
        label={page === "settings" ? "Field terminal / setup" : "Field terminal / 04"}
        foot={<ControlKeys />}
      >
        {page === "menu" ? (
          <div className="ss-term">
            <div className="ss-term-eyebrow">&gt; carrier status</div>
            <h1 className="ss-term-title">Signal on hold<span className="ss-caret" aria-hidden="true">_</span></h1>
            <p className="ss-term-line">Combat, reloads and the carrier window are paused.</p>
            <nav className="ss-term-menu" aria-label="Field terminal" {...nav.containerProps}>
              {MENU.map((item) => (
                <button key={item.id} type="button" className="ss-term-cmd" {...navItem(nav.itemProps(item.id))} onClick={() => { nav.setActive(item.id); confirm(item.id); }}>
                  <span className="ss-term-prompt" aria-hidden="true">&gt;</span>
                  <span className="ss-term-cmd-label">{item.label}</span>
                  <small>{item.note}</small>
                </button>
              ))}
              <GameCursor variant="chevron" color={SIGNAL.amber} gap={6} thickness={3} />
            </nav>
            <p className="ss-term-status" role="status">{saveMessage === "" ? "Resume, then click the world to capture the mouse. Esc releases it." : saveMessage}</p>
          </div>
        ) : (
          <div className="ss-term">
            <div className="ss-term-head">
              <button type="button" className="ss-term-back" onClick={() => onPage("menu")} aria-label="Back to the terminal menu"><GameIcon name="arrowLeft" size={14} /> Back</button>
              <span className="ss-term-eyebrow">&gt; settings &amp; controls</span>
            </div>
            <TerminalSettings active={page === "settings"} onBack={() => onPage("menu")} />
          </div>
        )}
      </FieldTerminalShell>
    </div>
  );
}

/** The controls, printed on the terminal's lower keys. */
export function ControlKeys() {
  return (
    <div className="ss-controls" aria-label="Controls">
      <span><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key><Key>Shift</Key><small>move / sprint</small></span>
      <span><Key>LMB</Key><Key>RMB</Key><small>fire / aim</small></span>
      <span><Key>E</Key><Key>R</Key><small>use / reload</small></span>
      <span><Key>Q</Key><Key>G</Key><Key>K</Key><small>heal / grenade / talents</small></span>
    </div>
  );
}
