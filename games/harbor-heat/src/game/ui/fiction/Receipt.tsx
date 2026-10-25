import { useMemo } from "react";
import { useDisplayProfile } from "@jgengine/react/display";
import { GameFrame } from "@jgengine/react/gameFrame";
import { useViewportScrollLock } from "@jgengine/react/gameMenu";
import { useGameStore } from "@jgengine/react/hooks";
import { useMenuNav } from "@jgengine/react/menuNav";
import { clockText, HH, KeyLegend, navItem, useMenuSound, useMoveTick, useScreenTouch } from "./kit";

/** A choice printed under the slip: next parcel, free roam, back to the title. */
export interface SlipAction {
  id: string;
  label: string;
  primary?: boolean;
}

/** What a slip says. `receipt` is dispatch's till roll; `tabloid` is the morning paper's front page. */
export interface Slip {
  kind: "receipt" | "tabloid";
  /** The rubber stamp across a receipt (`PAID`, `LATE`) or the paper's kicker. */
  stamp: string;
  tone: "good" | "bad" | "warn";
  title: string;
  summary: string;
  lines?: readonly { label: string; value: string }[];
  actions: readonly SlipAction[];
}

/**
 * The end of a run, as a thing the courier is handed: a delivery closes on Mainsail Express's
 * thermal till roll with a rubber stamp, and a bust or a hospital stay makes the Harbor Tribune's
 * front page. The choices under it work with arrows, Enter and Escape (the first non-primary choice),
 * a gamepad, mouse and touch.
 */
export function ReceiptScreen({ slip, onAction }: { slip: Slip; onAction: (id: string) => void }) {
  const compact = useDisplayProfile().compact;
  const sound = useMenuSound();
  useViewportScrollLock(true);
  useScreenTouch();
  const ids = useMemo(() => slip.actions.map((action) => action.id), [slip.actions]);
  const back = slip.actions.find((action) => action.primary !== true)?.id ?? ids[0];
  const pick = (id: string) => {
    sound.play("confirm");
    onAction(id);
  };
  const nav = useMenuNav({ ids, initialId: slip.actions.find((action) => action.primary === true)?.id, columns: compact ? 1 : ids.length, onConfirm: pick, onBack: () => { if (back !== undefined) { sound.play("back"); onAction(back); } } });
  useMoveTick(nav.activeId);
  const stamp = useGameStore((ctx) => {
    const calendar = ctx.time.calendar();
    return { clock: clockText(calendar.hour, calendar.minute), day: (calendar.day ?? 0) + 1 };
  }, (a, b) => a.clock === b.clock && a.day === b.day);
  return (
    <div className={`hh-slip-screen ${compact ? "compact" : ""}`} data-kind={slip.kind} role="dialog" aria-label={slip.title}>
      <i className="hh-slip-scrim" aria-hidden="true" />
      {slip.kind === "receipt" ? (
        <div className="hh-receipt" data-tone={slip.tone}>
          <header>
            <b>Mainsail Express</b>
            <span>Dispatch · Bay 3 · Day {stamp.day} · {stamp.clock}</span>
          </header>
          <h2>{slip.title}</h2>
          <p>{slip.summary}</p>
          {slip.lines === undefined || slip.lines.length === 0 ? null : (
            <dl>
              {slip.lines.map((line) => (
                <div key={line.label}><dt>{line.label}</dt><dd>{line.value}</dd></div>
              ))}
            </dl>
          )}
          <i className="hh-receipt-bars" aria-hidden="true" />
          <small className="hh-receipt-thanks">Keep the receipt. Dispatch never forgets.</small>
          <i className="hh-rubber" data-tone={slip.tone} aria-hidden="true">{slip.stamp}</i>
        </div>
      ) : (
        <GameFrame material="paper" tint="#efe6cf" cut="torn" depth={12} edge="none" padding="0" className="hh-tabloid">
          <header>
            <span>Late edition · {stamp.clock}</span>
            <b>Harbor Tribune</b>
            <span>25¢</span>
          </header>
          <em className="hh-tabloid-kicker">{slip.stamp}</em>
          <h2>{slip.title}</h2>
          <p>{slip.summary}</p>
          {slip.lines === undefined || slip.lines.length === 0 ? <i className="hh-tabloid-photo" aria-hidden="true" /> : (
            <dl className="hh-tabloid-lines">
              {slip.lines.map((line) => (
                <div key={line.label}><dt>{line.label}</dt><dd>{line.value}</dd></div>
              ))}
            </dl>
          )}
        </GameFrame>
      )}
      <nav className="hh-slip-actions" aria-label="What next" {...nav.containerProps}>
        {slip.actions.map((action) => (
          <GameFrame
            key={action.id}
            as="button"
            material="enamel"
            tint={action.primary === true ? HH.amber : HH.ink}
            cut="slant"
            depth={10}
            edge={HH.night}
            edgeWidth={2}
            padding="9px 20px 7px"
            glow={nav.activeId === action.id ? HH.cream : undefined}
            className="hh-slip-btn"
            data-primary={action.primary === true ? "" : undefined}
            {...navItem(nav.itemProps(action.id))}
            onClick={() => { nav.setActive(action.id); pick(action.id); }}
          >
            {action.label}
          </GameFrame>
        ))}
      </nav>
      {compact ? null : <KeyLegend items={[{ keys: ["←", "→"], label: "choose" }, { keys: ["Enter"], label: "go" }]} />}
    </div>
  );
}
