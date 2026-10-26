import { describe, expect, test } from "bun:test";

import { groupCredits, mergeCredits } from "./credits";

describe("mergeCredits", () => {
  test("concatenates same-heading sections in first-seen order", () => {
    const merged = mergeCredits(
      { sections: [{ heading: "Art", entries: [{ label: "A" }] }] },
      { sections: [{ heading: "Music", entries: [{ label: "M" }] }, { heading: "Art", entries: [{ label: "B" }] }] },
    );
    expect(merged.sections.map((s) => s.heading)).toEqual(["Art", "Music"]);
    expect(merged.sections[0]!.entries.map((e) => e.label)).toEqual(["A", "B"]);
  });

  test("drops exact duplicate entries but keeps ones differing in detail or href", () => {
    const merged = mergeCredits(
      { sections: [{ heading: "Art", entries: [{ label: "A", detail: "modeling" }] }] },
      {
        sections: [
          {
            heading: "Art",
            entries: [
              { label: "A", detail: "modeling" },
              { label: "A", detail: "textures" },
              { label: "A", detail: "modeling", href: "https://example.com" },
            ],
          },
        ],
      },
    );
    expect(merged.sections[0]!.entries).toHaveLength(3);
  });

  test("skips null and undefined documents and joins distinct notices", () => {
    const merged = mergeCredits(
      { sections: [], notice: "CC0" },
      null,
      undefined,
      { sections: [], notice: "CC0" },
      { sections: [], notice: "Thanks" },
    );
    expect(merged.notice).toBe("CC0\nThanks");
    expect(merged.sections).toEqual([]);
  });

  test("takes the first title it sees", () => {
    expect(mergeCredits({ sections: [] }, { title: "Credits", sections: [] }).title).toBe("Credits");
  });
});

describe("groupCredits", () => {
  test("groups by key with sections in first-appearance order", () => {
    const sections = groupCredits(
      [
        { name: "pack-a", license: "CC0" },
        { name: "pack-b", license: "CC-BY" },
        { name: "pack-c", license: "CC0" },
      ],
      (item) => item.license,
      (item) => ({ label: item.name }),
    );
    expect(sections.map((s) => s.heading)).toEqual(["CC0", "CC-BY"]);
    expect(sections[0]!.entries.map((e) => e.label)).toEqual(["pack-a", "pack-c"]);
  });

  test("an empty list gives no sections", () => {
    expect(groupCredits([], () => "x", () => ({ label: "y" }))).toEqual([]);
  });
});
