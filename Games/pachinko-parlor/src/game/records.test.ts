import { describe, expect, test } from "bun:test";
import type { RecordStorage } from "@jgengine/core/game/recordBook";
import { createRecords } from "./records";

function memoryStorage(): RecordStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe("records", () => {
  test("tracks the higher bank and fever bests", () => {
    const book = createRecords(null);
    expect(book.bestOf("bank")).toBeNull();
    const first = book.submit({ bank: 120, fever: 2 });
    expect(first.improved.sort()).toEqual(["bank", "fever"]);
    expect(book.bestOf("bank")).toBe(120);
    expect(book.bestOf("fever")).toBe(2);
  });

  test("only records improvements", () => {
    const book = createRecords(null);
    book.submit({ bank: 120, fever: 3 });
    const worse = book.submit({ bank: 80, fever: 1 });
    expect(worse.improved).toHaveLength(0);
    expect(book.bestOf("bank")).toBe(120);
    const better = book.submit({ bank: 200 });
    expect(better.improved).toEqual(["bank"]);
    expect(book.bestOf("bank")).toBe(200);
    expect(book.bestOf("fever")).toBe(3);
  });

  test("persists across instances through storage", () => {
    const storage = memoryStorage();
    createRecords(storage).submit({ bank: 340, fever: 5 });
    const reopened = createRecords(storage);
    expect(reopened.bestOf("bank")).toBe(340);
    expect(reopened.bestOf("fever")).toBe(5);
  });
});
