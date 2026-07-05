import { getCurrentGameTimestamp, sanitizeGameTimeScale } from "@jgengine/core/time/gameClock";

export interface GameTime {
  year: number;
  month: number;
  monthName: string;
  monthNameFull: string;
  dayOfMonth: number;
  hour: number;
  minute: number;
  second: number;
  formattedDate: string;
  formattedDateFull: string;
  formattedTime: string;
  formatted: string;
}

const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function computeGameTime(gameTimestamp: number): GameTime {
  const d = new Date(gameTimestamp);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const monthName = MONTH_NAMES_SHORT[d.getMonth()] ?? "Jan";
  const monthNameFull = MONTH_NAMES_FULL[d.getMonth()] ?? "January";
  const dayOfMonth = d.getDate();
  const hour = d.getHours();
  const minute = d.getMinutes();
  const second = d.getSeconds();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const hour12 = hour % 12 || 12;
  const ampm = hour < 12 ? "AM" : "PM";
  const formattedDate = `${monthName} ${dayOfMonth}, ${year}`;
  const formattedDateFull = `${monthNameFull} ${dayOfMonth}, ${year}`;
  const formattedTime = `${hour12}:${pad(minute)} ${ampm}`;
  const formatted = `${formattedDate} ${formattedTime}`;

  return {
    year,
    month,
    monthName,
    monthNameFull,
    dayOfMonth,
    hour,
    minute,
    second,
    formattedDate,
    formattedDateFull,
    formattedTime,
    formatted,
  };
}

export function computeClientServerOffset(serverNow: number, clientNow: number): number {
  return serverNow - clientNow;
}

export function getGameClockTimestamp(
  createdAt: number,
  serverNow: number,
  clientNow: number,
  gameTimeScale?: number,
): number {
  const clientOffsetMs = computeClientServerOffset(serverNow, clientNow);
  return getCurrentGameTimestamp(createdAt, clientNow + clientOffsetMs, sanitizeGameTimeScale(gameTimeScale));
}
