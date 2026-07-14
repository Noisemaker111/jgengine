export const SUGGESTED_NAMES = [
  "Aldric",
  "Brynn",
  "Cael",
  "Dara",
  "Eirik",
  "Faye",
  "Gorm",
  "Isolde",
  "Kael",
  "Rowan",
  "Sable",
  "Thane",
] as const;

export function isHeroNameValid(name: string): boolean {
  return /^[A-Za-z][A-Za-z' -]{1,15}$/.test(name.trim());
}

export function selectClass(_current: string | null, classId: string): string {
  return classId;
}

export function classSelectReady(selected: string | null, name: string): boolean {
  return selected !== null && isHeroNameValid(name);
}

export function pickSuggestedName(random: () => number = Math.random): string {
  return SUGGESTED_NAMES[Math.floor(random() * SUGGESTED_NAMES.length)] ?? "Adventurer";
}
