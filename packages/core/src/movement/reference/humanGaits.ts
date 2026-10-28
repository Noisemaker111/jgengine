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
 * 1.3 body weights, a loading peak above 1.25, a mid-stance valley under 0.55, and any flight phase. The fits at 1.9
 * and 2.2 m/s are the fastest the walker holds: it settles at 1.70 and 1.78 m/s.
 */
export const FITTED_WALKS: readonly FittedWalk[] = [
  {
    terrain: "level",
    speed: 0.7,
    reflexes: { gSol: 0.84416346468726, gTa: 1.9434132931766526, loffTa: 0.7997313933374752, gSolTa: 0.2741149627094772, gGas: 0.09165208208031456, s0Vas: 0.05221835300859989, gVas: 1.969152123240801, kPhi: 2.3911634459789073, phiKneeOff: 3.5121867561359874, s0Bal: -0.05079518898546729, kp: 3.1981751334615134, kd: 0.32863340700265997, thetaRef: 0.032036828204410596, kbw: 1.1238624032738411, deltaS: 0.3915378451921515, gHam: 0.4852391767908613, gGlu: -0.10035090820316454, gHfl: 0.569650186352733, loffHfl: 0.8114769285381864, gHamHfl: -0.4421370842207699, loffHam: 1.0784383769451031, kLean: 0.5735454995462904, prepVas: -0.030691654897928, prepTa: 0.07244194622463052 },
  },
  {
    terrain: "level",
    speed: 1,
    reflexes: { gSol: 1.2682390591787203, gTa: 2.0674889378368815, loffTa: 0.7739580735065128, gSolTa: 0.3875816857610371, gGas: 0.8463958039778219, s0Vas: 0.03339028427648027, gVas: 1.7236248257221836, kPhi: 0.280955358876098, phiKneeOff: 2.9611318853067927, s0Bal: -0.03408129742354142, kp: 2.30893456690646, kd: 0.33345371792690665, thetaRef: -0.02940859000051424, kbw: 1.4079065111727995, deltaS: 0.4376650128774254, gHam: 0.6850363133429205, gGlu: 0.05392375606343743, gHfl: 0.5773705651538822, loffHfl: 0.8903357776626701, gHamHfl: 1.232776721019183, loffHam: 0.7329146336883677, kLean: 0.7658395504997372, prepVas: 0.009619445699083153, prepTa: -0.015445508168755229 },
  },
  {
    terrain: "level",
    speed: 1.3,
    reflexes: { gSol: 1.2802427324167234, gTa: 1.5398234823166734, loffTa: 1.0057962746679574, gSolTa: 0.3957659208762493, gGas: 0.4288332475306461, s0Vas: 0.038417070367404584, gVas: 1.5693505290214402, kPhi: 2.3352850362184276, phiKneeOff: 4.878153145248428, s0Bal: -0.010712583710972653, kp: 2.2749971896706374, kd: 0.30969760463649054, thetaRef: -0.06989079346023577, kbw: 0.7516434477298792, deltaS: 0.452425755394309, gHam: 0.8299032901564024, gGlu: -0.1296477179374846, gHfl: 0.4507094162506956, loffHfl: 0.7077998631704667, gHamHfl: 0.6112149896878425, loffHam: 1.029396986718931, kLean: 1.2362565304725597, prepVas: -0.09223836830474176, prepTa: -0.12917638994885508 },
  },
  {
    terrain: "level",
    speed: 1.6,
    reflexes: { gSol: 1.2359816344444772, gTa: 1.12111739669052, loffTa: 0.9195584138025598, gSolTa: 0.39117535494114797, gGas: 1.1100238013175905, s0Vas: 0.08918093634144157, gVas: 1.4324496359644434, kPhi: 1.3422983203326369, phiKneeOff: 4.356934194037564, s0Bal: 0.0028279975610149555, kp: 2.0930279793928723, kd: 0.3368303878531132, thetaRef: 0.11711767384079932, kbw: 2.0338985592988608, deltaS: 0.5160788089269478, gHam: 0.6619855731375657, gGlu: -0.04730855074861587, gHfl: 0.6882653835989985, loffHfl: 0.5766159676790904, gHamHfl: -0.45117731671127936, loffHam: 0.9945061379303646, kLean: 1.178525079312264, prepVas: -0.018961634364544587, prepTa: 0.007578508288127422 },
  },
  {
    terrain: "level",
    speed: 1.9,
    reflexes: { gSol: 1.3283772207131261, gTa: 1.048728160025195, loffTa: 0.9266209736298848, gSolTa: 0.3642982355211786, gGas: 1.2478535870367014, s0Vas: 0.167408596547698, gVas: 1.2178099569329643, kPhi: 1.6866549357448366, phiKneeOff: 5.750004459992848, s0Bal: -0.09818014524586796, kp: 2.8369674432372065, kd: 0.41915925593611164, thetaRef: 0.15273816376634697, kbw: 1.161103607668344, deltaS: 0.7029499378017512, gHam: 0.6117989418759435, gGlu: 0.23050841731276195, gHfl: 0.8284577287976326, loffHfl: 0.5071807310774947, gHamHfl: 0.39098099005976783, loffHam: 0.7185144750918564, kLean: 1.4540689139739147, prepVas: -0.24916461831420755, prepTa: 0.02061499839234933 },
  },
  {
    terrain: "level",
    speed: 2.2,
    reflexes: { gSol: 1.220665152162733, gTa: 1.1094818010218803, loffTa: 0.9300180962430885, gSolTa: 0.5708669269230139, gGas: 1.4282118688581833, s0Vas: 0.26245805126228294, gVas: 0.6663268564906086, kPhi: 0.8156457067738332, phiKneeOff: 4.731912470893429, s0Bal: 0.07106379879219715, kp: 0.5350420321446538, kd: 0.502017807593151, thetaRef: 0.09079277654960707, kbw: 1.2408237598072447, deltaS: 0.7774761843943463, gHam: 0.3624490589027218, gGlu: 0.16919835229845515, gHfl: 0.7057752278724123, loffHfl: 0.6471826147128151, gHamHfl: 0.5106292648480714, loffHam: 1.5936265909885765, kLean: 1.1930858499765238, prepVas: -0.07791917793142054, prepTa: -0.03628660752300136 },
  },
  {
    terrain: "uphill",
    speed: 1.1,
    reflexes: { gSol: 1.2723501143432188, gTa: 1.0270168279463863, loffTa: 0.792578583295895, gSolTa: 0.4080705717834745, gGas: 0.09200931566156445, s0Vas: 0.061752623825102174, gVas: 1.349996445246125, kPhi: 2.2617890869204276, phiKneeOff: 3.991947342791278, s0Bal: -0.031568098147672356, kp: 2.1880396862570537, kd: 0.36204184042508114, thetaRef: 0.08770451962218062, kbw: 1.6076297215325812, deltaS: 0.5429317565649738, gHam: 0.5506761731722765, gGlu: -0.022787775658127833, gHfl: 0.5904884229134478, loffHfl: 0.7813075648364175, gHamHfl: 0.5664484794867362, loffHam: 1.0594978793688972, kLean: 1.783512800984943, prepVas: -0.1716379430032008, prepTa: -0.07973037949007705 },
  },
  {
    terrain: "downhill",
    speed: 1.3,
    reflexes: { gSol: 1.0685110483239941, gTa: 1.3145061881702687, loffTa: 0.9660970747285231, gSolTa: 0.2914407319297571, gGas: 0.47302750885306455, s0Vas: 0.029787172008257236, gVas: 1.6320912403435934, kPhi: 0.9020031791253018, phiKneeOff: 3.858984176406586, s0Bal: -0.02836566873861858, kp: 1.6758649905077843, kd: 0.3050861982871969, thetaRef: -0.07380262133807969, kbw: 1.0884044426259698, deltaS: 0.43416306959265516, gHam: 0.7793285339149832, gGlu: 0.06801178044276972, gHfl: 0.5582993051689744, loffHfl: 0.7260937388161085, gHamHfl: 1.2286825051446786, loffHam: 0.8079717491924386, kLean: 1.3792829098069546, prepVas: -0.057070888807112675, prepTa: -0.0684502600440973 },
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
