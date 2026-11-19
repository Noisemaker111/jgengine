export type MobileOrientationRule =
  | "any"
  | "portrait"
  | "landscape"
  | "portrait-required"
  | "landscape-required"
  | "unsupported";

export interface GameOrientationConfig {
  mobile?: MobileOrientationRule;
}

/**
 * The `orientation` field of a game definition. Legacy shorthand `"landscape"`
 * / `"portrait"` stays advisory (a dismissible rotate hint, never a gate). The
 * object form `{ mobile: "landscape-required" }` is the strict contract that
 * blocks gameplay behind the rotate screen until the device is turned.
 */
export type GameOrientation = "landscape" | "portrait" | GameOrientationConfig;

export type LayoutOrientation = "portrait" | "landscape";

export interface OrientationRequirement {
  supported: boolean;
  required: LayoutOrientation | null;
  preferred: LayoutOrientation | null;
}

export function resolveMobileOrientationRule(orientation: GameOrientation | undefined): MobileOrientationRule {
  if (orientation === undefined) return "any";
  if (orientation === "landscape") return "landscape";
  if (orientation === "portrait") return "portrait";
  return orientation.mobile ?? "any";
}

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

export function orientationGateActive(
  requirement: OrientationRequirement,
  liveOrientation: LayoutOrientation,
): boolean {
  if (!requirement.supported) return true;
  return requirement.required !== null && requirement.required !== liveOrientation;
}

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
