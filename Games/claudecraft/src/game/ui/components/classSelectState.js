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
];
export function isHeroNameValid(name) {
    return /^[A-Za-z][A-Za-z' -]{1,15}$/.test(name.trim());
}
export function selectClass(_current, classId) {
    return classId;
}
export function classSelectReady(selected, name) {
    return selected !== null && isHeroNameValid(name);
}
export function pickSuggestedName(random = Math.random) {
    return SUGGESTED_NAMES[Math.floor(random() * SUGGESTED_NAMES.length)] ?? "Adventurer";
}
