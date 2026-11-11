/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { RuneAction, RuneLabel, RuneView, type RuneActionProps, type RuneViewProps } from "@jgengine/core/ui/rune/primitives.view";
import { registerNativeRuneFont } from "@jgengine/core/ui/rune/nativeSurface.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { bind, type RuneTheme } from "@jgengine/core/ui/rune/primitives";
import type { RuneElementProps } from "@jgengine/core/ui/rune/element";

import { FERN_FONTS } from "../../art/look";

for (const face of [FERN_FONTS.display, FERN_FONTS.body]) registerNativeRuneFont(resolveAssetBaseUrl(face.src));

/** The shallows-teal holo look: Oswald headings over Source Sans 3. */
export const CYAN = "#5cc8dc", TEAL = "#3fd0c9", INK = "#e8f1f2", DIM = "#9fb9bd", HEAD = "#8fd3e2";
export const GOOD = "#9ef08a", BAD = "#ff8a7a", GOLD = "#e7c84a", PURPLE = "#b07ee0", GREEN = "#34ff6a";
export const DISPLAY = FERN_FONTS.display.family, BODY = FERN_FONTS.body.family;
export const FULL = { fraction: 1 } as const;

export const fernTheme = {
  colors: { accent: TEAL, ink: INK, muted: DIM, good: GOOD, bad: BAD, track: "#00000099" },
  text: {
    body: { family: BODY, size: 14, color: INK },
    small: { family: BODY, size: 12, color: DIM },
    label: { family: DISPLAY, size: 12, weight: 600, tracking: 1.6, color: HEAD },
    heading: { family: DISPLAY, size: 22, weight: 600, tracking: 0.6, color: INK },
  },
  variants: {
    panel: { padding: 12, gap: 8, fill: "#16232aee", gradient: { angle: 180, stops: [[0, "#1d2a2fee"], [1, "#121a1ef2"]] }, border: { width: 1, color: "#6fb7c955" }, radius: 6 },
    action: { minHeight: 32, padding: [6, 12, 6, 12], fill: "#1f3a40", border: { width: 1, color: "#6fb7c966" }, radius: 4, hover: "#ffffff1c", press: "#00000030", items: "center", justify: "center" },
    picked: { minHeight: 32, padding: [6, 12, 6, 12], fill: "#2f7d8f", border: { width: 1, color: "#8fe3f2" }, radius: 4, hover: "#ffffff1c", press: "#00000030", items: "center", justify: "center" },
    primary: { minHeight: 40, padding: [8, 22, 8, 22], fill: TEAL, border: { width: 1, color: "#a8f3ef" }, radius: 4, hover: "#ffffff30", press: "#00000030", items: "center", justify: "center" },
    cell: { fill: "#0d1a1fcc", border: { width: 1, color: "#6fb7c944" }, radius: 5, hover: "#ffffff18", press: "#00000030", items: "center", justify: "center" },
  },
  motion: { duration: 140, distance: 10, bounce: 0 },
} satisfies RuneTheme;

/** Text bound or plain: `text` takes a string or a `bind(() => …)`. */
export function Text({ text, ...props }: RuneElementProps) {
  return <RuneLabel {...props} {...(text === undefined ? {} : { value: text })} />;
}
export function Tag(props: RuneElementProps) {
  return <Text {...fernTheme.text.label} {...props} />;
}
export function Small(props: RuneElementProps) {
  return <Text {...fernTheme.text.small} {...props} />;
}
export function Heading(props: RuneElementProps) {
  return <Text {...fernTheme.text.heading} {...props} />;
}
export function Row(props: RuneViewProps) {
  return <RuneView layout="row" gap={8} items="center" {...props} />;
}
export function Panel(props: RuneViewProps) {
  return <RuneView variant="panel" {...props} />;
}
/** A button: `picked` lights it as the current choice, `primary` is the screen's main verb. */
export function Button({ picked, primary, ...props }: RuneActionProps & { picked?: boolean; primary?: boolean }) {
  return <RuneAction variant={primary ? "primary" : picked ? "picked" : "action"} color={primary ? "#062a2a" : INK} weight={600} {...props} />;
}

/** A label above a filled track, the value bound at its leaves. */
export function Meter({ label, value, max, color, width }: { label: string | (() => string); value: () => number; max: () => number; color: string; width?: number }): ReactNode {
  return (
    <RuneView gap={2} {...(width === undefined ? {} : { width })}>
      <Row justify="between">
        <Small color={INK} text={typeof label === "string" ? label : bind(label)} />
        <Small color={INK} text={bind(() => `${Math.floor(value())} / ${Math.round(max())}`)} />
      </Row>
      <RuneView height={7} width={FULL} fill="#00000099" radius={4} clip>
        <RuneView height={7} fill={color} width={bind(() => ({ fraction: max() > 0 ? Math.max(0, Math.min(1, value() / max())) : 0 }))} />
      </RuneView>
    </RuneView>
  );
}

/** A full-screen dim with a centred column that scrolls when the viewport is short. */
export function Overlay({ children, onBack, fill = "#000000aa" }: { children: ReactNode; onBack?: () => void; fill?: string }): ReactNode {
  const { height } = useRuneViewport();
  return (
    <RuneView anchor="fill" fill={fill} {...(onBack === undefined ? {} : { onBack })}>
      <RuneView anchor="center" maxHeight={height - 16} scroll gap={10} items="center" padding={8}>
        {children}
      </RuneView>
    </RuneView>
  );
}
