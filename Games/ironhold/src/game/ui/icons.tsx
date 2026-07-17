import { ICON_SVG } from "./iconData";

/**
 * A crisp vector glyph from the collected game-icons.net set (CC BY 3.0 — credited in CREDITS.md).
 * Colour comes from the CSS `color` of the wrapper (the paths are `fill="currentColor"`), so a slot
 * tints its icon gold, blue-when-active, or dim-when-locked with a single text-colour class.
 */
export function Icon({ name, className }: { name: string; className?: string }) {
  const inner = ICON_SVG[name];
  if (inner === undefined) return null;
  return (
    <svg viewBox="0 0 512 512" className={className} role="presentation" aria-hidden dangerouslySetInnerHTML={{ __html: inner }} />
  );
}
