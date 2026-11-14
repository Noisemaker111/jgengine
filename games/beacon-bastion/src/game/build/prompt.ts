/** One-line build instruction for the build bar, so a new player knows the next click. */
export function buildPrompt(hasSelection: boolean, affordable: boolean): string {
  if (!hasSelection) return "Pick a worker to hire";
  return affordable ? "Click an open plot on the sidewalk" : "Need more cash";
}
