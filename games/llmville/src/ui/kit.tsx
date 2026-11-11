/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo, type ReactNode } from "@jgengine/core/ui/jsx";
import { bind } from "@jgengine/core/ui/rune/primitives";
import {
  RuneAction,
  RuneField,
  RuneGlyph,
  RuneLabel,
  RuneRoot,
  RuneTransient,
  RuneView,
  type RuneFieldProps,
  type RuneProjection,
  type RuneViewProps,
} from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import type { RuneElementProps } from "@jgengine/core/ui/rune/element";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { actionNotices } from "../runtime/actionFeedback";
import { SITE_TAGLINE } from "../seo/siteSeo";
import { C, DISPLAY, FULL, llmvilleTheme, registerLlmvilleFonts } from "./theme";
import { iconArtwork, MASCOT_ARTWORK, type IconName } from "./icons";

export { C, FULL } from "./theme";

// --- text --------------------------------------------------------------------------------------

export function Text({ text, ...props }: RuneElementProps) {
  return <RuneLabel {...props} {...(text === undefined ? {} : { value: text })} />;
}
export function Label(props: RuneElementProps) { return <Text {...llmvilleTheme.text.label} {...props} />; }
export function Heading(props: RuneElementProps) { return <Text {...llmvilleTheme.text.heading} {...props} />; }
export function Muted(props: RuneElementProps) { return <Text size={13} color={C.muted} {...props} />; }
export function ErrorText(props: RuneElementProps) { return <Text size={13} color={C.error} role="alert" {...props} />; }

// --- layout --------------------------------------------------------------------------------------

export function Row(props: RuneViewProps) { return <RuneView layout="row" gap={8} items="center" {...props} />; }
export function Stack(props: RuneViewProps) { return <RuneView gap={10} {...props} />; }

export type PanelShell = "panel" | "terminal" | "inset" | "sticky" | "toast";
export function Panel({ shell = "panel", ...props }: RuneViewProps & { shell?: PanelShell }) {
  return <RuneView variant={shell} {...props} />;
}

/** Phones get the folded layouts: a narrow screen, in either orientation. */
export function useCompact(): boolean {
  return useRuneViewport().width < 640;
}

// --- marks --------------------------------------------------------------------------------------

export function Icon({ name, size = 18, color, strokeWidth }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return <RuneGlyph artwork={iconArtwork(name, strokeWidth)} size={size} {...(color === undefined ? {} : { color })} />;
}

export function Mascot({ size = 40, color = C.cream }: { size?: number; color?: string }) {
  return <RuneGlyph artwork={MASCOT_ARTWORK} size={size} color={color} label="LLMville" />;
}

const WORDMARK = { sm: 26, md: 40, lg: 64, xl: 80 } as const;
const MARK = { sm: 28, md: 40, lg: 64, xl: 80 } as const;
/** The logo lockup: mascot mark and wordmark, stacked for heroes, inline for chrome. */
export function Logo({ stacked = false, size = "md", tagline = false }: { stacked?: boolean; size?: keyof typeof WORDMARK; tagline?: boolean }) {
  const compact = useCompact();
  const scale = compact && (size === "lg" || size === "xl") ? 0.75 : 1;
  return <RuneView layout={stacked ? "stack" : "row"} items="center" gap={stacked ? 10 : 12}>
    <Mascot size={Math.round(MARK[size] * scale)} />
    <RuneView items={stacked ? "center" : "start"} gap={4}>
      <Text family={DISPLAY} weight={800} size={Math.round(WORDMARK[size] * scale)} color={C.cream}>LLMville</Text>
      {tagline ? <Muted size={13}>{SITE_TAGLINE}</Muted> : null}
    </RuneView>
  </RuneView>;
}

// --- actions -------------------------------------------------------------------------------------

export type ButtonTone = "primary" | "secondary" | "ghost" | "danger" | "link" | "chip";
const BUTTON_INK: Record<ButtonTone, string> = { primary: C.ink, secondary: C.cream, ghost: C.cream, danger: C.coral, link: C.teal, chip: C.cream };

/**
 * One LLMville action. `busy` swaps the label for a spinner line and disables it, the way every
 * menu button shows a request in flight.
 */
export function Button({ tone = "secondary", icon, busy, busyLabel, onPress, children, disabled, label, ...props }: Omit<RuneViewProps, "children"> & {
  tone?: ButtonTone; icon?: IconName; busy?: boolean; busyLabel?: string; onPress?: () => void; children?: ReactNode; disabled?: boolean; label?: string;
}) {
  const ink = BUTTON_INK[tone];
  const text = typeof children === "string" ? children : undefined;
  return <RuneAction variant={tone} layout="row" color={ink} disabled={disabled === true || busy === true}
    {...(label ?? text ?? busyLabel) === undefined ? {} : { label: label ?? text ?? busyLabel }}
    {...props} {...(onPress === undefined ? {} : { run: onPress })}>
    {busy === true ? <><Icon name="spinner" size={16} color={ink} /><Text weight={800} color={ink}>{busyLabel ?? text ?? "Working…"}</Text></> : <>
      {icon === undefined ? null : <Icon name={icon} size={16} color={ink} />}
      {text === undefined ? children : <Text weight={800} size={tone === "chip" ? 12 : 15} color={ink}>{text}</Text>}
    </>}
  </RuneAction>;
}

/** A labelled native text field. */
export function Field({ label, error, ...props }: RuneFieldProps & { label?: string; error?: string | null }) {
  return <RuneView gap={6} width={FULL}>
    {label === undefined ? null : <Label>{label}</Label>}
    <RuneField variant="field" family="Nunito" size={15} width={FULL} {...(label === undefined ? {} : { label })} {...props} />
    {error === undefined || error === null || error === "" ? null : <ErrorText>{error}</ErrorText>}
  </RuneView>;
}

// --- progress ------------------------------------------------------------------------------------

/**
 * A boot bar. A known `progress` (0..1, bound at the leaf) fills it; without one a third-width sweep
 * crosses it. The sweep reads the clock while the loading screen is up.
 */
export function ProgressBar({ progress, width = 240 }: { progress?: () => number | undefined; width?: number }) {
  const sweep = useMemo(() => { const start = performance.now(); return () => ((performance.now() - start) / 1400) % 1; }, []);
  const fraction = () => { const value = progress?.(); return value === undefined ? undefined : Math.max(0, Math.min(1, value)); };
  return <RuneView width={width} height={6} radius={3} fill={C.line} clip>
    <RuneView height={6} radius={3} fill={C.teal}
      width={bind(() => { const known = fraction(); return known === undefined ? width / 3 : known * width; })}
      x={bind(() => fraction() === undefined ? (sweep() * 1.33 - 0.33) * width : 0)} />
  </RuneView>;
}

// --- surfaces ------------------------------------------------------------------------------------

/** The warm ink backdrop behind LLMville's menu pages: amber glow up top, teal floor light. */
export function Backdrop() {
  return <RuneView anchor="fill" fill={C.ink}
    radial={{ center: [0.5, -0.1], radius: [1.2, 0.9], stops: [[0, "#e0a95c40"], [0.5, "#e0a95c00"]] }}>
    <RuneView anchor="fill" radial={{ center: [0.5, 1.2], radius: [1, 1], stops: [[0, "#22332f"], [0.7, "#16201e00"]] }} />
  </RuneView>;
}

/** A full-screen page on the backdrop: centred content, or a scrolling column. */
export function Page({ centered = true, children, maxWidth = 460 }: { centered?: boolean; children: ReactNode; maxWidth?: number }) {
  const { width, height } = useRuneViewport();
  return <RuneView anchor="fill">
    <Backdrop />
    <RuneView anchor={centered ? "center" : "top"} safe width={Math.min(maxWidth, width - 32)} maxHeight={height - 32} scroll>
      <RuneView width={FULL} gap={16} padding={[16, 0, 16, 0]}>{children}</RuneView>
    </RuneView>
  </RuneView>;
}

/** A dimmed modal sheet: title row with a close action, scrolling body. Back closes it. */
export function Sheet({ title, close, children, width: preferred = 640, height: tall }: { title: string; close: () => void; children: ReactNode; width?: number; height?: number }) {
  const { width, height } = useRuneViewport();
  const boxHeight = Math.min(tall ?? 720, height - 24);
  return <RuneView anchor="fill" fill={C.scrim} modal onBack={close}>
    <Panel anchor="center" shell="terminal" width={Math.min(preferred, width - 24)} maxHeight={boxHeight} role="dialog" label={title} padding={0} gap={0}>
      <Row justify="between" padding={[14, 16, 14, 20]}>
        <Heading size={20}>{title}</Heading>
        <Button tone="ghost" label={`Close ${title.toLowerCase()}`} onPress={close}><Icon name="close" size={14} /></Button>
      </Row>
      <RuneView height={1} fill={C.line} width={FULL} />
      <RuneView scroll maxHeight={boxHeight - 70} padding={[14, 16, 18, 16]} gap={12}>{children}</RuneView>
    </Panel>
  </RuneView>;
}

/** Action results and denials from `actionNotices`, each its own small toast. */
export function Notices() {
  const source = useMemo(() => ({ read: actionNotices.list, subscribe: actionNotices.subscribe }), []);
  return <RuneView anchor="top" safe inset={16} gap={6} items="center">
    <RuneTransient source={source} expire={actionNotices.prune}>{(notice) =>
      <Panel shell="toast" padding={[8, 14, 8, 14]} maxWidth={360}>
        <Text size={13} weight={700} color={notice.tone === "deny" ? C.error : C.cream}>{notice.text}</Text>
      </Panel>}
    </RuneTransient>
  </RuneView>;
}

/**
 * LLMville's one native surface: its theme and fonts, the action notices above everything, and
 * the world projection when the 3D view is up.
 */
export function LlmRoot({ children, context, project }: { children: ReactNode; context?: GameContext | undefined; project?: RuneProjection | undefined }) {
  registerLlmvilleFonts();
  return <RuneRoot theme={llmvilleTheme} {...(context === undefined ? {} : { context })} {...(project === undefined ? {} : { project })}>
    {children}
    <Notices />
  </RuneRoot>;
}
