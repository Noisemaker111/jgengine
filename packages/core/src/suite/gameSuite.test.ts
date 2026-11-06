import { describe, expect, test } from "bun:test";

import { readGameSuiteConfig, renderSuiteMarkdown, renderSuiteText, requiredSuiteEntries, scoreGameSuite, suiteRegressions, suiteScoreLine, type SuiteReport } from "./gameSuite";
import { SUITE_ENTRIES, SUITE_GENRES, SUITE_UNIVERSAL } from "./suiteCatalog";

describe("the suite catalog", () => {
  test("ids are unique, area.verb shaped, and tagged with known genres", () => {
    const ids = SUITE_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    const genres = new Set([SUITE_UNIVERSAL, ...SUITE_GENRES.map((genre) => genre.id)]);
    for (const entry of SUITE_ENTRIES) {
      expect(entry.id).toMatch(/^[a-z-]+\.[a-z.-]+$/);
      expect(entry.genres.length).toBeGreaterThan(0);
      for (const genre of entry.genres) expect(genres.has(genre)).toBe(true);
    }
  });

  test("every core feature's depth feeds two real, different entries", () => {
    const ids = new Set(SUITE_ENTRIES.map((entry) => entry.id));
    const core = SUITE_ENTRIES.filter((entry) => entry.depth !== undefined);
    expect(core.length).toBeGreaterThan(15);
    for (const entry of core) {
      const [first, second] = entry.depth?.feeds ?? ["", ""];
      expect(ids.has(first)).toBe(true);
      expect(ids.has(second)).toBe(true);
      expect(first).not.toBe(second);
      expect(first).not.toBe(entry.id);
    }
  });

  test("every genre has a core feature, and includes name real genres", () => {
    const known = new Set(SUITE_GENRES.map((genre) => genre.id));
    for (const genre of SUITE_GENRES) {
      for (const included of genre.includes ?? []) expect(known.has(included)).toBe(true);
      expect(SUITE_ENTRIES.some((entry) => entry.genres.includes(genre.id) && entry.depth !== undefined)).toBe(true);
    }
  });
});

describe("scoreGameSuite", () => {
  const config = { genres: ["creature-survival"], cut: { "survival.oxygen-swim": "no water deep enough to dive" }, notSimulatable: { "settings.controls": "src/ui/Settings.tsx: bindings live in React state" } };

  test("a genre pulls in its includes and the universal set", () => {
    const ids = requiredSuiteEntries(["creature-survival"]).map((entry) => entry.id);
    expect(ids).toContain("taming.knockout-melee");
    expect(ids).toContain("survival.vitals-drain");
    expect(ids).toContain("save.continue");
    expect(ids).not.toContain("td.place-tower");
  });

  test("statuses come from proofs, data results, cuts and declared findings", () => {
    const report: SuiteReport = {
      game: "g",
      proofs: [
        { file: "proofs/sim/tame.proof.ts", proves: ["taming.knockout-melee"], ok: true },
        { file: "proofs/sim/ride.proof.ts", proves: ["creatures.ride.ground"], ok: false, failure: "step 3 (act mount): refused" },
      ],
      data: [
        { id: "content.item-source", ok: true, problems: [] },
        { id: "content.placeables-place", ok: false, problems: ["storage_box"] },
      ],
    };
    const score = scoreGameSuite("g", config, report);
    const status = (id: string) => score.rows.find((row) => row.entry.id === id);
    expect(status("taming.knockout-melee")?.status).toBe("proven");
    expect(status("creatures.ride.ground")).toMatchObject({ status: "failing", detail: "proofs/sim/ride.proof.ts: step 3 (act mount): refused" });
    expect(status("content.item-source")?.status).toBe("proven");
    expect(status("content.placeables-place")?.status).toBe("failing");
    expect(status("survival.oxygen-swim")).toMatchObject({ status: "cut", detail: "no water deep enough to dive" });
    expect(status("settings.controls")?.status).toBe("not-simulatable");
    expect(status("progression.runway")?.status).toBe("missing");
    expect(score.proven).toBe(2);
    expect(score.required).toBe(score.rows.length - 1);
    expect(score.problems).toEqual([]);
    expect(suiteScoreLine(score)).toStartWith(`2/${score.required} proven · 2 failing · 1 not simulatable · 1 cut`);
    expect(renderSuiteText(score).join("\n")).toContain("FAILING         creatures.ride.ground");
    expect(renderSuiteMarkdown(score)[0]).toContain("Genres: creature-survival.");
  });

  test("unknown genres and entry ids are problems, not silent", () => {
    const score = scoreGameSuite("g", { genres: ["space-opera"], cut: { "taming.typo": "x" }, notSimulatable: {} }, { game: "g", proofs: [{ file: "a", proves: ["nope.never"], ok: true }], data: [] });
    expect(score.problems).toHaveLength(3);
  });

  test("a proven entry that stops being proven is a regression", () => {
    const before = scoreGameSuite("g", config, { game: "g", proofs: [{ file: "a", proves: ["taming.knockout-melee"], ok: true }], data: [] });
    const after = scoreGameSuite("g", config, { game: "g", proofs: [{ file: "a", proves: ["taming.knockout-melee"], ok: false, failure: "x" }], data: [] });
    expect(suiteRegressions(before, after)).toEqual(["taming.knockout-melee"]);
    expect(suiteRegressions(after, before)).toEqual([]);
  });
});

describe("readGameSuiteConfig", () => {
  test("reads the suite section and insists on reasons", () => {
    expect(readGameSuiteConfig({ name: "x" })).toBeNull();
    expect(readGameSuiteConfig({ suite: { genres: ["racing"] } })).toEqual({ genres: ["racing"], cut: {}, notSimulatable: {} });
    expect(() => readGameSuiteConfig({ suite: { genres: ["racing"], cut: { "racing.opponents": "" } } })).toThrow("needs a reason");
    expect(() => readGameSuiteConfig({ suite: { genres: "racing" } })).toThrow("genre ids");
  });
});
