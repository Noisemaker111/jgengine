import { describe, expect, test } from "bun:test";

import { parseContributionsHtml } from "./server";

const HTML = `
  <table>
    <td tabindex="-1" data-ix="0" class="ContributionCalendar-day" data-date="2026-07-06" data-level="1" role="gridcell" id="c1"></td>
    <td tabindex="-1" data-ix="1" class="ContributionCalendar-day" data-date="2026-07-07" data-level="4" role="gridcell" id="c2"></td>
    <td tabindex="-1" data-ix="2" class="ContributionCalendar-day" data-date="2026-07-08" data-level="0" role="gridcell" id="c3"></td>
  </table>
  <tool-tip id="t1" for="c1" popover="manual" class="sr-only position-absolute">2 contributions on July 6th.</tool-tip>
  <tool-tip id="t2" for="c2" popover="manual" class="sr-only position-absolute">17 contributions on July 7th.</tool-tip>
  <tool-tip id="t3" for="c3" popover="manual" class="sr-only position-absolute">No contributions on July 8th.</tool-tip>
`;

describe("parseContributionsHtml", () => {
  test("pairs each day cell with its tooltip count regardless of attribute order", () => {
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
