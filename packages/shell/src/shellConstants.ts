/** No action names are reserved when no camera rig is active (hud/none presentation): games may bind `turnLeft`/`interact`/etc. as their own. */
export const EMPTY_RESERVED: ReadonlySet<string> = new Set();

/** Empty action list — published while the orientation gate is up to suppress all held input without touching the tracker. */
export const NO_ACTIONS: string[] = [];
