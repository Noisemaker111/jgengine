/** @jsxImportSource @jgengine/core/ui/jsx */
import type { CSSProperties, ReactNode } from "@jgengine/core/ui/jsx";
import { useDisplayProfile } from "../ui/display.view";

/** @capability keycap styled keyboard/mouse key cap for control hints */
export function Keycap({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string | undefined;
  style?: CSSProperties;
}) {
  return (
    <kbd data-jg-kbd="" className={className} style={style}>
      {children}
    </kbd>
  );
}

/**
 * Wraps a keyboard/mouse control hint (a cap plus what it does). Renders nothing
 * on coarse-pointer devices — a touchscreen has no keyboard, so the hint is
 * noise and only fights the on-screen controls for space. The `data-jg-kbd-hint`
 * marker is also hidden by an engine stylesheet as a hydration-safe backstop, so
 * a hint stays hidden on touch even before this component's effect runs. Put the
 * touch equivalent (a `TouchControls` dock, a tappable button) on the coarse
 * branch instead.
 *
 * @capability key-hint keyboard/mouse control hint that hides itself on touch
 */
export function KeyHint({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { coarsePointer } = useDisplayProfile();
  if (coarsePointer) return null;
  return (
    <span data-jg-kbd-hint="" className={className} style={style}>
      {children}
    </span>
  );
}
