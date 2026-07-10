import { describe, expect, test } from "bun:test";

import { createRecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";

function memStorage(): RecordStorage & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe("best-score record book", () => {
  test("keeps the highest score and ignores lower ones", () => {
    const book = createRecordBook<"best">({ key: "slide-2048/best", fields: { best: "higher" }, storage: memStorage() });
    expect(book.submit({ best: 1200 }).improved).toContain("best");
    expect(book.bestOf("best")).toBe(1200);
    expect(book.submit({ best: 800 }).improved).toHaveLength(0);
    expect(book.bestOf("best")).toBe(1200);
    expect(book.submit({ best: 3400 }).improved).toContain("best");
    expect(book.bestOf("best")).toBe(3400);
  });

  test("persists across reloads through the same storage", () => {
    const storage = memStorage();
    createRecordBook<"best">({ key: "slide-2048/best", fields: { best: "higher" }, storage }).submit({ best: 5000 });
    const reloaded = createRecordBook<"best">({ key: "slide-2048/best", fields: { best: "higher" }, storage });
    expect(reloaded.bestOf("best")).toBe(5000);
  });

  test("degrades to an empty book when storage is unavailable", () => {
    const book = createRecordBook<"best">({ key: "slide-2048/best", fields: { best: "higher" }, storage: null });
    expect(book.bestOf("best")).toBeNull();
    book.submit({ best: 42 });
    expect(book.bestOf("best")).toBe(42);
  });
});
