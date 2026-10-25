import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

/** RTS command-card bindings, laid out to match the console grid (1 2 3 R · B G T F · Z X C V). No
 * movement actions are bound — there is no avatar; the "rts" camera rig owns WASD/arrow panning,
 * edge-scroll, and zoom. */
export const keybinds: ActionCodesMap = {
  // Recruit
  trainPeasant: ["Digit1"],
  trainFootman: ["Digit2"],
  trainRifleman: ["Digit3"],
  attackMove: ["KeyR"],
  // Construct
  buildBarracks: ["KeyB"],
  buildFarm: ["KeyG"],
  buildTower: ["KeyT"],
  rally: ["KeyF"],
  hold: ["KeyV"],
  // Marching shape: line / wedge / column.
  formationLine: ["KeyL"],
  formationWedge: ["KeyJ"],
  formationColumn: ["KeyK"],
  // Select the whole fielded army (the keyboard half of a marquee).
  selectArmy: ["KeyH"],
  // Powers
  researchWeapons: ["KeyZ"],
  researchArmor: ["KeyX"],
  heroAbility: ["KeyC"],
  heroMuster: ["Digit4"],
  heroVolley: ["Digit5"],
  heroWard: ["Digit6"],
  // The level-up card's two options, so a pick never needs the mouse mid-battle.
  heroPickFirst: ["Digit7"],
  heroPickSecond: ["Digit8"],
};
