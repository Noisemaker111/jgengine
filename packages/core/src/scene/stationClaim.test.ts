import { describe, expect, test } from "bun:test";

import { createStationClaim } from "./stationClaim";

function ship() {
  const claim = createStationClaim();
  claim.register({
    id: "galleon",
    kit: { kind: "boat" },
    stations: [
      { id: "helm", facet: "steer", offset: [0, 1, 2], control: true },
      { id: "mast", facet: "sails", offset: [0, 3, 0] },
      { id: "portGun", facet: "cannon", offset: [-2, 1, 0] },
      { id: "starboardGun", facet: "cannon", offset: [2, 1, 0] },
    ],
  });
  return claim;
}

describe("multi-player shared vehicle stations", () => {
  test("each player claims one facet of the one shared vehicle", () => {
    const claim = ship();
    expect(claim.claim("captain", "galleon", "steer").ok).toBe(true);
    expect(claim.claim("bosun", "galleon", "sails").ok).toBe(true);
    expect(claim.claim("gunner", "galleon", "portGun").ok).toBe(true);

    expect(claim.facetOf("captain")).toBe("steer");
    expect(claim.facetOf("bosun")).toBe("sails");
    expect(claim.facetOf("gunner")).toBe("cannon");
    expect(claim.controllerOf("galleon", "steer")).toBe("captain");
    expect(claim.crew("galleon").length).toBe(3);
  });

  test("only the control station operator drives the hull; others ride but command their facet", () => {
    const claim = ship();
    claim.claim("captain", "galleon", "steer");
    claim.claim("gunner", "galleon", "portGun");

    expect(claim.driver("galleon")).toBe("captain");
    expect(claim.driveTarget("captain")).toBe("galleon");
    expect(claim.driveTarget("gunner")).toBeNull();
    expect(claim.cameraTarget("gunner")).toBe("galleon");
    expect(claim.cameraTarget("captain")).toBe("galleon");
  });

  test("a claimed station cannot be double-claimed; a free facet of the same kind still resolves", () => {
    const claim = ship();
    claim.claim("g1", "galleon", "portGun");
    const taken = claim.claim("g2", "galleon", "portGun");
    expect(taken.ok).toBe(false);
    if (!taken.ok) expect(taken.reason).toBe("station_taken");

    const other = claim.claim("g2", "galleon", "starboardGun");
    expect(other.ok).toBe(true);
    expect(claim.openFacets("galleon").sort()).toEqual(["sails", "steer"]);
  });

  test("releasing a station frees it for the next crewmate", () => {
    const claim = ship();
    claim.claim("captain", "galleon", "steer");
    expect(claim.release("captain")).toBe("galleon");
    expect(claim.driver("galleon")).toBeNull();
    expect(claim.claim("mate", "galleon", "steer").ok).toBe(true);
  });

  test("unknown vehicle and unknown facet are rejected", () => {
    const claim = ship();
    expect(claim.claim("p", "ghost", "steer")).toEqual({ ok: false, reason: "unknown_vehicle" });
    expect(claim.claim("p", "galleon", "teleport")).toEqual({ ok: false, reason: "unknown_facet" });
  });
});
