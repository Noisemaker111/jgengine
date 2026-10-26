import { expect, test } from "bun:test";

import type { CapabilityEntry } from "../find/capabilities";
import type { HasSources } from "../find/has";
import { newPlan, parseFeatures, refreshPlan, tallyMilestones } from "./plan";

const SOURCES: HasSources = {
  capabilities: [
    {
      skill: "jgengine-gameplay",
      slug: "knockout-taming",
      description: "knock a creature out with torpor and tame it by feeding",
      imports: ['import { createKnockoutTaming } from "@jgengine/core/taming/knockoutTaming"'],
      symbols: ["createKnockoutTaming"],
    },
  ] satisfies CapabilityEntry[],
  code: [],
};

const PLAN = `# fernwild plan

Brief: ARK: Survival Evolved 1:1

## Features

- torpor taming — knock out with a club, feed to tame
- breeding: mate two tames, incubate the egg
- [x] \`torpor\`

## Milestones

- [x] 1. Taming
- [ ] 2. Breeding engine seam
- [ ] 3. Imprinting
`;

test("features are looked up by their words before the dash or colon", () => {
  expect(parseFeatures(PLAN)).toEqual([
    { label: "torpor taming — knock out with a club, feed to tame", query: "torpor taming" },
    { label: "breeding: mate two tames, incubate the egg", query: "breeding" },
    { label: "`torpor`", query: "torpor" },
  ]);
});

test("refresh writes coverage and gaps, keeps the hand-written sections, and is stable", () => {
  const { text, answers } = refreshPlan(PLAN, SOURCES);
  expect(answers.map((answer) => answer.verdict)).toEqual(["covered", "gap", "covered"]);
  expect(text).toContain("| torpor taming — knock out with a club, feed to tame | `knockout-taming` · `import { createKnockoutTaming } from \"@jgengine/core/taming/knockoutTaming\"` | covered |");
  expect(text).toContain("- breeding: mate two tames, incubate the egg: nothing ships; build it in `packages/core/src/<feature>/`");
  // Generated sections land before the milestones, and the milestones survive untouched.
  expect(text.indexOf("## Engine coverage")).toBeLessThan(text.indexOf("## Milestones"));
  expect(text).toContain("- [ ] 2. Breeding engine seam\n");
  expect(refreshPlan(text, SOURCES).text).toBe(text);
});

test("a new feature on a refreshed plan replaces the old coverage rather than adding a second table", () => {
  const first = refreshPlan(PLAN, SOURCES).text;
  const second = refreshPlan(first.replace("## Features\n\n", "## Features\n\n- weather\n"), SOURCES).text;
  expect(second.match(/## Engine coverage/g)?.length).toBe(1);
  expect(second).toContain("| weather | — | gap |");
});

test("milestones tally done, open and the next one", () => {
  expect(tallyMilestones(PLAN)).toEqual({ done: 1, open: 2, next: "2. Breeding engine seam" });
});

test("a new plan has the brief and every section the command fills", () => {
  const text = newPlan("fernwild", "ARK 1:1");
  for (const heading of ["Brief: ARK 1:1", "## Features", "## Engine coverage", "## Gaps", "## Milestones"]) expect(text).toContain(heading);
  expect(parseFeatures(text)).toEqual([]);
});
