/** Movement action names the shell drives via the walk controller. */
export const SHELL_MOVEMENT_ACTIONS = ["moveForward", "moveBack", "moveLeft", "moveRight", "jump"] as const;

/**
 * Default keyboard codes for the shell walk controller (WASD + Space).
 * Use as the base of `defineGame({ input: { ...DEFAULT_WALK_CODES, interact: ["KeyE"] } })`
 * instead of re-typing the same five bindings in every game.
 *
 * @capability default-walk-codes stock WASD + jump key codes for the shell walk controller
 */
export const DEFAULT_WALK_CODES = {
  moveForward: ["KeyW"],
  moveBack: ["KeyS"],
  moveLeft: ["KeyA"],
  moveRight: ["KeyD"],
  jump: ["Space"],
} as const satisfies Record<(typeof SHELL_MOVEMENT_ACTIONS)[number], readonly string[]>;

/**
 * True when the game's input map binds any walk-controller action — the shell owns pose
 * for those games. Games that omit all five drive pose themselves.
 * @internal
 */
export function shellDrivesPlayerPose(input: Record<string, unknown> | undefined): boolean {
  const bound = input ?? {};
  return SHELL_MOVEMENT_ACTIONS.some((action) => action in bound);
}
