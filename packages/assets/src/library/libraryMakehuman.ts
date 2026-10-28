import type { MakeHumanEthnicity, MakeHumanPreset } from "../makehumanPull";
import type { LibraryRecord } from "./assetLibrary";

const only = (race: keyof MakeHumanEthnicity): MakeHumanEthnicity => ({ african: 0, asian: 0, caucasian: 0, [race]: 1 });
const MIXED: MakeHumanEthnicity = { african: 1, asian: 1, caucasian: 1 };

/**
 * The pinned MakeHuman people the library lists: both genders across MakeHuman's three ethnic
 * targets, ages from young adult to old, and muscle and weight extremes. Each is built on pull
 * from the CC0 base mesh and targets, so the set is data, not files.
 */
export const MAKEHUMAN_PRESETS: readonly MakeHumanPreset[] = [
  { id: "female-young-caucasian", title: "Young Woman (Caucasian)", gender: "female", age: 0, ethnicity: only("caucasian"), tags: [] },
  { id: "male-young-caucasian", title: "Young Man (Caucasian)", gender: "male", age: 0, ethnicity: only("caucasian"), tags: [] },
  { id: "female-young-african", title: "Young Woman (African)", gender: "female", age: 0, ethnicity: only("african"), tags: [] },
  { id: "male-young-african", title: "Young Man (African)", gender: "male", age: 0, ethnicity: only("african"), tags: [] },
  { id: "female-young-asian", title: "Young Woman (Asian)", gender: "female", age: 0, ethnicity: only("asian"), tags: [] },
  { id: "male-young-asian", title: "Young Man (Asian)", gender: "male", age: 0, ethnicity: only("asian"), tags: [] },
  { id: "female-middle-mixed", title: "Middle-aged Woman (mixed)", gender: "female", age: 0.4, ethnicity: MIXED, tags: ["middle-aged"] },
  { id: "male-middle-mixed", title: "Middle-aged Man (mixed)", gender: "male", age: 0.4, ethnicity: MIXED, tags: ["middle-aged"] },
  { id: "female-old-asian", title: "Old Woman (Asian)", gender: "female", age: 0.85, ethnicity: only("asian"), tags: ["elderly"] },
  { id: "male-old-caucasian", title: "Old Man (Caucasian)", gender: "male", age: 0.85, ethnicity: only("caucasian"), tags: ["elderly"] },
  { id: "male-young-muscular-african", title: "Muscular Young Man (African)", gender: "male", age: 0, ethnicity: only("african"), muscle: "max", tags: ["muscular", "athletic"] },
  { id: "female-young-heavy-caucasian", title: "Heavy Young Woman (Caucasian)", gender: "female", age: 0, ethnicity: only("caucasian"), weight: "max", tags: ["heavy"] },
];

/** The preset a library id names, or undefined. @internal */
export function makehumanPreset(id: string): MakeHumanPreset | undefined {
  return MAKEHUMAN_PRESETS.find((preset) => preset.id === id);
}

/**
 * Library records for every pinned MakeHuman person: rigged characters on MakeHuman's default
 * skeleton with idle, walk and run baked on.
 *
 * @internal
 */
export function makehumanRecords(): LibraryRecord[] {
  return MAKEHUMAN_PRESETS.map((preset) => {
    const ethnic = Object.entries(preset.ethnicity)
      .filter(([, share]) => share > 0)
      .map(([race]) => race);
    const age = preset.age >= 0.7 ? "old" : preset.age >= 0.3 ? "adult" : "young";
    return {
      id: preset.id,
      title: preset.title,
      kind: "character",
      tags: [...new Set(["human", "makehuman", "rigged", "animated", preset.gender, preset.gender === "female" ? "woman" : "man", age, ...ethnic, ...preset.tags, "idle", "walk", "run"])],
      rigged: true,
    };
  });
}
