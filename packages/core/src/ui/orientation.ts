/**
 * The game-level orientation contract. A game declares how it supports phone
 * orientations; the shell resolves that against the live orientation to decide
 * whether to show a dismissible rotate hint (advisory) or a full-screen gate
 * that blocks gameplay until the device is turned (required).
 */

/** How a game supports a phone orientation on coarse-pointer displays. */
export type MobileOrientationRule =
  | "any"
  | "portrait"
  | "landscape"
  | "portrait-required"
  | "landscape-required"
  | "unsupported";

/** Object form of the `orientation` field: the strict per-platform contract. */
export interface GameOrientationConfig {
  /** Orientation contract on coarse-pointer / phone displays. Default `"any"`. */
  mobile?: MobileOrientationRule;
}

/**
 * The `orientation` field of a game definition. Legacy shorthand `"landscape"`
 * / `"portrait"` stays advisory (a dismissible rotate hint, never a gate). The
 * object form `{ mobile: "landscape-required" }` is the strict contract that
 * blocks gameplay behind the rotate screen until the device is turned.
 */
export type GameOrientation = "landscape" | "portrait" | GameOrientationConfig;

/** A concrete device orientation. */
export type LayoutOrientation = "portrait" | "landscape";

/** The resolved orientation contract for a platform: whether it's supported, gated, or merely preferred. */
export interface OrientationRequirement {
  /** False only for `"unsupported"` — the game declares it isn't built for phones. */
  supported: boolean;
  /** Orientation gameplay is hard-gated to; `null` when there is no gate. */
  required: LayoutOrientation | null;
  /** Orientation the game reads best in; drives an advisory hint when not required. */
  preferred: LayoutOrientation | null;
}

/** Normalize the `orientation` field (legacy string or object) to a single mobile rule. */
export function resolveMobileOrientationRule(orientation: GameOrientation | undefined): MobileOrientationRule {
  if (orientation === undefined) return "any";
  if (orientation === "landscape") return "landscape";
  if (orientation === "portrait") return "portrait";
  return orientation.mobile ?? "any";
}

/** Resolve the game's orientation declaration into a concrete requirement for a platform. Desktop is always unconstrained. */
export function resolveOrientationRequirement(
  orientation: GameOrientation | undefined,
  platform: "mobile" | "desktop",
): OrientationRequirement {
  if (platform === "desktop") return { supported: true, required: null, preferred: null };
  const rule = resolveMobileOrientationRule(orientation);
  switch (rule) {
    case "unsupported":
      return { supported: false, required: null, preferred: null };
    case "landscape-required":
      return { supported: true, required: "landscape", preferred: "landscape" };
    case "portrait-required":
      return { supported: true, required: "portrait", preferred: "portrait" };
    case "landscape":
      return { supported: true, required: null, preferred: "landscape" };
    case "portrait":
      return { supported: true, required: null, preferred: "portrait" };
    case "any":
      return { supported: true, required: null, preferred: null };
  }
}

/** The rotate gate blocks gameplay: a hard requirement (or `unsupported`) the live orientation doesn't satisfy. */
export function orientationGateActive(
  requirement: OrientationRequirement,
  liveOrientation: LayoutOrientation,
): boolean {
  if (!requirement.supported) return true;
  return requirement.required !== null && requirement.required !== liveOrientation;
}

/** An advisory rotate hint applies: a preference (not a hard gate) the live orientation doesn't satisfy. */
export function orientationHintActive(
  requirement: OrientationRequirement,
  liveOrientation: LayoutOrientation,
): boolean {
  return (
    requirement.supported &&
    requirement.required === null &&
    requirement.preferred !== null &&
    requirement.preferred !== liveOrientation
  );
}
