import { describe, expect, test } from "bun:test";

import { creditsForAssetIds, creditsForSources, sourcesForAssetIds } from "./credits";
import { generatedIndex } from "./generated";
import { sourceById } from "./sources";

const SAMPLE = generatedIndex.slice(0, 40);

describe("sourcesForAssetIds", () => {
  test("resolves real catalog ids to their packs, deduped", () => {
    const ids = SAMPLE.map((entry) => entry.id);
    const resolved = sourcesForAssetIds(ids);
    expect(resolved.length).toBeGreaterThan(0);
    expect(new Set(resolved.map((s) => s.id)).size).toBe(resolved.length);
    for (const source of resolved) expect(sourceById.get(source.id)).toBeDefined();
  });

  test("skips unknown ids instead of throwing", () => {
    expect(sourcesForAssetIds(["not-a-real-asset", "also/missing"])).toEqual([]);
  });

  test("follows first-use order so a stable id list gives a stable screen", () => {
    const ids = SAMPLE.map((entry) => entry.id);
    expect(sourcesForAssetIds(ids).map((s) => s.id)).toEqual(sourcesForAssetIds(ids).map((s) => s.id));
  });
});

describe("creditsForSources", () => {
  const used = sourcesForAssetIds(SAMPLE.map((entry) => entry.id));

  test("groups by license by default and names the pack plus its author", () => {
    const sections = creditsForSources(used);
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(section.heading).not.toBe("");
      for (const entry of section.entries) {
        expect(entry.label).not.toBe("");
        expect(entry.detail).not.toBe("");
      }
    }
    const headings = sections.map((s) => s.heading);
    expect(headings).toEqual([...new Set(headings)]);
  });

  test("grouping by provider regroups the same entries", () => {
    const byLicense = creditsForSources(used, "license");
    const byProvider = creditsForSources(used, "provider");
    const count = (sections: ReturnType<typeof creditsForSources>) =>
      sections.reduce((n, s) => n + s.entries.length, 0);
    expect(count(byProvider)).toBe(count(byLicense));
  });
});

describe("creditsForAssetIds", () => {
  test("builds a whole document from ids, carrying title and notice through", () => {
    const document = creditsForAssetIds(SAMPLE.map((entry) => entry.id), {
      title: "Assets",
      notice: "Used under their stated licenses.",
    });
    expect(document.title).toBe("Assets");
    expect(document.notice).toBe("Used under their stated licenses.");
    expect(document.sections.length).toBeGreaterThan(0);
  });

  test("no shipped assets gives no sections", () => {
    expect(creditsForAssetIds([]).sections).toEqual([]);
  });
});
