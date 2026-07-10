export interface RadioLine {
  readonly id: string;
  readonly text: string;
  readonly at: number;
}

export const RADIO_START = "Copy — target's rolling for the border. Trust the survey, not the rock.";
export const RADIO_FEINT_FORK = "Target's taking the long fork.";
export const RADIO_FEINT_MAIN = "Target's holding the main line.";
export const RADIO_SHORTCUT_APPROACH: Record<string, string> = {
  "shortcut-1": "Survey says: slot on your left — through the shadow.",
  "shortcut-2": "Survey says: slot on your right — through the shadow.",
  "shortcut-3": "Tumbleweed screen ahead. Survey says it's a road. SAYS ROAD.",
  "shortcut-4": "That wall's a lie. Survey says punch through.",
  "shortcut-5": "Angled rock, dead ahead. Survey says: it opens. Trust it.",
  "shortcut-6": "Last slot before the arch. Survey says: SAYS RIGHT. Take it.",
};
export const RADIO_DEADEND_WARNING: Record<string, string> = {
  "deadend-1": "That mouth's wide open but survey shows a hard stop — don't commit.",
  "deadend-2": "Open throat on your flank — survey marks it dead. Hold the gorge.",
  "deadend-3": "Wide hollow ahead reads clean but the map kills it there.",
};
export const RADIO_SURGE = "Clean line — surge!";
export const RADIO_CAPTURE_CLOSING = "Ring's closing. Hold him.";
export const RADIO_CAPTURE_BROKEN = "He broke the ring — reset the tail.";
export const RADIO_BORDER_NEAR = "Arch in sight. He's not slowing down.";
export const RADIO_WIN = "Got him. Border stays shut tonight.";
export const RADIO_LOSE = "He's through the arch. Target's gone.";

export function pushRadioLine(log: readonly RadioLine[], id: string, text: string, at: number, limit = 6): readonly RadioLine[] {
  const next = [...log, { id: `${id}-${at.toFixed(2)}`, text, at }];
  return next.length > limit ? next.slice(next.length - limit) : next;
}
