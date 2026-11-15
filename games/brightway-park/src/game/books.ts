/**
 * The haunt's calendar and ledger as content: a season of eight moons, eight nights a moon; the
 * lines the ledger adds up when each moon closes; and the rumors the proprietor can spread. The
 * world declaration (`park.ts`) turns each line into `month.<id>` (this moon so far) and
 * `report.<id>` (the last moon closed), and each rumor into an action in the `ads` queue.
 */

import { DAY_LENGTH } from "./catalog";

/** Nights in a moon. A night is `DAY_LENGTH` seconds, so a moon is 20 minutes at 1x. */
export const MONTH_DAYS = 8;

/** The season of nights: the haunt wakes under the Harvest Moon, and the eighth moon closes a season. */
const MONTH_NAMES: readonly string[] = ["Harvest Moon", "Hunter's Moon", "Frost Moon", "Long Night Moon", "Wolf Moon", "Snow Moon", "Worm Moon", "Pink Moon"];

export interface ParkDate {
  year: number;
  /** Months since the park opened, from 0. */
  monthIndex: number;
  month: string;
  dayOfMonth: number;
}

/** The night of each moon the moon is full: the living come in droves and every scare is worth more. */
export const FULL_MOON_NIGHT = 5;
/** How much more of the living head for the gate on a full-moon night, and how much more each scare yields. */
export const FULL_MOON = { arrivals: 1.6, harvest: 1.25 } as const;

/** Whether this park night is a full moon. */
export function isFullMoon(day: number): boolean {
  return parkDate(day).dayOfMonth === FULL_MOON_NIGHT;
}

/** The calendar date of a park night (night 1 is the first night of the Harvest Moon, season 1). */
export function parkDate(day: number): ParkDate {
  const d = Math.max(0, day - 1);
  const monthIndex = Math.floor(d / MONTH_DAYS);
  return {
    year: Math.floor(monthIndex / MONTH_NAMES.length) + 1,
    monthIndex,
    month: MONTH_NAMES[monthIndex % MONTH_NAMES.length] ?? "Harvest Moon",
    dayOfMonth: (d % MONTH_DAYS) + 1,
  };
}

/** "Night 3, Hunter's Moon": a park night as the HUD shows it. */
export function parkDateLabel(day: number): string {
  const date = parkDate(day);
  return `Night ${date.dayOfMonth}, ${date.month}${date.year > 1 ? ` S${date.year}` : ""}`;
}

/** Seconds of park time as the player reads them: hours under a night, nights above. */
export function parkDuration(seconds: number): string {
  if (seconds < DAY_LENGTH) return `${Math.max(1, Math.ceil(seconds / (DAY_LENGTH / 24)))}h`;
  const days = Math.round((seconds / DAY_LENGTH) * 10) / 10;
  return `${days} night${days === 1 ? "" : "s"}`;
}

/** "the Frost Moon, season 1": how a moon reads on the HUD and in a scenario's deadline. */
export function monthLabel(monthIndex: number): string {
  return `the ${MONTH_NAMES[monthIndex % MONTH_NAMES.length] ?? "Harvest Moon"}, season ${Math.floor(monthIndex / MONTH_NAMES.length) + 1}`;
}

export interface BookLine {
  id: string;
  label: string;
  /** Money in (true) or out (false). */
  income: boolean;
}

/** What the moon's ledger adds up. Building and land is what is left over: the vault's change less every line here. */
export const BOOK_LINES: readonly BookLine[] = [
  { id: "gate", label: "Gate toll", income: true },
  { id: "rides", label: "Ride scares", income: true },
  { id: "scares", label: "Prop scares", income: true },
  { id: "screams", label: "Screams", income: true },
  { id: "shops", label: "Stall nerve", income: true },
  { id: "ghosts", label: "Ghost residents", income: true },
  { id: "awards", label: "Rumor awards and prizes", income: true },
  { id: "loan", label: "Borrowed from the Ferryman (net)", income: true },
  { id: "wages", label: "Spook upkeep", income: false },
  { id: "upkeep", label: "Ride, stall and prop upkeep", income: false },
  { id: "restock", label: "Restocking", income: false },
  { id: "repairs", label: "Repairs and tinkering", income: false },
  { id: "research", label: "Séances", income: false },
  { id: "marketing", label: "Rumor-mongering", income: false },
  { id: "interest", label: "Ferryman's interest", income: false },
  { id: "exorcism", label: "Exorcisms", income: false },
];

export interface Campaign {
  id: string;
  label: string;
  blurb: string;
  cost: number;
  /** How long it runs, in park nights. */
  days: number;
  /** How much it multiplies the living heading for the gate while it runs (rumors add up). */
  boost: number;
}

export const CAMPAIGNS: readonly Campaign[] = [
  { id: "ad_leaflets", label: "Chalk warnings on the pier", blurb: "KEEP OUT, scrawled on every bench in town. Nothing brings the brave like being told not to come.", cost: 300, days: 2, boost: 0.5 },
  { id: "ad_posters", label: "A cursed chain letter", blurb: "Pass it on to five friends or the carousel comes for you.", cost: 800, days: 4, boost: 0.8 },
  { id: "ad_radio", label: "Late-night radio static", blurb: "At 3 a.m. every radio in the county plays the carousel organ, backwards.", cost: 2000, days: 6, boost: 1.5 },
];
