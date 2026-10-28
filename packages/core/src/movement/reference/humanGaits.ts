import { flatGround, slopeGround, stairGround, type GroundProfile } from "./footContact";
import { createHumanBody, type HumanBody } from "./humanBody";
import { analyzeLocomotion, reflexDriver, type GaitReport } from "./humanGaitAnalysis";
import { createReflexWalker, type ReflexParameters, type ReflexWalker } from "./reflexWalker";

/** Ground a fitted walk was tuned on. */
export type WalkTerrain = "level" | "uphill" | "downhill" | "stairs";

/** Reflex parameters fitted for one walking speed and terrain. */
export interface FittedWalk {
  terrain: WalkTerrain;
  /** Target speed of the fit and the speed the walk starts at, m/s. Above 1.6 m/s the walker settles slower than its target. */
  speed: number;
  reflexes: ReflexParameters;
}

/**
 * The terrains the fits ran on: level; a 6% grade up or down starting 3 m ahead; a flight of 0.15 m × 0.30 m steps
 * (a common building-code stair) starting 4 m ahead.
 */
export const WALK_TERRAIN: Record<WalkTerrain, GroundProfile> = {
  level: flatGround(),
  uphill: slopeGround(Math.atan(0.06), 3),
  downhill: slopeGround(-Math.atan(0.06), 3),
  stairs: stairGround(0.15, 0.3, 60, 4),
};

/**
 * Geyer–Herr reflex parameters fitted by CMA-ES on the 80 kg, 1.80 m reference human, minimising gross metabolic cost
 * of transport at the target speed with penalties on speed error, step-time variation, a heel-strike transient above
 * 1.3 body weights, a loading peak above 1.25, a mid-stance valley under 0.55, and any flight phase, with muscle cost
 * from fibre work (Margaria 1968, see `muscleMetabolicPower`). The fits at 2.0 and 2.3 m/s are the fastest the walker
 * holds: it settles at 1.76 and 1.83 m/s. The stair fit predates the fibre-work cost; cost does not change its gait.
 */
export const FITTED_WALKS: readonly FittedWalk[] = [
  {
    terrain: "level",
    speed: 0.7,
    reflexes: { gSol: 0.8431189545355372, gTa: 1.951292355950522, loffTa: 0.802976252685464, gSolTa: 0.2584343877370615, gGas: 0.06733478796807675, s0Vas: 0.05375716138047361, gVas: 1.9738172063191946, kPhi: 2.237038030299407, phiKneeOff: 3.095294738677082, s0Bal: -0.03848144725892436, kp: 3.0830603304418225, kd: 0.314879335005052, thetaRef: 0.039461761420501645, kbw: 1.0584301880570555, deltaS: 0.3996999862934, gHam: 0.4615472529913321, gGlu: -0.10688395494936644, gHfl: 0.571523380213242, loffHfl: 0.7966843476432413, gHamHfl: -0.7601738087856025, loffHam: 1.0576584799483748, kLean: 0.5087509237615054, prepVas: -0.05467315898914374, prepTa: 0.06849700893428133 },
  },
  {
    terrain: "level",
    speed: 1,
    reflexes: { gSol: 1.2938451956513324, gTa: 2.10736475926673, loffTa: 0.7632957906939668, gSolTa: 0.4283515139761785, gGas: 0.7579487641931227, s0Vas: 0.05346742539684527, gVas: 1.5449199347136044, kPhi: 0.1443407213805377, phiKneeOff: 2.7400854049519485, s0Bal: -0.022081437613770637, kp: 2.1453554555545495, kd: 0.30800393363131157, thetaRef: -0.047146101915930216, kbw: 1.383483121050596, deltaS: 0.438002799603842, gHam: 0.6829168498085041, gGlu: 0.10070532848734258, gHfl: 0.5772071823651385, loffHfl: 0.9727146285881345, gHamHfl: 1.5655711391567422, loffHam: 0.7813992988058653, kLean: 0.6337427908609174, prepVas: -0.025451676432513084, prepTa: -0.02594440185677903 },
  },
  {
    terrain: "level",
    speed: 1.3,
    reflexes: { gSol: 1.2633557084968183, gTa: 1.7083965222104909, loffTa: 0.9722294696031142, gSolTa: 0.5163479789725272, gGas: 0.24282189381811473, s0Vas: 0.04225100021097486, gVas: 1.6796964191270354, kPhi: 2.7419286412785553, phiKneeOff: 4.221557483399224, s0Bal: -0.0356714042696599, kp: 2.7077579002942977, kd: 0.26195441637098743, thetaRef: -0.06566653861237601, kbw: 0.9497585776257306, deltaS: 0.47444740826187526, gHam: 0.8413053540025945, gGlu: -0.16367060017584562, gHfl: 0.1630243617238233, loffHfl: 0.639918292533813, gHamHfl: -0.36605078681300357, loffHam: 0.9995855686645871, kLean: 1.3596455474551745, prepVas: -0.02667668437595405, prepTa: -0.07383167147711477 },
  },
  {
    terrain: "level",
    speed: 1.6,
    reflexes: { gSol: 1.3717446512674905, gTa: 1.7603162237561005, loffTa: 0.945067949615797, gSolTa: 0.4726973497909429, gGas: 0.47137797243291857, s0Vas: 0.10019373265747575, gVas: 1.0804273393300028, kPhi: 2.100248927843886, phiKneeOff: 4.447619900000675, s0Bal: 0.024755461867937062, kp: 2.958033856230718, kd: 0.2787066987827759, thetaRef: 0.005832419327966534, kbw: 0.5290298311496718, deltaS: 0.5106974044162093, gHam: 0.8326928378992579, gGlu: -0.1373370950940536, gHfl: 0.2851653592831217, loffHfl: 0.510152391696869, gHamHfl: -0.5952474356683164, loffHam: 0.7851908790574103, kLean: 1.2033158120684933, prepVas: -0.08771246222835294, prepTa: -0.031910198117429636 },
  },
  {
    terrain: "level",
    speed: 2,
    reflexes: { gSol: 1.3779455959846916, gTa: 0.9822926251789282, loffTa: 0.9313121153579617, gSolTa: 0.3839242325887993, gGas: 1.301616609563996, s0Vas: 0.19286514411422417, gVas: 1.1948187402865444, kPhi: 1.8714479007154885, phiKneeOff: 5.737960456291889, s0Bal: -0.1163710256866722, kp: 2.5603363747356145, kd: 0.43237102150987516, thetaRef: 0.1604442780840498, kbw: 1.0509326825329577, deltaS: 0.7068993380925641, gHam: 0.6001448206086417, gGlu: 0.15882741903554853, gHfl: 0.8014487123433921, loffHfl: 0.4403818574759435, gHamHfl: 1.0075834204294356, loffHam: 0.7998841266718741, kLean: 1.4969082003120968, prepVas: -0.24526829279101992, prepTa: 0.036346682072492045 },
  },
  {
    terrain: "level",
    speed: 2.3,
    reflexes: { gSol: 1.258548693474908, gTa: 1.1502683682822286, loffTa: 0.9253416880077112, gSolTa: 0.5697625882435383, gGas: 1.4625356385490214, s0Vas: 0.22729631468160516, gVas: 0.7802249750662889, kPhi: 0.8976508167962155, phiKneeOff: 4.890360495968978, s0Bal: 0.08828680817701161, kp: 0.4016448333684844, kd: 0.4834390932915534, thetaRef: 0.07757890642517935, kbw: 0.9940287297476098, deltaS: 0.8380147944049138, gHam: 0.17604167730434062, gGlu: 0.16423035076686784, gHfl: 0.7484690437621665, loffHfl: 0.6633120261286262, gHamHfl: 0.4584976612306092, loffHam: 1.654812431173414, kLean: 1.4336399981926402, prepVas: -0.015475021642493939, prepTa: -0.05005877667429144 },
  },
  {
    terrain: "uphill",
    speed: 1.3,
    reflexes: { gSol: 1.3313790728016661, gTa: 0.954121086710346, loffTa: 0.9218237651641414, gSolTa: 0.4306090004229671, gGas: 0.09572872413155334, s0Vas: 0.045676265066906176, gVas: 1.6244418340085496, kPhi: 2.172734382544114, phiKneeOff: 3.8928792513063666, s0Bal: -0.005681291716995426, kp: 2.044815575264624, kd: 0.35333336756366623, thetaRef: 0.13219692502237562, kbw: 1.6443611603178927, deltaS: 0.5691448974196018, gHam: 0.5303085281269133, gGlu: -0.024583257007492403, gHfl: 0.6194969193289294, loffHfl: 0.6280357160266024, gHamHfl: 0.32298360332230014, loffHam: 1.003254182741885, kLean: 1.9768602847695427, prepVas: -0.19877198191653533, prepTa: 0.028860493529794966 },
  },
  {
    terrain: "downhill",
    speed: 1.3,
    reflexes: { gSol: 1.1710981490267662, gTa: 1.183498361196238, loffTa: 0.8662286875969498, gSolTa: 0.22082989369474554, gGas: 0.5267165555051124, s0Vas: 0.03922000461959425, gVas: 2.199040004954838, kPhi: 1.271610525719817, phiKneeOff: 4.9362249072060385, s0Bal: -0.052857610797555785, kp: 2.414100558023884, kd: 0.41598619491166144, thetaRef: -0.06881142271451954, kbw: 0.6398872553020175, deltaS: 0.3608440705224511, gHam: 0.6763360769112613, gGlu: 0.1402093326581122, gHfl: 0.4738292908783117, loffHfl: 0.7397797774324444, gHamHfl: 1.0075469074549153, loffHam: 0.7171669224751872, kLean: 1.4143409077264217, prepVas: -0.15340427707325893, prepTa: -0.01099712382632393 },
  },
  {
    terrain: "stairs",
    speed: 0.6,
    reflexes: { gSol: 0.756469682147868, gTa: 0.8877173432372192, loffTa: 0.6818953127048262, gSolTa: 0.4610975953430462, gGas: 0.4544591035145038, s0Vas: 0.27190441743953564, gVas: 1.9541774893205326, kPhi: 1.6580960370843323, phiKneeOff: 3.8184457209310416, s0Bal: -0.138540174022659, kp: 1.735613280041375, kd: 0.33272576768227136, thetaRef: -0.037826067710680436, kbw: 1.2000583523178385, deltaS: 0.40912516800162024, gHam: -0.26493592267171906, gGlu: 0.41622934447542564, gHfl: 0.5504874811420081, loffHfl: 0.6788569943229023, gHamHfl: 4.206780633919656, loffHam: 0.21529292419067947, kLean: 1.7917017359941538, prepVas: 0.23519378535458785, prepTa: 0.09798506342966927 },
  },
];

/**
 * The fitted walk nearest `speed` on `terrain`.
 * @capability fitted-human-walk the reference human's fitted reflex walk nearest a speed on level ground, slopes or stairs
 */
export function fittedWalk(speed: number, terrain: WalkTerrain = "level"): FittedWalk {
  let best: FittedWalk | undefined;
  for (const walk of FITTED_WALKS) {
    if (walk.terrain !== terrain) continue;
    if (best === undefined || Math.abs(walk.speed - speed) < Math.abs(best.speed - speed)) best = walk;
  }
  if (best === undefined) throw new Error(`No fitted walk on ${terrain}`);
  return best;
}

const DEG = Math.PI / 180;

/**
 * Put `body` in the mid-swing pose the fits start from, moving at the walk's speed, and attach its reflex walker.
 * @internal
 */
export function startWalk(body: HumanBody, walk: FittedWalk): ReflexWalker {
  body.reset(0, { leftAnkle: 5 * DEG, leftKnee: -5 * DEG, leftHip: 5 * DEG, rightAnkle: 0, rightKnee: -5 * DEG, rightHip: 40 * DEG, trunk: -walk.reflexes.thetaRef }, walk.speed);
  return createReflexWalker(body, walk.reflexes);
}

/**
 * Walk the reference human with a fitted walk on its terrain and measure the steady gait (see `analyzeLocomotion`).
 * @capability human-walk-reference walk the muscle-reflex reference human at a fitted speed on level ground, a 6% grade or stairs, and measure it
 */
export function measureWalk(walk: FittedWalk, settle = 4, measure = 6): GaitReport {
  const body = createHumanBody({ mass: 80, stature: 1.8, ground: WALK_TERRAIN[walk.terrain] });
  return analyzeLocomotion(reflexDriver(body, startWalk(body, walk)), settle, measure);
}
