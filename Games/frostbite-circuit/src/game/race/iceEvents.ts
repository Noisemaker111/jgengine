import type { IceStressChange } from "../ice/grid";
import { statusCounts, type IceWorld } from "../ice/grid";
import { CORNER_NAMES } from "./track";

export interface CornerBanner {
  readonly message: string;
  readonly corner: number;
  readonly severity: "cracked" | "open";
  readonly expiresAt: number;
}

export interface RadioLine {
  readonly id: string;
  readonly message: string;
  readonly at: number;
}

const CORRIDOR_LABEL: Record<string, string> = { inner: "Inner", mid: "Mid", outer: "Outer" };

function cornerLabel(corner: number): string {
  const name = CORNER_NAMES[corner] ?? `Corner ${corner}`;
  const dash = name.indexOf("—");
  return dash === -1 ? `CORNER ${corner}` : `CORNER ${corner} — ${name.slice(dash + 1).trim().toUpperCase()}`;
}

export const CORNER_BANNER_HOLD_SECONDS = 3.4;

export function bannersFromChanges(changes: readonly IceStressChange[], now: number): CornerBanner[] {
  const banners: CornerBanner[] = [];
  for (const change of changes) {
    if (change.to !== "cracked" && change.to !== "open") continue;
    const corridorLabel = CORRIDOR_LABEL[change.corridor] ?? change.corridor;
    const state = change.to === "open" ? "GONE — OPEN WATER" : "CRACKED";
    banners.push({
      message: `${cornerLabel(change.corner)} — ${corridorLabel.toUpperCase()} LINE ${state}`,
      corner: change.corner,
      severity: change.to,
      expiresAt: now + CORNER_BANNER_HOLD_SECONDS,
    });
  }
  return banners;
}

let radioSeq = 0;
function radioLine(message: string, at: number): RadioLine {
  radioSeq += 1;
  return { id: `radio-${radioSeq}`, message, at };
}

export function radioLinesFromChanges(changes: readonly IceStressChange[], now: number): RadioLine[] {
  const lines: RadioLine[] = [];
  for (const change of changes) {
    const corridorLabel = CORRIDOR_LABEL[change.corridor] ?? change.corridor;
    if (change.to === "cracked") {
      lines.push(
        radioLine(`Ice won't take that line twice — ${corridorLabel.toLowerCase()} line at corner ${change.corner} is cracking.`, now),
      );
    } else if (change.to === "open") {
      lines.push(radioLine(`${corridorLabel} line at corner ${change.corner} is black water now. Find another way round.`, now));
    }
  }
  return lines;
}

export function sinkRadioLine(racerName: string, corner: number, now: number): RadioLine {
  return radioLine(`Mayday — ${racerName} through the ice near corner ${corner}.`, now);
}

const LAP_FLAVOR: readonly string[] = [
  "Ice is holding. Pick your line and commit.",
  "Lap {lap} — the lake remembers where you've been.",
  "Lap {lap} — the safe lines are getting thin.",
  "Lap {lap} — the lake is mostly memory now.",
  "Final lap. Whatever's still solid is all you've got.",
];

export function lapFlavorLine(lap: number, laps: number, world: IceWorld, now: number): RadioLine {
  const counts = statusCounts(world);
  const total = counts.solid + counts.cracked + counts.open;
  const solidFraction = total === 0 ? 1 : counts.solid / total;
  const index = Math.min(LAP_FLAVOR.length - 1, lap - 1);
  const template = lap >= laps ? LAP_FLAVOR[LAP_FLAVOR.length - 1]! : LAP_FLAVOR[index]!;
  const message = template.replace("{lap}", String(lap));
  const withIce = solidFraction < 0.4 ? `${message} Only ${Math.round(solidFraction * 100)}% of the ice still solid.` : message;
  return radioLine(withIce, now);
}
