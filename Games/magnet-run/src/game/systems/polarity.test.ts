import { describe, expect, test } from "bun:test";
import { holds, opposite, resolveContact } from "./polarity";

describe("magnetic contact truth table", () => {
  test("opposite polarities hold", () => {
    expect(resolveContact("red", "blue")).toBe("hold");
    expect(resolveContact("blue", "red")).toBe("hold");
  });
  test("matching polarities repel", () => {
    expect(resolveContact("red", "red")).toBe("repel");
    expect(resolveContact("blue", "blue")).toBe("repel");
  });
  test("holds() mirrors resolveContact", () => {
    expect(holds("red", "blue")).toBe(true);
    expect(holds("red", "red")).toBe(false);
  });
  test("opposite() is involutive", () => {
    expect(opposite(opposite("red"))).toBe("red");
    expect(opposite("red")).toBe("blue");
    expect(opposite("blue")).toBe("red");
  });
});
