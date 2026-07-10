import { describe, expect, test } from "bun:test";
import { createRecordBook, type RecordStorage } from "./recordBook";

function memoryStorage(initial: Record<string, string> = {}): RecordStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

const FIELDS = { time: "lower", streak: "higher" } as const;

describe("createRecordBook", () => {
  test("an empty book has no records", () => {
    const book = createRecordBook({ key: "t", fields: FIELDS });
    expect(book.best()).toEqual({});
    expect(book.bestOf("time")).toBeNull();
  });

  test("first submission sets every provided field", () => {
    const book = createRecordBook({ key: "t", fields: FIELDS });
    const result = book.submit({ time: 90, streak: 4 });
    expect(result.improved).toEqual(["time", "streak"]);
    expect(book.bestOf("time")).toBe(90);
    expect(book.bestOf("streak")).toBe(4);
  });

  test("lower fields only improve downward, higher fields only upward", () => {
    const book = createRecordBook({ key: "t", fields: FIELDS });
    book.submit({ time: 90, streak: 4 });
    const worse = book.submit({ time: 120, streak: 2 });
    expect(worse.improved).toEqual([]);
    const better = book.submit({ time: 80, streak: 9 });
    expect(better.improved).toEqual(["time", "streak"]);
    expect(book.best()).toEqual({ time: 80, streak: 9 });
  });

  test("partial submissions leave the other fields untouched", () => {
    const book = createRecordBook({ key: "t", fields: FIELDS });
    book.submit({ time: 90 });
    const result = book.submit({ streak: 3 });
    expect(result.improved).toEqual(["streak"]);
    expect(book.best()).toEqual({ time: 90, streak: 3 });
  });

  test("non-finite values are ignored", () => {
    const book = createRecordBook({ key: "t", fields: FIELDS });
    const result = book.submit({ time: Number.NaN, streak: Number.POSITIVE_INFINITY });
    expect(result.improved).toEqual([]);
    expect(book.best()).toEqual({});
  });

  test("records persist through storage and reload in a fresh book", () => {
    const storage = memoryStorage();
    const first = createRecordBook({ key: "pb", fields: FIELDS, storage });
    first.submit({ time: 75, streak: 6 });
    const second = createRecordBook({ key: "pb", fields: FIELDS, storage });
    expect(second.bestOf("time")).toBe(75);
    expect(second.bestOf("streak")).toBe(6);
  });

  test("corrupt stored JSON degrades to an empty book", () => {
    const storage = memoryStorage({ pb: "{not json" });
    const book = createRecordBook({ key: "pb", fields: FIELDS, storage });
    expect(book.best()).toEqual({});
  });

  test("stored non-numeric fields are dropped on load", () => {
    const storage = memoryStorage({ pb: JSON.stringify({ time: "fast", streak: 5, stray: 1 }) });
    const book = createRecordBook({ key: "pb", fields: FIELDS, storage });
    expect(book.best()).toEqual({ streak: 5 });
  });

  test("a throwing storage never propagates into submit or clear", () => {
    const broken: RecordStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    const book = createRecordBook({ key: "pb", fields: FIELDS, storage: broken });
    expect(book.submit({ time: 60 }).improved).toEqual(["time"]);
    expect(book.bestOf("time")).toBe(60);
    book.clear();
    expect(book.best()).toEqual({});
  });

  test("clear removes the stored payload", () => {
    const storage = memoryStorage();
    const book = createRecordBook({ key: "pb", fields: FIELDS, storage });
    book.submit({ time: 75 });
    book.clear();
    expect(storage.data["pb"]).toBeUndefined();
    expect(book.best()).toEqual({});
  });
});
