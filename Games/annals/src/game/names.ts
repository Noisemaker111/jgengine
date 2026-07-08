const GIVEN_PREFIX = [
  "Ald",
  "Bran",
  "Cor",
  "Dun",
  "Ed",
  "Fen",
  "Gor",
  "Hal",
  "Isen",
  "Jor",
  "Kel",
  "Lor",
  "Mor",
  "Nor",
  "Os",
  "Pel",
  "Quen",
  "Rad",
  "Sael",
  "Thal",
  "Ul",
  "Vor",
  "Wyn",
  "Yor",
] as const;

const GIVEN_MIDDLE = ["a", "e", "i", "o", "u", "ar", "en", "ir", "ol", "un"] as const;

const GIVEN_SUFFIX = [
  "ric",
  "wyn",
  "gard",
  "mund",
  "frid",
  "helm",
  "dis",
  "wen",
  "thor",
  "ana",
  "eth",
  "olf",
] as const;

const EPITHETS = [
  "Steadfast",
  "Wise",
  "Bold",
  "Quiet",
  "Elder",
  "Just",
  "Grey",
  "Swift",
  "Kind",
  "Stern",
  "Watchful",
  "Fair",
  "Patient",
  "Restless",
] as const;

function pick<T>(list: readonly T[], gen: () => number): T {
  const index = Math.floor(gen() * list.length);
  return list[Math.min(index, list.length - 1)] as T;
}

export function generateGivenName(gen: () => number): string {
  return `${pick(GIVEN_PREFIX, gen)}${pick(GIVEN_MIDDLE, gen)}${pick(GIVEN_SUFFIX, gen)}`;
}

export function generateEpithet(gen: () => number): string {
  return `the ${pick(EPITHETS, gen)}`;
}
