export const SECONDS_PER_HOUR = 3600;

export function servingIncomePerHour(servingIncomeRate: number): number {
  return servingIncomeRate * SECONDS_PER_HOUR;
}

export function servingThroughputPerHour(servingThroughputTps: number): number {
  return Math.round(servingThroughputTps * SECONDS_PER_HOUR);
}