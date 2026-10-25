/** One-line build instruction for the build bar, so a new player knows the next click. */
export function buildPrompt(hasSelection: boolean, affordable: boolean): string {
  if (!hasSelection) return "Pick a tower to build";
  return affordable ? "Click a foundation ring" : "Need more gold";
}
