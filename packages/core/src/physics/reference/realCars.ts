import { TNO_205_60R15 } from "./magicFormulaTire";
import type { ReferenceCarSpec } from "./referenceCar";

const FT = 0.3048;
const DEG_PER_RAD = 180 / Math.PI;
const KMH_100 = 100 / 3.6;
const MPH_60 = 60 * 0.44704;
/** A test driver and instruments, kg, added to curb weight for test mass. */
const DRIVER_KG = 80;
// TNO measured its tyre on a test surface; one MF friction scale (λμx = λμy) moves it to a dry test-track road.
// It is set once so the MX-5's skidpad matches, then shared by every car, so the other numbers stay predictions.
const ROAD_FRICTION = 1.04;
const ROAD_TIRE = { ...TNO_205_60R15, lmux: ROAD_FRICTION, lmuy: ROAD_FRICTION };

/** Scale a 60–0 mph stopping distance to 100–0 km/h: braking distance grows with speed squared. */
function brakeFrom60mph(feet: number): number {
  return feet * FT * (KMH_100 / MPH_60) ** 2;
}

/** Numbers a magazine or the maker published for a car, with where each came from. */
export interface RealCarTestData {
  /** Standing start to 100 km/h, s. */
  zeroTo100: number;
  /** 100 km/h to rest, m. */
  brake100To0: number;
  /** Steady lateral acceleration on a skidpad of `skidpadRadius`, g. */
  skidpadG: number;
  /** Radius of the skidpad that number was measured on, m. */
  skidpadRadius: number;
  /** Source of each number, keyed like the fields above. */
  sources: { zeroTo100: string; brake100To0: string; skidpadG: string };
}

/** A real car: the {@link ReferenceCarSpec} built from its published specifications, and its published test results. */
export interface RealCar {
  id: string;
  name: string;
  spec: ReferenceCarSpec;
  tested: RealCarTestData;
  /** Source of each specification; fields marked "estimate" have no published value and use typical figures for the class. */
  specSources: Readonly<Record<string, string>>;
}

/** 2016 Mazda MX-5 Miata Club (ND, 2.0 L, six-speed manual, limited-slip differential): light, 50:50, rear drive. */
export const MAZDA_MX5_ND: RealCar = {
  id: "mazda-mx5-nd",
  name: "Mazda MX-5 (ND) 2.0 manual",
  spec: {
    massKg: 1058 + DRIVER_KG,
    frontWeight: 0.5,
    comHeight: 0.45,
    wheelbase: 2.31,
    tire: { coefficients: ROAD_TIRE, unloadedRadius: 0.2159 + 0.205 * 0.45 },
    front: {
      geometry: {
        kind: "doubleWishbone",
        lowerFront: [0.2, 0.33, 0.17],
        lowerRear: [-0.15, 0.35, 0.16],
        lowerBallJoint: [0, 0.7, 0.13],
        upperFront: [0.08, 0.455, 0.485],
        upperRear: [-0.16, 0.455, 0.485],
        upperBallJoint: [-0.04, 0.66, 0.5],
        tieRodInner: [-0.14, 0.34, 0.193],
        tieRodOuter: [-0.14, 0.68, 0.17],
        wheelCenter: [0, 0.743, 0.29],
        camber: -0.0175,
        toe: 0,
        springBody: [-0.02, 0.5, 0.6],
        springArm: [-0.02, 0.58, 0.16],
      },
      wheelRate: 21900,
      bumpDamping: 1400,
      reboundDamping: 2300,
      antiRollRate: 12000,
      bumpTravel: 0.06,
      droopTravel: 0.08,
      unsprungMass: 34,
      compliance: { steer: 0.15 / DEG_PER_RAD / 1000, camber: 0.1 / DEG_PER_RAD / 1000 },
    },
    rear: {
      geometry: {
        kind: "doubleWishbone",
        lowerFront: [0.18, 0.36, 0.14],
        lowerRear: [-0.2, 0.38, 0.17],
        lowerBallJoint: [0, 0.7, 0.12],
        upperFront: [0.12, 0.48, 0.46],
        upperRear: [-0.1, 0.48, 0.48],
        upperBallJoint: [0, 0.66, 0.46],
        tieRodInner: [-0.18, 0.38, 0.234],
        tieRodOuter: [-0.15, 0.69, 0.2],
        wheelCenter: [0, 0.748, 0.29],
        camber: -0.026,
        toe: 0.003,
        springBody: [0, 0.55, 0.62],
        springArm: [0, 0.6, 0.15],
      },
      wheelRate: 24900,
      bumpDamping: 1500,
      reboundDamping: 2500,
      antiRollRate: 3000,
      bumpTravel: 0.06,
      droopTravel: 0.08,
      unsprungMass: 34,
      compliance: { steer: -0.05 / DEG_PER_RAD / 1000, camber: 0.1 / DEG_PER_RAD / 1000 },
    },
    steering: { ratio: 15, maxHandwheel: 1.3 * 2 * Math.PI, compliance: 0.4 / DEG_PER_RAD / 100 },
    driven: "rear",
    engine: {
      torqueCurve: [
        [1000, 140],
        [2000, 170],
        [3000, 185],
        [4000, 197],
        [4600, 201],
        [5500, 193],
        [6000, 185],
        [6800, 165],
      ],
      idleRpm: 750,
      redlineRpm: 6800,
      inertia: 0.13,
    },
    halfshaft: { stiffness: 11000, damping: 25 },
    gearbox: { ratios: [5.087, 2.991, 2.035, 1.594, 1.286, 1.0], finalDrive: 2.866 },
    clutch: { launchRpm: 4000 },
    differential: { kind: "clutch", preload: 50, powerLock: 0.3, coastLock: 0.5 },
    brakes: { maxTorque: 5000, frontShare: 0.68 },
    aero: { dragArea: 0.6 },
  },
  tested: {
    zeroTo100: 7.3,
    brake100To0: brakeFrom60mph(111),
    skidpadG: 0.88,
    skidpadRadius: (300 * FT) / 2,
    sources: {
      zeroTo100: "Mazda's claim for the 2.0 L manual roadster, 7.3 s (Wikipedia, Mazda MX-5 (ND), specifications)",
      brake100To0: "Edmunds, 2016 Mazda MX-5 Miata review: Club manual stopped from 60 mph in 111 ft (scaled to 100 km/h by v²)",
      skidpadG: "Car and Driver, 2016 Mazda MX-5 Miata test: 0.88 g on a 300-ft skidpad",
    },
  },
  specSources: {
    massKg: "Car and Driver / MotorWeek curb weight 2,332 lb (1,058 kg) plus an 80 kg driver",
    frontWeight: "Mazda: 50:50 weight distribution",
    wheelbase: "Wikipedia, Mazda MX-5 (ND): 2,310 mm",
    track: "Mazda spec listing 1,495 / 1,505 mm, set by the wheel-centre points",
    geometry: "estimate: SLA front and five-link rear (modelled as SLA) hardpoints laid out for the published track and alignment, with typical arm lengths, caster and roll-centre heights; toe links placed for typical bump steer (front 0.04°/cm toe-out, rear 0.03°/cm toe-in)",
    steering: "Mazda: 15.0:1 overall ratio, 2.6 turns lock to lock",
    engine: "Wikipedia: 155 hp at 6,000 rpm, 148 lb-ft (201 N·m) at 4,600 rpm; curve between those points is an estimate",
    gearbox: "Racer.com, 'Five things racers need to know about the 2016 Mazda Miata': 5.087/2.991/2.035/1.594/1.286/1.000, final 2.866",
    tire: "205/45 R17 size; coefficients are the TNO 205/60 R15 set (Pacejka 2012 App. 3), not the fitted Bridgestone; friction scaled ×1.04 (λμ) for a dry test track, set from this car's skidpad",
    comHeight: "estimate",
    suspension: "estimate (1.5/1.6 Hz ride, ζ 0.3 bump / 0.5 rebound); bushing and steering compliance are typical figures",
    differential: "estimate (clutch-type LSD on the Club manual)",
    brakes: "estimate",
    aero: "estimate",
  },
};

/** 2013 Scion FR-S (Toyota 86 / Subaru BRZ, 2.0 L flat-four, six-speed manual, Torsen differential). */
export const SCION_FRS_2013: RealCar = {
  id: "scion-frs-2013",
  name: "Scion FR-S (Toyota 86) 2013 manual",
  spec: {
    massKg: 1251 + DRIVER_KG,
    frontWeight: 0.53,
    comHeight: 0.46,
    wheelbase: 2.57,
    tire: { coefficients: ROAD_TIRE, unloadedRadius: 0.2159 + 0.215 * 0.45 },
    front: {
      geometry: {
        kind: "macPherson",
        lowerFront: [0.18, 0.36, 0.14],
        lowerRear: [-0.22, 0.38, 0.15],
        lowerBallJoint: [0, 0.72, 0.12],
        strutTop: [-0.05, 0.6, 0.72],
        strutLower: [-0.01, 0.645, 0.38],
        tieRodInner: [-0.14, 0.37, 0.194],
        tieRodOuter: [-0.14, 0.69, 0.18],
        wheelCenter: [0, 0.755, 0.3],
        camber: -0.01,
        toe: 0,
      },
      wheelRate: 35900,
      bumpDamping: 2000,
      reboundDamping: 3400,
      antiRollRate: 18000,
      bumpTravel: 0.06,
      droopTravel: 0.08,
      unsprungMass: 40,
      compliance: { steer: 0.15 / DEG_PER_RAD / 1000, camber: 0.12 / DEG_PER_RAD / 1000 },
    },
    rear: {
      geometry: {
        kind: "doubleWishbone",
        lowerFront: [0.18, 0.36, 0.14],
        lowerRear: [-0.2, 0.38, 0.17],
        lowerBallJoint: [0, 0.72, 0.12],
        upperFront: [0.12, 0.5, 0.46],
        upperRear: [-0.1, 0.5, 0.48],
        upperBallJoint: [0, 0.68, 0.46],
        tieRodInner: [-0.18, 0.4, 0.2325],
        tieRodOuter: [-0.15, 0.71, 0.2],
        wheelCenter: [0, 0.765, 0.3],
        camber: -0.022,
        toe: 0.002,
        springBody: [0, 0.57, 0.62],
        springArm: [0, 0.62, 0.15],
      },
      wheelRate: 35200,
      bumpDamping: 1900,
      reboundDamping: 3100,
      antiRollRate: 8000,
      bumpTravel: 0.06,
      droopTravel: 0.08,
      unsprungMass: 40,
      compliance: { steer: -0.05 / DEG_PER_RAD / 1000, camber: 0.1 / DEG_PER_RAD / 1000 },
    },
    steering: { ratio: 13.1, maxHandwheel: 1.25 * 2 * Math.PI, compliance: 0.4 / DEG_PER_RAD / 100 },
    driven: "rear",
    engine: {
      torqueCurve: [
        [1000, 130],
        [2000, 160],
        [3000, 180],
        [3800, 172],
        [4400, 175],
        [5000, 190],
        [6000, 200],
        [6500, 205],
        [7000, 200],
        [7400, 190],
      ],
      idleRpm: 700,
      redlineRpm: 7400,
      inertia: 0.14,
    },
    halfshaft: { stiffness: 13000, damping: 25 },
    gearbox: { ratios: [3.626, 2.188, 1.541, 1.213, 1.0, 0.767], finalDrive: 4.1 },
    clutch: { launchRpm: 4500 },
    differential: { kind: "torsen", biasRatio: 1.8 },
    brakes: { maxTorque: 5500, frontShare: 0.66 },
    aero: { dragArea: 0.27 * 1.97 },
  },
  tested: {
    zeroTo100: 7.6,
    brake100To0: brakeFrom60mph(114),
    skidpadG: 0.89,
    skidpadRadius: (200 * FT) / 2,
    sources: {
      zeroTo100: "Toyota's claim for the GT86 manual, 0–100 km/h 7.6 s (Wikipedia, Toyota 86, manufacturer's claim)",
      brake100To0: "Edmunds, 2013 Scion FR-S Track Test: 60–0 mph in 114 ft (scaled to 100 km/h by v²)",
      skidpadG: "Edmunds, 2013 Scion FR-S Track Test: 0.89 g on the skidpad (Edmunds uses a 200-ft circle)",
    },
  },
  specSources: {
    massKg: "Wikipedia, Toyota 86: FR-S curb weight from 1,251 kg, plus an 80 kg driver",
    frontWeight: "Wikipedia, Toyota 86: 53/47",
    comHeight: "Toyota press material: 460 mm centre of gravity",
    wheelbase: "Wikipedia, Toyota 86: 2,570 mm",
    track: "estimate (1,520 / 1,540 mm as commonly listed), set by the wheel-centre points",
    geometry: "estimate: MacPherson front and double-wishbone rear hardpoints laid out for the track and alignment, with typical strut inclination, caster and roll-centre heights; toe links placed for typical bump steer (front 0.04°/cm toe-out, rear 0.03°/cm toe-in)",
    steering: "Toyota: 13.1:1 overall ratio, 2.5 turns lock to lock",
    engine: "Wikipedia, Toyota 86: 200 PS at 7,000 rpm, 205 N·m at 6,400 rpm; curve shape between those points is an estimate",
    gearbox: "carspecs.us 2013 FR-S manual 3.63/2.19/1.54/1.21/1.00/0.77; final drive 4.10 (Auto123 launch report)",
    tire: "215/45 R17 Michelin Primacy HP size; coefficients are the TNO 205/60 R15 set (Pacejka 2012 App. 3); friction scaled ×1.04 (λμ), the value set from the MX-5 skidpad",
    differential: "Wikipedia, Toyota 86: Torsen limited-slip; no bias ratio is published, reviewers call it modest: 1.8 is an estimate",
    aero: "Wikipedia, Toyota 86: Cd 0.27; frontal area 1.97 m² is an estimate",
    suspension: "estimate (1.7/1.8 Hz ride, ζ 0.3 bump / 0.5 rebound); bushing and steering compliance are typical figures",
    brakes: "estimate",
  },
};

/** Every real car with published test numbers the reference is checked against. */
export const REAL_CARS: readonly RealCar[] = [MAZDA_MX5_ND, SCION_FRS_2013];
