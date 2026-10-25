import { describe, expect, test } from "bun:test";
import { ROSTER_METRICS, rosterFit, rosterPage } from "./rosterPage";

describe("rosterPage", () => {
  test("slices N units into pages of P and the last page shows the remainder", () => {
    const p0 = rosterPage(7, 5, 0);
    expect([p0.start, p0.end, p0.pageCount, p0.hasPrev, p0.hasNext]).toEqual([0, 5, 2, false, true]);
    const p1 = rosterPage(7, 5, 1);
    expect([p1.page, p1.start, p1.end, p1.hasPrev, p1.hasNext]).toEqual([1, 5, 7, true, false]);
  });

  test("an exact multiple has no partial last page", () => {
    const p = rosterPage(10, 5, 1);
    expect([p.start, p.end, p.pageCount, p.hasNext]).toEqual([5, 10, 2, false]);
  });

  test("the requested page is clamped into range", () => {
    expect(rosterPage(7, 5, 9).page).toBe(1);
    expect(rosterPage(7, 5, -3).page).toBe(0);
    expect(rosterPage(7, 5, Number.NaN).page).toBe(0);
  });

  test("an empty roster is a single empty page with both arrows disabled", () => {
    const p = rosterPage(0, 5, 0);
    expect([p.start, p.end, p.pageCount, p.hasPrev, p.hasNext]).toEqual([0, 0, 1, false, false]);
  });

  test("a roster that fits on one page has both arrows disabled", () => {
    const p = rosterPage(3, 3, 0);
    expect([p.start, p.end, p.pageCount, p.hasPrev, p.hasNext]).toEqual([0, 3, 1, false, false]);
  });

  test("a page size below one is treated as one crest per page", () => {
    expect(rosterPage(3, 0, 2).end).toBe(3);
    expect(rosterPage(3, 0, 2).pageCount).toBe(3);
  });
});

describe("rosterFit", () => {
  test("no paging when every crest fits the row", () => {
    // 7 crests need 7*36 + 6*4 = 276px, which fits the 304px army row.
    expect(rosterFit(7, 304)).toEqual({ pageSize: 7, paged: false });
  });

  test("an eighth crest forces paging with arrows reserved", () => {
    // 304 - 2*32 - 2*4 = 232px of crests -> floor((232+4)/40) = 5 per page.
    expect(rosterFit(8, 304)).toEqual({ pageSize: 5, paged: true });
  });

  test("pages never hold more crests than the row can physically fit", () => {
    for (let width = 800; width <= 1920; width += 1) {
      for (let count = 1; count <= 40; count++) {
        const fit = rosterFit(count, width);
        if (!fit.paged) {
          expect(count * 36 + (count - 1) * 4).toBeLessThanOrEqual(width);
        } else {
          const rowWidth = 2 * ROSTER_METRICS.arrow + 2 * 4 + fit.pageSize * 36 + (fit.pageSize - 1) * 4;
          expect(rowWidth).toBeLessThanOrEqual(width);
        }
      }
    }
  });

  test("an empty roster needs no page", () => {
    expect(rosterFit(0, 304)).toEqual({ pageSize: 0, paged: false });
  });

  test("a row too narrow for arrows still shows one crest per page", () => {
    expect(rosterFit(4, 40)).toEqual({ pageSize: 1, paged: true });
  });
});
