import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

/** RTS command-card bindings, laid out to match the console grid (Q W E R · A S D F · Z X C V). No
 * movement actions are bound — there is no avatar; the "rts" camera rig owns WASD/arrow panning,
 * edge-scroll, and zoom. */
export const keybinds: ActionCodesMap = {
  // Recruit
  trainPeasant: ["KeyQ"],
  trainFootman: ["KeyW"],
  trainRifleman: ["KeyE"],
  attackMove: ["KeyR"],
  // Construct
  buildBarracks: ["KeyA"],
  buildFarm: ["KeyS"],
  buildTower: ["KeyD"],
  // Powers
  researchWeapons: ["KeyZ"],
  researchArmor: ["KeyX"],
  heroAbility: ["KeyC"],
};
