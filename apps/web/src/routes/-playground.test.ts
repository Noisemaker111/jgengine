import { describe, expect, test } from "bun:test";

import { DEFAULTS, PRESETS, growPlayground, parsePlaygroundQuery } from "./playground";

describe("playground query controls", () => {
  test("parses all generation and inspection controls deterministically", () => {
    const search = "?seed=vice-isle&size=300&gridness=.4&connectivity=.5&branching=.6&winding=.2&segmentLength=75&boulevards=.3&lotW=14&lotD=16&setback=4&spacing=3.5&variety=.8&fill=.9&landmarks=.1&elevation=.25&trackDensity=.7&sidewalks=false&sidewalkWidth=2.5&markings=off&markingWidth=.2&markingOffset=-.5&markingDash=6&markingGap=3&junction=5&cameraRadius=90&cameraPitch=50&cameraYaw=-35&inspect=1&capture=true&mode=city&view=3d";
    const parsed = parsePlaygroundQuery(search);
    expect(parsed).toEqual(parsePlaygroundQuery(search));
    expect(parsed).toMatchObject({
      dials: {
        seed: "vice-isle",
        size: 300,
        spacing: 3.5,
        variety: 0.8,
        blockFill: 0.9,
        sidewalks: false,
        laneMarkings: false,
        focusJunction: 5,
        cameraRadius: 90,
        cameraPitch: 50,
        cameraYaw: -35,
        sidewalkWidth: 2.5,
        laneMarkingWidth: 0.2,
      },
      mode: "city",
      view: "3d",
      inspect: true,
      capture: true,
    });
  });

  test("clamps generation, junction, and camera controls to safe ranges", () => {
    expect(parsePlaygroundQuery("?mode=circuit&size=999&gridness=-2&spacing=99&variety=-1&junction=-8&cameraRadius=-5&cameraPitch=180")).toMatchObject({
      mode: "circuit",
      dials: { size: 400, gridness: 0, spacing: 8, variety: 0, focusJunction: -1, cameraRadius: 12, cameraPitch: 85 },
    });
  });

  test("parses and clamps an explicit camera independently of junction framing", () => {
    expect(parsePlaygroundQuery("?cam=-12.5,44,999,5").cam).toEqual({ x: -12.5, z: 44, radius: 180, pitch: 25, yaw: 45 });
    expect(parsePlaygroundQuery("?cam=9999,-9999,80").cam).toEqual({ x: 1000, z: -1000, radius: 80, pitch: 45, yaw: 45 });
    expect(parsePlaygroundQuery("?cam=1,2,nope,40").cam).toBeNull();
  });

  test("leaves focused evidence defaults wider and less top-down", () => {
    expect(parsePlaygroundQuery("?junction=0").dials).toMatchObject({
      focusJunction: 0,
      cameraRadius: 120,
      cameraPitch: 45,
      cameraYaw: 45,
    });
  });

  test("round-trips the street-race mode and every shared topology dial", () => {
    const search = "?mode=race&loopiness=.62&deadEnds=.08&aspect=1.8&roadWidth=12&minCurveRadius=26&lapLength=1800&arterialBias=.85&checkpoints=16";
    const parsed = parsePlaygroundQuery(search);
    expect(parsed).toEqual(parsePlaygroundQuery(search));
    expect(parsed).toMatchObject({
      mode: "race",
      dials: {
        loopiness: 0.62,
        deadEnds: 0.08,
        aspect: 1.8,
        roadWidth: 12,
        minCurveRadius: 26,
        lapLength: 1800,
        arterialBias: 0.85,
        checkpoints: 16,
      },
    });
  });

  test("clamps the topology and race dials to safe ranges", () => {
    expect(parsePlaygroundQuery("?loopiness=9&deadEnds=-1&aspect=0&roadWidth=99&minCurveRadius=1&lapLength=99999&arterialBias=-3&checkpoints=99").dials).toMatchObject({
      loopiness: 1,
      deadEnds: 0,
      aspect: 1,
      roadWidth: 16,
      minCurveRadius: 6,
      lapLength: 6000,
      arterialBias: 0,
      checkpoints: 24,
    });
  });
});

describe("street race generation", () => {
  const dials = { ...DEFAULTS, ...PRESETS.race };

  test("lifts the lap out of the very city street network the city mode grows", () => {
    const race = growPlayground("race", dials);
    const city = growPlayground("city", dials);
    expect(race.topology).toBe("net");
    expect(race.network.edges.map((edge) => edge.id)).toEqual(city.network.edges.map((edge) => edge.id));
    const route = race.route;
    expect(route).not.toBeNull();
    const cityEdges = new Set(race.network.edges.map((edge) => edge.id));
    expect(route!.edges.every((id) => cityEdges.has(id))).toBe(true);
    expect(route!.edges.length).toBeLessThan(race.network.edges.length);
    expect(route!.seals.length).toBeGreaterThan(0);
    expect(route!.length).toBeGreaterThan(0);
  });

  test("the circuit preset lands the same shared sliders on a closed lap", () => {
    const circuit = growPlayground("circuit", { ...DEFAULTS, ...PRESETS.circuit });
    expect(circuit.topology).toBe("circuit");
    expect(circuit.network.mode).toBe("circuit");
    expect(circuit.route).toBeNull();
  });

  test("only the mode picks what renders — city and race share one network", () => {
    expect(growPlayground("city", dials).route).toBeNull();
    expect(growPlayground("race", dials).city).not.toBeNull();
  });
});
