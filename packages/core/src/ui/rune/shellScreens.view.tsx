/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";

import type { RuneTheme } from "./primitives";
import { RuneAction, RuneGlyph, RuneLabel, RuneRoot, RuneView } from "./primitives.view";

/**
 * The engine's own screens — joining a world, a view that failed, a lost display, turning the device —
 * drawn on Rune like every game screen. One quiet look, so they read as the engine speaking, not a game.
 */
export const shellScreenTheme = {
  colors: { scrim: "#08151deb", panel: "#102735", edge: "#35616b", text: "#e9f6ee", dim: "#c3d9dd", accent: "#8ce0c2", ink: "#082b22" },
  text: {
    body: { size: 15, color: "#c3d9dd" },
    title: { size: 22, weight: 650, color: "#e9f6ee" },
    button: { size: 15, weight: 650, color: "#082b22" },
    mono: { size: 12, mono: true, color: "#c3d9dd" },
  },
  variants: {
    panel: { padding: 28, gap: 14, fill: "#102735", border: { width: 1, color: "#35616b" }, radius: 16, shadow: { y: 20, blur: 60, color: "#00000066" } },
    primary: { minHeight: 42, padding: [10, 18, 10, 18], fill: "#8ce0c2", border: { width: 1, color: "#8ce0c2" }, radius: 8, hover: "#ffffff22", press: "#00000022", items: "center", justify: "center" },
    quiet: { minHeight: 36, padding: [8, 14, 8, 14], border: { width: 1, color: "#35616b" }, radius: 8, hover: "#ffffff14", press: "#00000022", items: "center", justify: "center" },
  },
  motion: { duration: 140, distance: 8, bounce: 0 },
} satisfies RuneTheme;

/** One action on a shell screen. @internal */
export interface ShellScreenAction {
  label: string;
  run: () => void;
}

/**
 * A full-screen engine message: a title, a line of explanation, optional technical text and up to two
 * actions. It takes the pointer and keys while it shows, so nothing reaches the game beneath.
 * @internal
 */
export function ShellScreen({ title, body, detail, primary, secondary, glyph, scrim = true }: {
  title: string;
  body: string;
  detail?: string | undefined;
  primary?: ShellScreenAction | undefined;
  secondary?: ShellScreenAction | undefined;
  glyph?: string | undefined;
  scrim?: boolean | undefined;
}): ReactNode {
  return (
    <RuneRoot theme={shellScreenTheme}>
      <RuneView anchor="fill" modal {...(scrim ? { fill: shellScreenTheme.colors.scrim } : {})} />
      <RuneView anchor="center" safe inset={24} variant="panel" maxWidth={480} items="start">
        {glyph === undefined ? null : <RuneGlyph artwork={glyph} width={96} height={96} />}
        <RuneLabel textStyle="title" value={title} />
        <RuneLabel value={body} />
        {detail === undefined ? null : <RuneView maxHeight={160} scroll><RuneLabel textStyle="mono" value={detail} /></RuneView>}
        {primary === undefined && secondary === undefined ? null : (
          <RuneView layout="row" gap={10}>
            {primary === undefined ? null : <RuneAction variant="primary" label={primary.label} run={primary.run}><RuneLabel textStyle="button" value={primary.label} /></RuneAction>}
            {secondary === undefined ? null : <RuneAction variant="quiet" label={secondary.label} run={secondary.run}><RuneLabel value={secondary.label} /></RuneAction>}
          </RuneView>
        )}
      </RuneView>
    </RuneRoot>
  );
}
