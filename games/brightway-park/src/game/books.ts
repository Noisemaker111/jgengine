/**
 * The park's calendar and books as content: a season of eight months, March to October, eight days a
 * month; the lines the monthly report adds up; and the marketing campaigns the office can buy.
 * The world declaration (`park.ts`) turns each line into `month.<id>` (this month so far) and
 * `report.<id>` (the last month closed), and each campaign into an action in the `ads` queue.
 */

import { DAY_LENGTH } from "./catalog";

/** Days in a park month. A day is `DAY_LENGTH` seconds, so a month is 20 minutes at 1x. */
export const MONTH_DAYS = 8;

/** The season: the park opens in March and closes its year after October. */
const MONTH_NAMES: readonly string[] = ["March", "April", "May", "June", "July", "August", "September", "October"];

export interface ParkDate {
  year: number;
  /** Months since the park opened, from 0. */
  monthIndex: number;
  month: string;
  dayOfMonth: number;
}

/** The calendar date of a park day (day 1 is 1 March, Year 1). */
export function parkDate(day: number): ParkDate {
  const d = Math.max(0, day - 1);
  const monthIndex = Math.floor(d / MONTH_DAYS);
  return {
    year: Math.floor(monthIndex / MONTH_NAMES.length) + 1,
    monthIndex,
    month: MONTH_NAMES[monthIndex % MONTH_NAMES.length] ?? "March",
    dayOfMonth: (d % MONTH_DAYS) + 1,
  };
}

/** "3 May": a park day as the HUD shows it. */
export function parkDateLabel(day: number): string {
  const date = parkDate(day);
  return `${date.dayOfMonth} ${date.month}${date.year > 1 ? ` Y${date.year}` : ""}`;
}

/** Seconds of park time as the player reads them: park hours under a day, days above. */
export function parkDuration(seconds: number): string {
  if (seconds < DAY_LENGTH) return `${Math.max(1, Math.ceil(seconds / (DAY_LENGTH / 24)))}h`;
  const days = Math.round((seconds / DAY_LENGTH) * 10) / 10;
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** "May, Year 1": how a month reads on the HUD and in a scenario's deadline. */
export function monthLabel(monthIndex: number): string {
  return `${MONTH_NAMES[monthIndex % MONTH_NAMES.length] ?? "March"}, Year ${Math.floor(monthIndex / MONTH_NAMES.length) + 1}`;
}

export interface BookLine {
  id: string;
  label: string;
  /** Money in (true) or out (false). */
  income: boolean;
}

/** What the monthly report adds up. Building and land is what is left over: the till's change less every line here. */
export const BOOK_LINES: readonly BookLine[] = [
  { id: "gate", label: "Gate tickets", income: true },
  { id: "rides", label: "Ride tickets", income: true },
  { id: "shops", label: "Shop sales", income: true },
  { id: "awards", label: "Awards and prizes", income: true },
  { id: "loan", label: "Borrowed (net)", income: true },
  { id: "wages", label: "Staff wages", income: false },
  { id: "upkeep", label: "Ride and shop upkeep", income: false },
  { id: "restock", label: "Restocking", income: false },
  { id: "repairs", label: "Repairs and servicing", income: false },
  { id: "research", label: "Research", income: false },
  { id: "marketing", label: "Marketing", income: false },
  { id: "interest", label: "Loan interest", income: false },
];

export interface Campaign {
  id: string;
  label: string;
  blurb: string;
  cost: number;
  /** How long it runs, in park days. */
  days: number;
  /** How much it multiplies the guests heading for the gate while it runs (campaigns add up). */
  boost: number;
}

export const CAMPAIGNS: readonly Campaign[] = [
  { id: "ad_leaflets", label: "Leaflets in town", blurb: "Flyers through every letterbox in Brightway.", cost: 300, days: 2, boost: 0.5 },
  { id: "ad_posters", label: "Posters on the coast road", blurb: "Day trippers see the park on the way in.", cost: 800, days: 4, boost: 0.8 },
  { id: "ad_radio", label: "Radio advert", blurb: "The whole county hears about the park.", cost: 2000, days: 6, boost: 1.5 },
];
