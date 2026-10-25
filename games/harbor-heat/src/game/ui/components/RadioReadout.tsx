import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useActionGlyph } from "@jgengine/react/uiKitRoot";
import { radioStore } from "../../radio/runtime";
import { KeyCap, Lcd } from "../fiction/kit";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Only while driving: the car stereo's faceplate, a blue-green display with the dial position, the
 * station, what is on, and the line the DJ or anchor is saying. A news bulletin lights it coral. The
 * tune key changes station; on touch the faceplate itself is the button.
 */
export function RadioReadout() {
  const view = useGameStore((ctx) => radioStore.read(ctx), same);
  const { commands } = useGame();
  const glyph = useActionGlyph("radio", "R");
  if (view === null) return null;
  const credit = view.artist === null ? view.title : `${view.title} · ${view.artist}`;
  return (
    <button type="button" className="hh-radio" data-kind={view.kind} onClick={() => commands.run("radio", {})} aria-label={`Radio: ${view.station}. Change station`}>
      <Lcd className="hh-radio-lcd" alarm={view.bulletin}>
        <span className="hh-radio-top">
          <b>{view.frequency}</b>
          <span>{view.bulletin ? "News flash" : view.station}</span>
        </span>
        <span className="hh-radio-title">{credit}</span>
        <span className="hh-radio-line">{view.line ?? (view.kind === "music" ? "♪ ♪ ♪" : "")}</span>
      </Lcd>
      <span className="hh-radio-tune">
        <small>Tune</small>
        {glyph === undefined ? null : <KeyCap>{glyph}</KeyCap>}
      </span>
    </button>
  );
}
