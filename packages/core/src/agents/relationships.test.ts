import { describe, expect, test } from "bun:test";

import { createRelationshipBook } from "./relationships";

describe("createRelationshipBook", () => {
  test("strangers read as no familiarity and no opinion", () => {
    const book = createRelationshipBook();
    expect(book.get("ada", "bo")).toEqual({ familiarity: 0, opinion: 0 });
    expect(book.label("ada", "bo")).toBeNull();
    expect(book.friends("ada", "bo")).toBe(false);
  });

  test("a social action moves both dials and both agents read the same pair", () => {
    const book = createRelationshipBook();
    const outcome = book.socialise("ada", "bo");
    expect(outcome.after.familiarity).toBeCloseTo(0.08, 6);
    expect(outcome.after.opinion).toBe(4);
    expect(book.opinion("bo", "ada")).toBe(4);
    expect(book.familiarity("ada", "bo")).toBeCloseTo(0.08, 6);
    expect(book.partnersOf("ada")).toEqual(["bo"]);
  });

  test("enough warm interactions make friends, and a friend prefers that company", () => {
    const book = createRelationshipBook();
    let crossed: string[] = [];
    for (let i = 0; i < 9 && crossed.length === 0; i += 1) {
      crossed = [...crossed, ...book.socialise("ada", "bo", { familiarity: 0.1, opinion: 4 }).crossed.map((m) => m.id)];
    }
    expect(crossed).toEqual(["friends"]);
    expect(book.friends("ada", "bo")).toBe(true);
    expect(book.prefersCompanyOf("ada", "bo")).toBe(true);
    expect(book.refusesToSplit("ada", "bo")).toBe(false);
  });

  test("a bond needs time together as well as a high opinion", () => {
    const book = createRelationshipBook();
    book.socialise("ada", "bo", { familiarity: 0.05, opinion: 96 });
    expect(book.bonded("ada", "bo")).toBe(false);

    book.socialise("ada", "bo", { familiarity: 0.5, opinion: 0 });
    expect(book.bonded("ada", "bo")).toBe(true);
    expect(book.label("ada", "bo")).toBe("bonded");
    expect(book.bondedWith("bo")).toBe("ada");
  });

  test("a bonded pair refuses to split; a friendly pair does not", () => {
    const book = createRelationshipBook();
    book.socialise("ada", "bo", { familiarity: 1, opinion: 95 });
    book.socialise("cy", "dee", { familiarity: 1, opinion: 40 });

    expect(book.refusesToSplit("ada", "bo")).toBe(true);
    expect(book.refusesToSplit("bo", "ada")).toBe(true);
    expect(book.refusesToSplit("cy", "dee")).toBe(false);
    expect(book.prefersCompanyOf("cy", "dee")).toBe(true);
  });

  test("a negative contact is a row: opinion drops and no milestone is crossed", () => {
    const book = createRelationshipBook();
    book.socialise("ada", "bo", { familiarity: 0.2, opinion: 40 });
    const outcome = book.socialise("ada", "bo", { familiarity: 0.1, opinion: -50 });
    expect(outcome.after.opinion).toBe(-10);
    expect(outcome.crossed).toEqual([]);
    expect(book.friends("ada", "bo")).toBe(false);
  });

  test("an agent cannot bond with itself, even through a wide query", () => {
    const book = createRelationshipBook();
    const outcome = book.socialise("ada", "ada", { familiarity: 1, opinion: 100 });
    expect(outcome.crossed).toEqual([]);
    expect(book.get("ada", "ada")).toEqual({ familiarity: 0, opinion: 0 });
    expect(book.partnersOf("ada")).toEqual([]);
  });

  test("delimiter characters in ids stay separate pairs", () => {
    const book = createRelationshipBook();
    book.socialise("ada|x", "bo", { opinion: 10 });
    book.socialise("ada", "x|bo", { opinion: 90 });
    expect(book.opinion("ada|x", "bo")).toBe(10);
    expect(book.opinion("ada", "x|bo")).toBe(90);
  });

  test("the whole book round trips through JSON", () => {
    const book = createRelationshipBook();
    book.socialise("ada", "bo", { familiarity: 0.6, opinion: 96 });
    book.socialise("cy", "dee", { familiarity: 0.2, opinion: 18 });
    const restored = createRelationshipBook();
    restored.restore(JSON.parse(JSON.stringify(book.snapshot())));

    expect(restored.get("ada", "bo")).toEqual(book.get("ada", "bo"));
    expect(restored.bondedWith("ada")).toBe("bo");
    expect(restored.partnersOf("cy")).toEqual(["dee"]);
    expect(restored.policy().milestones).toEqual(book.policy().milestones);
  });

  test("retuning the milestone scale changes how a stored pair reads", () => {
    const book = createRelationshipBook();
    book.socialise("ada", "bo", { familiarity: 1, opinion: 40 });
    expect(book.label("ada", "bo")).toBe("friends");
    book.retune({ milestones: [{ id: "crew", label: "Crew", at: 30 }] });
    expect(book.label("ada", "bo")).toBe("crew");
  });
});
