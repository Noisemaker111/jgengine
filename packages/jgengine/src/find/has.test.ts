import { expect, test } from "bun:test";

import type { CapabilityEntry } from "./capabilities";
import { indexCode, type CodeFile } from "./codeMap";
import { answerHas, type HasSources } from "./has";

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
