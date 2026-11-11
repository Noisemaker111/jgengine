/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { Backdrop, C, Mascot, Muted, ProgressBar, Text } from "../ui/kit";

interface RouteLoadingScreenProps {
  label?: string;
  /** Secondary line shown under the primary label (boot step detail). */
  detail?: string;
  /** When true, covers the screen above the page it opens over (a modal layer). */
  overlay?: boolean;
  /**
   * 0..1 boot progress. When provided the bar fills with it; when omitted it sweeps. Honest by
   * construction: pass a real fraction only when you actually know it.
   */
  progress?: number;
}

/** The mascot over a boot bar, with what is loading. */
export function RouteLoadingScreen({ label = "Loading", detail, overlay = false, progress }: RouteLoadingScreenProps) {
  return <RuneView anchor="fill" {...(overlay ? { modal: true } : {})} label={label}>
    <Backdrop />
    <RuneView anchor="center" width={280} items="center" gap={20}>
      <Mascot size={64} />
      <ProgressBar width={280} {...(progress === undefined ? {} : { progress: () => progress })} />
      <RuneView items="center" gap={4}>
        <Text size={14} weight={600} color={C.muted}>{label}</Text>
        {detail === undefined || detail === "" ? null : <Muted size={12} align="center" color={C.faint}>{detail}</Muted>}
      </RuneView>
    </RuneView>
  </RuneView>;
}
