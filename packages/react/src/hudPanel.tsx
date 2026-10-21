import { HudSurface, type HudSurfaceElevation, type HudSurfaceProps } from "./hudSurface";

/**
 * Old name of {@link HudSurfaceElevation} (`@jgengine/react/hudSurface`).
 * @deprecated Use `HudSurfaceElevation`; this alias goes in the next release.
 */
export type HudPanelElevation = HudSurfaceElevation;

/**
 * Old name of {@link HudSurfaceProps} (`@jgengine/react/hudSurface`).
 * @deprecated Use `HudSurfaceProps`; this alias goes in the next release.
 */
export type HudPanelProps = HudSurfaceProps;

/**
 * Old name of the themed frame {@link HudSurface} (`@jgengine/react/hudSurface`), renamed so it no longer
 * shares a name with the `HudCanvas` layout slot `HudPanel`.
 * @deprecated Use `HudSurface`; this alias goes in the next release.
 */
export const HudPanel = HudSurface;
