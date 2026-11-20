import { expect, test } from "bun:test";

import { TerritoryOverlay } from "./TerritoryOverlay.view";

test("territory feedback distinguishes blocked land from unaffordable claims", () => {
  const props = { cells: [{ key: "0,0", x: 0, z: 0, status: "claimable" as const }], cost: 50, affordable: false };
  expect(JSON.stringify(TerritoryOverlay(props))).toContain("Insufficient funds");
  expect(JSON.stringify(TerritoryOverlay({ ...props, cells: [{ ...props.cells[0]!, status: "blocked" }] }))).toContain("Land unavailable");
});
