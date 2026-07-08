import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { record } from "./chronicle";
import { generateEpithet, generateGivenName } from "./names";
import { historyRng } from "./rng";

export interface Notable {
  id: string;
  name: string;
  epithet: string;
  age: number;
  trait: string;
  isMonarch: boolean;
}

const TRAITS = [
  "shrewd",
  "gentle",
  "stern",
  "cunning",
  "devout",
  "restless",
  "frugal",
  "valiant",
  "weary",
  "curious",
] as const;

const NOTABLE_COUNT = 7;
const MONARCH_MIN_AGE = 32;
const MONARCH_AGE_RANGE = 24;
const NOTABLE_MIN_AGE = 18;
const NOTABLE_AGE_RANGE = 40;
const HEIR_MIN_AGE = 18;
const HEIR_AGE_RANGE = 12;

let nextId = 0;
let people: Notable[] = [];

function pickTrait(): string {
  return TRAITS[Math.floor(historyRng() * TRAITS.length)] ?? TRAITS[0];
}

function birth(age: number, isMonarch: boolean): Notable {
  nextId += 1;
  return {
    id: `notable-${nextId}`,
    name: generateGivenName(historyRng),
    epithet: generateEpithet(historyRng),
    age,
    trait: pickTrait(),
    isMonarch,
  };
}

export function initPeople(): void {
  nextId = 0;
  people = [birth(MONARCH_MIN_AGE + Math.floor(historyRng() * MONARCH_AGE_RANGE), true)];
  for (let i = 0; i < NOTABLE_COUNT; i += 1) {
    people.push(birth(NOTABLE_MIN_AGE + Math.floor(historyRng() * NOTABLE_AGE_RANGE), false));
  }
}

export function listPeople(): readonly Notable[] {
  return people;
}

export function monarch(): Notable | undefined {
  return people.find((person) => person.isMonarch);
}

function deathHazard(age: number): number {
  if (age < 40) return 0.01;
  if (age < 60) return 0.05;
  if (age < 75) return 0.14;
  return 0.32;
}

function eldestOf(candidates: readonly Notable[]): Notable | undefined {
  return candidates.reduce<Notable | undefined>(
    (best, person) => (best === undefined || person.age > best.age ? person : best),
    undefined,
  );
}

function handleDeath(ctx: GameContext, person: Notable): void {
  people = people.filter((entry) => entry.id !== person.id);
  record(ctx, "death", `${person.name}, ${person.epithet}, ${person.trait} of the realm, has died aged ${person.age}.`);
  if (person.isMonarch) {
    const successor = eldestOf(people);
    if (successor !== undefined) {
      successor.isMonarch = true;
      record(ctx, "coronation", `${successor.name}, ${successor.epithet}, is crowned monarch of the realm.`);
    }
  }
  while (people.length < NOTABLE_COUNT + 1) {
    people.push(birth(HEIR_MIN_AGE + Math.floor(historyRng() * HEIR_AGE_RANGE), false));
  }
}

export function ageNotablesYearly(ctx: GameContext): void {
  for (const person of [...people]) {
    person.age += 1;
    if (historyRng() < deathHazard(person.age)) handleDeath(ctx, person);
  }
}
