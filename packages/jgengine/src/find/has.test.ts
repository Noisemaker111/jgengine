import { expect, test } from "bun:test";

import type { CapabilityEntry } from "./capabilities";
import { indexCode, type CodeFile } from "./codeMap";
import { answerHas, parsePartRows, type HasSources } from "./has";

const CAPABILITIES: CapabilityEntry[] = [
  {
    skill: "jgengine-gameplay",
    slug: "knockout-taming",
    description: "knock a creature out with torpor and tame it by feeding",
    imports: ['import { createKnockoutTaming } from "@jgengine/core/taming/knockoutTaming"'],
    symbols: ["createKnockoutTaming"],
  },
  {
    skill: "jgengine-world",
    slug: "authored-weather",
    description: "scheduled precipitation and wind from one authored document",
    imports: ['import { createAuthoredWeather } from "@jgengine/core/weather/authoredWeather"'],
    symbols: ["createAuthoredWeather"],
  },
];

const FILES: Record<string, string> = {
  "taming/knockoutTaming.ts": "/** Max torpor at a level. */\nexport function maxTorpor(level: number) { return level; }\n",
  "orbit/orbitCamera.ts": "/** Orbit around a target. */\nexport function orbitCamera() {}\n",
};

function sources(): HasSources {
  const files: CodeFile[] = Object.keys(FILES).map((rel) => ({ layer: "core", path: `packages/core/src/${rel}`, rel }));
  return { capabilities: CAPABILITIES, code: indexCode(files, (file) => FILES[file.rel]!) };
}

test("answers every feature in one call: covered, partial and gap", () => {
  const answers = answerHas(["torpor", "weather wind", "weather lightning", "orbit", "breeding"], sources());
  expect(answers.map((answer) => [answer.feature, answer.verdict])).toEqual([
    ["torpor", "covered"],
    ["weather wind", "covered"],
    ["weather lightning", "partial"],
    ["orbit", "partial"],
    ["breeding", "gap"],
  ]);
  expect(answers[0]!.capabilities[0]).toEqual({
    skill: "jgengine-gameplay",
    slug: "knockout-taming",
    description: "knock a creature out with torpor and tame it by feeding",
    import: 'import { createKnockoutTaming } from "@jgengine/core/taming/knockoutTaming"',
  });
  expect(answers[0]!.folders).toEqual(["packages/core/src/taming/"]);
  expect(answers[3]!.folders).toEqual(["packages/core/src/orbit/"]);
  expect(answers[4]).toEqual({ feature: "breeding", verdict: "gap", folders: [], capabilities: [] });
});

const WORDED: CapabilityEntry[] = [
  {
    skill: "jgengine-gameplay",
    slug: "event-table",
    description: "timed supply crates that fall from the sky",
    imports: ['import { createEventTable } from "@jgengine/core/airdrops/eventTable"'],
    symbols: ["createEventTable"],
  },
  {
    skill: "jgengine-gameplay",
    slug: "decay-meter",
    description: "a survival meter that drains over time, like hunger",
    imports: ['import { createDecayMeter } from "@jgengine/core/survival/decayMeter"'],
    symbols: ["createDecayMeter"],
  },
  {
    skill: "jgengine-world",
    slug: "boat-hull",
    description: "a floating hull pushed by thrust",
    imports: ['import { createBoatHull } from "@jgengine/core/boats/boatHull"'],
    symbols: ["createBoatHull"],
  },
];

const WORDED_FILES: Record<string, string> = {
  "airdrops/eventTable.ts": "/** Roll a timed event. */\nexport function createEventTable() {}\n",
  "survival/decayMeter.ts":
    "export interface DecayMeterOptions {\n  /** Per-second drain, e.g. hunger/thirst. */\n  rate: number;\n}\n/** A draining meter. */\nexport function createDecayMeter() {}\n",
  "boats/boatHull.ts": "/** Spray kicks up at the bow. */\nexport function createBoatHull() {}\n",
};

function wordedSources(): HasSources {
  const files: CodeFile[] = Object.keys(WORDED_FILES).map((rel) => ({ layer: "core", path: `packages/core/src/${rel}`, rel }));
  return { capabilities: WORDED, code: indexCode(files, (file) => WORDED_FILES[file.rel]!) };
}

test("a feature worded differently from the capability is covered through its code's names and docs", () => {
  const answers = answerHas(["supply drops", "hunger thirst", "bows", "thirst"], wordedSources());
  expect(answers.map((answer) => [answer.feature, answer.verdict, answer.capabilities[0]?.slug ?? null])).toEqual([
    // The row says supply; "drops" is only in the folder name `airdrops/`.
    ["supply drops", "covered", "event-table"],
    // The capability says hunger; one field doc in its file says "hunger/thirst".
    ["hunger thirst", "covered", "decay-meter"],
    // A doc comment alone never covers a feature: "bow" of a boat is not archery.
    ["bows", "gap", null],
    ["thirst", "gap", null],
  ]);
});

test("a word that only sits in a description or inside another word is not an answer", () => {
  const rows: CapabilityEntry[] = [
    { skill: "jgengine-ui", slug: "action-tooltip", description: "structured action tooltip body", imports: [], symbols: ["ActionTooltip"] },
    { skill: "jgengine", slug: "hotbar-slot-bindings", description: "key codes for numbered actions (hotbar, build menu, tools)", imports: [], symbols: ["hotbarSlotBindings"] },
  ];
  const [answer] = answerHas(["metal tools"], { capabilities: rows, code: [] });
  expect(answer).toEqual({ feature: "metal tools", verdict: "gap", folders: [], capabilities: [] });
});

test("a supply drop is named by the parts it is made of", () => {
  const parts = parsePartRows([
    '/** Schedule: something happens at a pace from a start time: waves, supply drops, weather. */',
    'export * from "./time/pacedSchedule";',
    '/** Table: a weighted choice: supply drop loot per rarity. */',
    'export * from "./random/pick";',
    '/** Motion track: a thing follows a path over time: a supply drop falling, a door. */',
    'export * from "./movement/motionTrack";',
    '/** Slots: named spots that refill: supply drop crates, resource nodes. */',
    'export * from "./time/refillSlots";',
    '/** Meter: a number with a range: health, hunger. */',
    'export * from "./stats/statPool";',
  ].join("\n"));
  const [answer] = answerHas(["supply drop"], { capabilities: [], code: [], parts });
  expect(answer?.verdict).toBe("covered");
  expect(answer?.capabilities.map((row) => row.slug).sort()).toEqual(["movement/motionTrack", "random/pick", "time/pacedSchedule", "time/refillSlots"]);
});
