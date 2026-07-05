/**
 * Movement core (pure model).
 *
 * This module owns the raw key model, the pure translation from held keys
 * into a frame-independent {@link MovementIntent}, and the kinematics
 * integration. Keeping it framework-free means the kinematics controller,
 * the keyboard handler and the on-screen touch D-pad all speak the same
 * vocabulary, and the translation is unit testable without a renderer.
 * DOM capture, pointer lock, and the per-frame look channel live in
 * movementInput.ts.
 */
export type MovementKey = "w" | "a" | "s" | "d" | "shift" | "control" | "c" | "space";
export type MovementKeysState = Record<MovementKey, boolean>;
export declare function createEmptyMovementKeys(): MovementKeysState;
/**
 * Frame-independent description of what the player is asking the avatar to do.
 * `forward`/`right` are in the range -1..1 in the avatar's local frame; the
 * controller rotates them into world space against the camera each frame.
 */
export interface MovementIntent {
    forward: number;
    right: number;
    crouching: boolean;
    running: boolean;
    jumping: boolean;
    /** True when there is any directional input this frame. */
    moving: boolean;
}
/**
 * Translate the set of held keys into an intent. When `canMove` is false (a
 * menu is open, the world is paused) the avatar is fully idle so it never
 * drifts behind an overlay.
 */
export declare function resolveMovementIntent(keys: MovementKeysState, canMove: boolean): MovementIntent;
/**
 * Kinematics + feel tuning for the first-person controller. Centralised here so
 * movement feel lives in one place rather than scattered through the renderer.
 */
export declare const MOVEMENT_TUNING: {
    readonly standEyeHeight: 1.7;
    readonly crouchEyeHeight: 1.15;
    readonly walkSpeedMultiplier: 1.75;
    readonly runSpeedMultiplier: 2.25;
    readonly crouchSpeedMultiplier: 0.45;
    readonly groundAcceleration: 26;
    readonly airAcceleration: 12;
    readonly groundFriction: 18;
    readonly jumpVelocity: 7.1;
    readonly gravityAcceleration: 24;
    readonly cameraTrackingSpeed: 24;
    readonly crouchTransitionSpeed: 14;
    readonly crouchBobRate: 0.5;
    readonly walkBobRate: 1.5;
    readonly runBobRate: 2.5;
    readonly crouchBobAmplitude: 0.02;
    readonly walkBobAmplitude: 0.045;
    readonly runBobAmplitude: 0.06;
    /** Below this horizontal speed the avatar is treated as standing still. */
    readonly movingSpeedThreshold: 0.2;
    /** Largest physics step we integrate so a stalled tab can't teleport the player. */
    readonly maxFrameSeconds: 0.05;
};
/**
 * Mutable kinematic state carried between frames by the controller. Kept here so
 * the velocity / jump / gravity integration is a pure function testable without
 * a renderer — the controller just owns the ref.
 */
export interface PlayerMotionState {
    horizontalVelocityX: number;
    horizontalVelocityZ: number;
    verticalVelocity: number;
    jumpOffset: number;
    grounded: boolean;
    jumpHeld: boolean;
}
export declare function createPlayerMotionState(): PlayerMotionState;
/** Horizontal step (world units) the avatar should commit this frame. */
export interface MovementFrameStep {
    stepX: number;
    stepZ: number;
}
/**
 * Advance one frame of avatar kinematics. Mutates `motion` (velocity, jump,
 * gravity, grounded) and returns the horizontal step to commit through the
 * collision-resolving stepper.
 *
 * `forwardX`/`forwardZ` are the camera heading projected onto the ground plane
 * (need not be normalized); the avatar's right axis is derived from it. Pulling
 * this out of the render loop is what lets us assert "held forward for N frames
 * crosses the room" in a unit test instead of only in the live game.
 */
export declare function advancePlayerMotion(motion: PlayerMotionState, intent: MovementIntent, forwardX: number, forwardZ: number, baseSpeed: number, rawDeltaSeconds: number): MovementFrameStep;
/** Peak jump height from MOVEMENT_TUNING.jumpVelocity + gravity, with small buffer. */
export declare const MAX_JUMP_OFFSET = 1.15;
/** Camera yaw looks along -Z; character mesh faces +Z at body rotation.y = 0. */
export declare function cameraYawToAvatarBodyYaw(cameraYaw: number): number;
