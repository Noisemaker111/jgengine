import { describe, expect, test } from "bun:test";

import { parseContributionsHtml } from "./server";

const HTML = `
  <table>
    <td id="c1" data-date="2026-07-06" data-level="1"></td>
    <td id="c2" data-date="2026-07-07" data-level="4"></td>
    <td id="c3" data-date="2026-07-08" data-level="0"></td>
  </table>
  <tool-tip for="c1">2 contributions on July 6th.</tool-tip>
  <tool-tip for="c2">17 contributions on July 7th.</tool-tip>
  <tool-tip for="c3">No contributions on July 8th.</tool-tip>
`;

describe("parseContributionsHtml", () => {
  test("pairs each day cell with its tooltip count and computes the weekday", () => {
    const days = parseContributionsHtml(HTML);
    expect(days).toEqual([
      { date: "2026-07-06", count: 2, weekday: 1 },
      { date: "2026-07-07", count: 17, weekday: 2 },
      { date: "2026-07-08", count: 0, weekday: 3 },
    ]);
  });

  test("returns nothing for markup without day cells", () => {
    expect(parseContributionsHtml("<div>no calendar here</div>")).toEqual([]);
  });
});
