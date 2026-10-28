import { describe, expect, test } from "bun:test";

import {
  expandLibraryRecord,
  libraryCreditSections,
  libraryTagCounts,
  readLibraryRecordFile,
  searchLibrary,
  validateLibrary,
  type LibraryEntry,
} from "./assetLibrary";
import { assetLibrary } from "./libraryIndex";
import { EXCLUDED_PROVIDERS, isLibraryLicense, LIBRARY_LICENSES, licenseRequiresCredit, normalizeLibraryLicense } from "./libraryLicense";
import { LIBRARY_KINDS, ASSET_LIBRARY_SOURCES } from "./librarySources";
import { libraryServedPath } from "./libraryServed";
import { sketchfabRecord } from "./libraryIngest";
import { libraryIconCredits, libraryIconEntry, libraryIconUrl } from "./libraryIcons";

const library = assetLibrary();

describe("the committed asset library", () => {
  test("holds thousands of entries across every source and kind", () => {
    expect(library.length).toBeGreaterThan(10_000);
    for (const source of ASSET_LIBRARY_SOURCES) expect(library.some((entry) => entry.source === source.id)).toBe(true);
    for (const kind of LIBRARY_KINDS) expect(library.some((entry) => entry.kind === kind)).toBe(true);
  });

  test("every entry has an allowed licence and full credit fields", () => {
    expect(validateLibrary(library)).toEqual([]);
    for (const entry of library) {
      expect(LIBRARY_LICENSES).toContain(entry.license);
      expect(entry.author.length).toBeGreaterThan(0);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.page).toMatch(/^https:\/\//);
    }
  });

  test("every source is re-hostable and every pack entry names its file", () => {
    for (const source of ASSET_LIBRARY_SOURCES) expect(source.rehost).toBe(true);
    for (const entry of library.filter((candidate) => candidate.pack !== undefined)) expect(entry.file?.length ?? 0).toBeGreaterThan(0);
  });

  test("every entry has a served path a game can load", () => {
    for (const entry of library) {
      const served = libraryServedPath(entry);
      expect(served.url.startsWith(`/${served.dir}`)).toBe(true);
    }
  });

  test("no Kenney, Mixamo or other excluded provider appears", () => {
    for (const entry of library) expect(EXCLUDED_PROVIDERS.test(`${entry.author} ${entry.title} ${entry.tags.join(" ")}`)).toBe(false);
    expect(EXCLUDED_PROVIDERS.test("sketchfab.com")).toBe(false);
    expect(EXCLUDED_PROVIDERS.test("Kenney")).toBe(true);
  });

  test("game-icons.net icons are credited per artist", () => {
    const icon = library.find((entry) => entry.key === "gameicons:lorc/broadsword");
    expect(icon).toMatchObject({ kind: "icon", license: "CC-BY-3.0", author: "Lorc", pack: "gameicons-icons", file: "lorc/broadsword.svg" });
    expect(library.filter((entry) => entry.source === "gameicons" && entry.author === "game-icons.net contributors")).toEqual([]);
  });
});

describe("normalizeLibraryLicense", () => {
  test("accepts CC0, public domain, MIT and CC BY spellings", () => {
    expect(normalizeLibraryLicense("CC0 Public Domain")).toBe("CC0-1.0");
    expect(normalizeLibraryLicense("CC Attribution")).toBe("CC-BY-4.0");
    expect(normalizeLibraryLicense("CC BY 3.0")).toBe("CC-BY-3.0");
    expect(normalizeLibraryLicense("MIT License")).toBe("MIT");
    expect(normalizeLibraryLicense("Public Domain")).toBe("public-domain");
  });

  test("refuses non-commercial, share-alike, no-derivatives, editorial and custom licences", () => {
    for (const label of [
      "CC Attribution-NonCommercial",
      "CC Attribution-ShareAlike",
      "CC Attribution-NoDerivs",
      "CC BY-NC 4.0",
      "Editorial",
      "Standard",
      "Quaternius License",
      "Royalty Free",
      "",
    ]) {
      expect(normalizeLibraryLicense(label)).toBeNull();
    }
    expect(isLibraryLicense("CC-BY-SA-4.0")).toBe(false);
  });

  test("only CC BY and MIT oblige a credit", () => {
    expect(licenseRequiresCredit("CC0-1.0")).toBe(false);
    expect(licenseRequiresCredit("CC-BY-3.0")).toBe(true);
    expect(licenseRequiresCredit("MIT")).toBe(true);
  });
});

describe("validateLibrary", () => {
  const good = expandLibraryRecord("polyhaven", { id: "chair_01", title: "Chair 01", kind: "model", tags: ["chair"] });

  test("flags a disallowed licence, a missing author and duplicate keys", () => {
    // An ingest file read from disk is untyped JSON; validation is what stops a bad licence there.
    const bad: LibraryEntry = JSON.parse(JSON.stringify({ ...good, key: "polyhaven:bad", license: "CC-BY-NC-4.0", author: " " }));
    const problems = validateLibrary([good, good, bad]).map((issue) => issue.problem);
    expect(problems).toContain("duplicate key");
    expect(problems.some((problem) => problem.includes("CC-BY-NC-4.0"))).toBe(true);
    expect(problems).toContain("no author");
  });

  test("source defaults fill licence, author, page and thumbnail", () => {
    expect(good).toMatchObject({
      key: "polyhaven:chair_01",
      license: "CC0-1.0",
      page: "https://polyhaven.com/a/chair_01",
      thumbnail: "https://cdn.polyhaven.com/asset_img/thumbs/chair_01.png?width=128&height=128",
    });
  });
});

describe("readLibraryRecordFile", () => {
  test("refuses a record whose licence is outside the list, and an unknown source", () => {
    const record = { id: "x", title: "X", kind: "model", tags: [] };
    expect(readLibraryRecordFile({ source: "sketchfab", records: [record] }).records).toEqual([record]);
    expect(() => readLibraryRecordFile({ source: "sketchfab", records: [{ ...record, license: "CC-BY-NC-4.0" }] })).toThrow(/refuses/);
    expect(() => readLibraryRecordFile({ source: "kenney", records: [] })).toThrow(/unknown source/);
    expect(() => readLibraryRecordFile({ source: "sketchfab", records: [{ id: "x", kind: "spaceship", title: "X", tags: [] }] })).toThrow(/malformed/);
  });
});

describe("searchLibrary", () => {
  test("ranks a whole title word first and filters by kind and tag", () => {
    const hits = searchLibrary(library, "sword", { kind: "icon", limit: 5 });
    expect(hits.length).toBe(5);
    expect(hits.every((hit) => hit.entry.kind === "icon")).toBe(true);
    expect(hits[0]?.entry.title.toLowerCase()).toContain("sword");
    const tagged = searchLibrary(library, "", { tags: ["halloween"], limit: 0 });
    expect(tagged.length).toBeGreaterThan(10);
    expect(tagged.every((hit) => hit.entry.tags.includes("halloween"))).toBe(true);
  });

  test("every word must match, and noCredit keeps only CC0 and public domain", () => {
    expect(searchLibrary(library, "sword zzqx")).toEqual([]);
    const free = searchLibrary(library, "chair", { noCredit: true, limit: 0 });
    expect(free.length).toBeGreaterThan(0);
    expect(free.every((hit) => !licenseRequiresCredit(hit.entry.license))).toBe(true);
  });

  test("tag counts list the commonest tags first", () => {
    const [first, second] = libraryTagCounts(library, 2);
    expect((first?.count ?? 0) >= (second?.count ?? 0)).toBe(true);
  });
});

describe("libraryCreditSections", () => {
  test("credits game-icons per artist and CC0 sources once per author", () => {
    const used = ["gameicons:lorc/broadsword", "gameicons:lorc/wheat", "gameicons:delapouite/carrot", "polyhaven:ArmChair_01"].map((key) => {
      const entry = library.find((candidate) => candidate.key === key);
      if (entry === undefined) throw new Error(`missing ${key}`);
      return entry;
    });
    const sections = libraryCreditSections(used);
    const icons = sections.find((section) => section.heading === "game-icons.net");
    expect(icons?.entries.map((entry) => entry.label)).toEqual(["Icons made by Delapouite", "Icons made by Lorc"]);
    expect(icons?.entries.find((entry) => entry.label === "Icons made by Lorc")?.detail).toBe("Broadsword, Wheat · CC BY 3.0");
    expect(sections.find((section) => section.heading === "Poly Haven")?.entries[0]?.href).toBe("https://polyhaven.com/a/ArmChair_01");
  });
});

describe("ingest parsers", () => {
  test("sketchfabRecord drops non-allowed licences and age-restricted results", () => {
    const base = {
      uid: "abc",
      name: "Raptor",
      license: { label: "CC Attribution" },
      user: { displayName: "Someone" },
      categories: [{ name: "animals-pets" }],
      tags: [{ slug: "dinosaur" }],
      thumbnails: { images: [{ width: 64, url: "https://a/64.jpg" }, { width: 256, url: "https://a/256.jpg" }] },
      faceCount: 1200,
      animationCount: 2,
    };
    expect(sketchfabRecord(base)).toEqual({
      id: "abc",
      title: "Raptor",
      kind: "character",
      tags: ["animals-pets", "dinosaur"],
      author: "Someone",
      license: "CC-BY-4.0",
      thumbnail: "https://a/256.jpg",
      triangles: 1200,
      rigged: true,
    });
    expect(sketchfabRecord({ ...base, license: { label: "CC Attribution-NonCommercial" } })).toBeNull();
    expect(sketchfabRecord({ ...base, isAgeRestricted: true })).toBeNull();
  });

  test("game-icons keys resolve and credit without the index", () => {
    expect(libraryIconUrl("gameicons:lorc/broadsword")).toBe("/sprites/gameicons-icons/lorc/broadsword.svg");
    expect(libraryIconEntry("gameicons:zeromancer/heart-organ").license).toBe("CC0-1.0");
    expect(() => libraryIconEntry("gameicons:nobody/thing")).toThrow();
    for (const entry of library.filter((candidate) => candidate.source === "gameicons").slice(0, 400)) {
      expect(libraryIconEntry(entry.key)).toMatchObject({ author: entry.author, license: entry.license, file: entry.file });
    }
    expect(libraryIconCredits(["gameicons:lorc/wheat", "gameicons:lorc/wheat"])[0]?.entries).toEqual([
      { label: "Icons made by Lorc", detail: "Wheat · CC BY 3.0", href: "https://game-icons.net/1x1/lorc/wheat.html" },
    ]);
  });
});
