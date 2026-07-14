import { describe, expect, test } from "bun:test";

import { CLASSES } from "../../classes/catalog";
import {
  classSelectReady,
  isHeroNameValid,
  pickSuggestedName,
  selectClass,
} from "./classSelectState";

describe("class-select state", () => {
  test("the first selection from an empty screen registers the clicked class", () => {
    const first = CLASSES[0];
    expect(first).toBeDefined();
    const afterFirstClick = selectClass(null, first!.id);
    expect(afterFirstClick).toBe(first!.id);
  });

  test("selecting a different class replaces the prior selection", () => {
    const [a, b] = CLASSES;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(selectClass(a!.id, b!.id)).toBe(b!.id);
  });

  test("ready flips true the moment a class is picked with a valid name", () => {
    expect(classSelectReady(null, "Rowan")).toBe(false);
    expect(classSelectReady(CLASSES[0]!.id, "Rowan")).toBe(true);
  });

  test("ready stays false for a selected class with an invalid name", () => {
    expect(classSelectReady(CLASSES[0]!.id, "")).toBe(false);
    expect(classSelectReady(CLASSES[0]!.id, "X")).toBe(false);
    expect(classSelectReady(CLASSES[0]!.id, "9lives")).toBe(false);
  });

  test("hero name validation accepts letters, spaces, apostrophes, hyphens", () => {
    expect(isHeroNameValid("Aldric")).toBe(true);
    expect(isHeroNameValid("Da' mira")).toBe(true);
    expect(isHeroNameValid("Jean-Luc")).toBe(true);
    expect(isHeroNameValid("  Faye  ")).toBe(true);
    expect(isHeroNameValid("1337")).toBe(false);
    expect(isHeroNameValid("A")).toBe(false);
  });

  test("pickSuggestedName is deterministic under an injected random", () => {
    expect(pickSuggestedName(() => 0)).toBe("Aldric");
    expect(pickSuggestedName(() => 0.999)).toBe("Thane");
  });
});
