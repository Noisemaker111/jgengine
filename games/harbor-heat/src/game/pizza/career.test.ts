import { describe, expect, test } from "bun:test";
import { playCareer } from "./career";

describe("a whole career on paper", () => {
  const career = playCareer();

  test("print the balance sheet", () => {
    for (const night of career.nights) {
      const short = night.quotaMet ? "" : " (short)";
      console.log(`night ${night.night}: ${night.delivered} boxes, $${night.takings}/${night.quota}${short}, rep ${night.rep}, [${night.bought.join(", ")}], paid $${night.paid}, owed $${night.debt}`);
    }
    console.log(`saved on night ${career.savedOn}, $${career.totalTakings} taken, ${career.chapters} chapters, ${career.foreclosures} foreclosures`);
  });

  test("the shop is saved in a couple of hours of play, not one sitting and not a grind", () => {
    // A shift is six real minutes plus its summary: 12–24 shifts is roughly 1.5–3 hours.
    expect(career.savedOn).not.toBeNull();
    expect(career.savedOn!).toBeGreaterThanOrEqual(12);
    expect(career.savedOn!).toBeLessThanOrEqual(24);
  });

  test("every chapter lands before the note is paid, and MegaSlice never forecloses on a steady rider", () => {
    expect(career.chapters).toBe(8);
    expect(career.foreclosures).toBe(0);
  });

  test("the first night is winnable and a steady rider rarely falls short", () => {
    expect(career.nights[0]!.quotaMet).toBe(true);
    expect(career.nights.filter((night) => !night.quotaMet).length).toBeLessThanOrEqual(2);
  });

  test("the kitchen fills out before the note is paid, and reputation opens every customer", () => {
    const firstPayment = career.nights.findIndex((night) => night.paid > 0);
    expect(firstPayment).toBeGreaterThan(0);
    const ovens = career.nights.slice(0, firstPayment + 1).flatMap((night) => night.bought).filter((item) => item.startsWith("oven"));
    expect(ovens.length).toBe(2);
    expect(career.nights.at(-1)!.rep).toBe(5);
  });

  test("a rider still learning the streets gets there too, a few nights later", () => {
    const slow = playCareer(60, 0.7);
    console.log(`slow rider: saved on night ${slow.savedOn}, ${slow.foreclosures} foreclosures, ${slow.nights.filter((n) => !n.quotaMet).length} short nights`);
    expect(slow.savedOn).not.toBeNull();
    expect(slow.savedOn!).toBeGreaterThan(career.savedOn!);
    expect(slow.savedOn!).toBeLessThanOrEqual(32);
    expect(slow.foreclosures).toBeLessThanOrEqual(1);
  });
});
