import {
  createContext,
  useContext,
  useEffect,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";
import type { GamepadGlyphName } from "@jgengine/core/input/gamepadModel";

import { useHudInteract } from "@jgengine/core/hud/hudInteract.view";
import { hashString } from "@jgengine/core/random/rng";
import { actionGlyph, useInputDevice } from "../../input/inputDevice.view";
import { KitFrame, type KitFrameLook } from "./kitFrame.view";
import { memoView } from "../memoView.view";
import { useLiveSelect } from "../liveBind.view";
import { isLive, type Live } from "../liveValue";
import {
  uiKitVars,
  type KitButtonProps,
  type KitMenuProps,
  type KitMeterProps,
  type KitMinimapFrameProps,
  type KitPanelProps,
  type KitPromptProps,
  type KitToastProps,
  type KitTone,
  type UiKit,
} from "./uiKit.view";
import { plainKit } from "./uiKitPlain.view";

interface UiKitContextValue {
  kit: UiKit;
  bindings: ActionCodesMap | undefined;
  glyphSet: GamepadGlyphName;
}

const UiKitContext = createContext<UiKitContextValue | null>(null);

const ActionBindingsContext = createContext<ActionCodesMap | undefined>(undefined);

/**
 * Hands the game's live input bindings (its `input` map with the player's rebinds applied) to every key
 * hint below. The shell mounts it around each game, so HUD labels follow a rebind with no game code.
 */
export function ActionBindingsProvider({ bindings, children }: { bindings: ActionCodesMap; children?: ReactNode }): ReactNode {
  return <ActionBindingsContext.Provider value={bindings}>{children}</ActionBindingsContext.Provider>;
}

/**
 * The game's live input bindings, rebinds included: feed it to `actionLabel(bindings, action)` for a key
 * hint in a list, or use {@link useActionGlyph} for one action. Empty outside a shell.
 *
 * @capability action-bindings-hook the game's live key bindings, rebinds included, for HUD key labels
 */
export function useActionBindings(): ActionCodesMap {
  const kitBindings = useContext(UiKitContext)?.bindings;
  const shellBindings = useContext(ActionBindingsContext);
  return kitBindings ?? shellBindings ?? EMPTY_BINDINGS;
}

const EMPTY_BINDINGS: ActionCodesMap = {};

const injected = new Map<Document, Set<string>>();

function cssKey(kit: UiKit): string {
  return `${kit.id}:${hashString(kit.css).toString(36)}`;
}

/** Inserts a kit's stylesheet into the document once. Safe to call repeatedly and during SSR (no-op). */
export function ensureUiKitStyles(kit: UiKit, doc: Document | undefined = typeof document === "undefined" ? undefined : document): void {
  if (doc === undefined) return;
  const key = cssKey(kit);
  const seen = injected.get(doc) ?? new Set<string>();
  injected.set(doc, seen);
  if (seen.has(key)) return;
  seen.add(key);
  const style = doc.createElement("style");
  style.setAttribute("data-jg-kit-css", key);
  style.textContent = kit.css;
  doc.head.appendChild(style);
}

/** Props for {@link UiKitRoot}. */
export interface UiKitRootProps {
  kit: UiKit;
  /** The game's input bindings, so prompts can show the bound key or pad button. */
  bindings?: ActionCodesMap;
  /** Controller family for pad glyphs. Default `xbox`. */
  glyphSet?: GamepadGlyphName;
  children?: ReactNode;
  className?: string | undefined;
  style?: CSSProperties;
  /** Render a real box instead of `display: contents`. */
  box?: boolean;
}

/**
 * Puts a UI kit in charge of everything below it: injects its stylesheet, sets its `--kit-*` tokens and
 * makes `KitButton`, `KitPanel`, `KitMeter`, `KitPrompt`, `KitToast`, `KitMenu` and `KitMinimapFrame`
 * draw in its language. The shell mounts it for `defineGame({ uiKit })`; nest another to show a second kit.
 *
 * @capability ui-kit-root one line picks a complete UI language (shapes, type, motion, sound) for every kit part below it
 */
export function UiKitRoot({ kit, bindings, glyphSet = "xbox", children, className, style, box = false }: UiKitRootProps): ReactNode {
  useInsertionEffect(() => {
    ensureUiKitStyles(kit);
  }, [kit]);
  const parent = useContext(UiKitContext);
  const shellBindings = useContext(ActionBindingsContext);
  const value = useMemo<UiKitContextValue>(
    () => ({ kit, bindings: bindings ?? parent?.bindings ?? shellBindings, glyphSet }),
    [kit, bindings, parent?.bindings, shellBindings, glyphSet],
  );
  const rootStyle = useMemo<CSSProperties>(
    () => ({ ...(box ? {} : { display: "contents" }), ...uiKitVars(kit), ...style }),
    [box, kit, style],
  );
  return (
    <UiKitContext.Provider value={value}>
      <div data-jg-kit={kit.id} className={className} style={rootStyle}>
        {children}
      </div>
    </UiKitContext.Provider>
  );
}

/**
 * Re-applies the nearest kit's root (tokens and `data-jg-kit`) — wrap content you portal outside the
 * kit root so it keeps the kit's look.
 */
export function UiKitScope({ children }: { children?: ReactNode }): ReactNode {
  const context = useContext(UiKitContext);
  if (context === null) return <>{children}</>;
  return (
    <div data-jg-kit={context.kit.id} style={{ display: "contents", ...uiKitVars(context.kit) }}>
      {children}
    </div>
  );
}

/** The kit in charge here: the nearest {@link UiKitRoot}'s, or the plain fallback kit outside one. */
export function useUiKit(): UiKit {
  return useContext(UiKitContext)?.kit ?? plainKit;
}

/**
 * The key hint for `action` on the device the player is using, from the kit root's live bindings — the
 * bound key on keyboard, the pad button on gamepad, or `fallback` when unbound. On touch it is
 * `undefined`: the button itself is the tap target. Put it on a button
 * (`<KitButton glyph={useActionGlyph("pause", "P")}>`) so key hints never go stale after a rebind.
 *
 * @capability kit-action-glyph the bound key, pad button or tap label for an action, live, for any kit part
 */
export function useActionGlyph(action: string, fallback?: string): string | undefined {
  const context = useContext(UiKitContext);
  const bindings = useActionBindings();
  const device = useInputDevice();
  if (device === "touch") return undefined;
  const glyph = actionGlyph(bindings, action, device, context?.glyphSet ?? "xbox");
  return glyph ?? fallback;
}

/** True when a {@link UiKitRoot} is above: engine screens switch to kit parts only then. */
export function useHasUiKit(): boolean {
  return useContext(UiKitContext) !== null;
}

/**
 * `--jg-*` overrides that point the engine's own screens (settings, saves, credits) at the kit's
 * tokens, so screens drawn for a dark HUD read on light kits (ink, paper, parchment) as well as dark
 * ones, in the kit's type. Spread it on the element that hosts such a screen inside a kit: `"pane"`
 * when the screen sits on a kit panel, `"dialog"` when it brings its own ground (the settings dialog).
 * @internal
 */
export function kitHudBridge(ground: "pane" | "dialog"): CSSProperties {
  return {
    "--jg-text": "var(--kit-ink)",
    "--jg-text-dim": "color-mix(in srgb, var(--kit-ink) 70%, transparent)",
    "--jg-accent": "var(--kit-accent)",
    "--jg-accent-glow": "color-mix(in srgb, var(--kit-accent) 32%, transparent)",
    "--jg-on-accent": "var(--kit-accent-ink)",
    // Accent-coloured text (section headings) darkened toward the ink, so a yellow accent reads on cream.
    "--jg-accent-text": "color-mix(in srgb, var(--kit-accent) 45%, var(--kit-ink))",
    "--jg-surface": ground === "pane" ? "var(--kit-surface-alt)" : "var(--kit-surface)",
    "--jg-surface-deep": ground === "pane" ? "color-mix(in srgb, var(--kit-ink) 8%, transparent)" : "var(--kit-surface-alt)",
    "--jg-edge": "color-mix(in srgb, var(--kit-line) 30%, transparent)",
    "--jg-edge-bright": "color-mix(in srgb, var(--kit-line) 55%, transparent)",
    "--jg-font-display": "var(--kit-font-display)",
    "--jg-font-body": "var(--kit-font-body)",
    // Save cards and name fields keep their own dark tiles, so their text stays light.
    "--jg-card-text": "#f2f6fb", "--jg-control-radius": "var(--kit-radius, 8px)", "--jg-control-font": "var(--kit-font-display)",
    color: "var(--kit-ink)",
    fontFamily: "var(--kit-font-body)",
  } as CSSProperties;
}

/** Inserts the kit's stylesheet for a part drawn outside a {@link UiKitRoot} (previews, portals). */
function useKitStyles(kit: UiKit): void {
  useInsertionEffect(() => {
    ensureUiKitStyles(kit);
  }, [kit]);
}

/**
 * Keeps something mounted through its exit motion: `leaving` turns true when `open` goes false, and
 * `mounted` turns false `exitMs` later.
 */
export function useKitPresence(open: boolean, exitMs: number): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    const timer = setTimeout(() => setMounted(false), Math.max(0, exitMs));
    return () => clearTimeout(timer);
  }, [open, exitMs]);
  return { mounted: open || mounted, leaving: !open && mounted };
}

/** A {@link KitButton} made of a material instead of drawn by the kit: every native button attribute passes through. */
export interface KitMaterialButtonProps extends KitFrameLook, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "color"> {
  type?: "button" | "submit" | "reset";
  /** UI cue name for hover and activate sounds. Default `"confirm"`. */
  cue?: string | undefined;
  ref?: Ref<HTMLButtonElement>;
}

/** Props for {@link KitButton}: the kit's button, or a material one when `material` is set. */
export type KitButtonHostProps = (KitButtonProps & { cue?: string | undefined; material?: undefined }) | KitMaterialButtonProps;

/**
 * The active kit's button. Hover, press and activate report to the nearest `HudInteractProvider`, so
 * the shell's UI cues sound without wiring. Give `material` (and optionally `cut`, `tint`, `edge`,
 * …) and it is a game button made of that material instead, lifting on hover and sinking on press:
 *
 * ```tsx
 * <KitButton material="enamel" tint="#1f6feb" cut="hex" onClick={start}>Open the park</KitButton>
 * ```
 *
 * @capability kit-button a button drawn by the active UI kit, or made of a material (steel, wood, enamel…), with UI cue sounds
 */
export const KitButton = memoView("KitButton", (props: KitButtonHostProps): ReactNode => {
  const kit = useUiKit();
  useKitStyles(kit);
  const report = useHudInteract("button", props.cue ?? (props.material === undefined ? undefined : "confirm"));
  if (props.material !== undefined) {
    const { cue: _cue, ...frame } = props;
    return <KitFrame {...frame} as="button" pressable report={report} />;
  }
  const { cue: _cue, onPointerEnter, onPointerDown, onClick, disabled, material: _material, ...rest } = props;
  const Button = kit.components.Button;
  return (
    <Button
      {...rest}
      disabled={disabled}
      onPointerEnter={(event) => {
        if (disabled !== true) report("hover");
        onPointerEnter?.(event);
      }}
      onPointerDown={(event) => {
        if (disabled !== true) report("press");
        onPointerDown?.(event);
      }}
      onClick={(event) => {
        report("activate");
        onClick?.(event);
      }}
    />
  );
});

/** A {@link KitPanel} made of a material instead of drawn by the kit; it holds its children as given. */
export interface KitMaterialPanelProps extends KitFrameLook, Omit<HTMLAttributes<HTMLElement>, "color"> {
  /** Omit for always-shown panels. `false` unmounts it. */
  open?: boolean;
  /** Landmark element. Default `div`. */
  as?: "div" | "section" | "aside" | "nav" | "header" | "span";
  ref?: Ref<HTMLElement>;
  children?: ReactNode;
}

/** Props for {@link KitPanel}: the kit panel's props plus an `open` flag that plays enter and exit motion, or a material panel. */
export type KitPanelHostProps = (KitPanelProps & { open?: boolean; material?: undefined }) | KitMaterialPanelProps;

/**
 * The active kit's panel. Give `open` to animate it in and out with the kit's own motion. Give
 * `material` (and optionally `cut`, `tint`, `edge`, `glow`, …) and it is a surface made of that
 * material instead — steel, brass, hull plate, wood, stone, paper, enamel, glass, carbon or leather —
 * so a panel reads as an object in the game's world:
 *
 * ```tsx
 * <KitPanel material="wood" cut="banner">Wave 4</KitPanel>
 * ```
 *
 * @capability kit-panel a content surface drawn by the active UI kit, or made of a material with a cut silhouette, with enter/exit motion
 */
export const KitPanel = memoView("KitPanel", (props: KitPanelHostProps): ReactNode => {
  const { open } = props;
  const kit = useUiKit();
  useKitStyles(kit);
  const presence = useKitPresence(open ?? true, props.material === undefined ? kit.motion.exitMs : 0);
  const report = useHudInteract("panel");
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open === undefined || open === wasOpen.current) return;
    wasOpen.current = open;
    report(open ? "open" : "close");
  }, [open, report]);
  if (!presence.mounted) return null;
  if (props.material !== undefined) {
    const { open: _open, ...frame } = props;
    return <KitFrame {...frame} pressable={false} report={report} />;
  }
  const { open: _open, material: _material, ...panel } = props;
  const Panel = kit.components.Panel;
  return <Panel {...panel} leaving={panel.leaving === true || presence.leaving} />;
});

/** Props for {@link KitMeter}: the kit meter's, with a value that may be {@link live} and a readout that may be worked out from it. */
export interface KitMeterHostProps extends Omit<KitMeterProps, "value" | "readout"> {
  /** The value now, or `live(() => value)` for one that moves every frame or tick. */
  value: Live<number>;
  /** `true` prints `value / max`; a node prints itself; a function prints its text for the value drawn. */
  readout?: KitMeterProps["readout"] | ((value: number, max: number) => string);
}

/** Steps a live meter value is drawn at: finer than a pixel on any meter, so a value that creeps every frame redraws the leaf only when it visibly moves. */
const LIVE_METER_STEPS = 1000;

function drawnMeter(value: number, max: number, readout: KitMeterHostProps["readout"], quantize: boolean): readonly [number, KitMeterProps["readout"]] {
  const drawn = quantize && max > 0 ? (Math.round((value / max) * LIVE_METER_STEPS) / LIVE_METER_STEPS) * max : value;
  return [drawn, typeof readout === "function" ? readout(value, max) : readout];
}

function sameDrawnMeter(previous: readonly [number, KitMeterProps["readout"]], next: readonly [number, KitMeterProps["readout"]]): boolean {
  return Object.is(previous[0], next[0]) && Object.is(previous[1], next[1]);
}

/**
 * The active kit's meter. Give `value={live(() => fuel(ctx))}` for a value that moves every frame: the
 * meter reads it each frame and redraws only itself, only when the bar or its readout visibly changes.
 *
 * @capability kit-meter a value meter (bar, segments, ring) drawn by the active UI kit, fed a plain or live value
 */
export const KitMeter = memoView("KitMeter", ({ value, readout, ...props }: KitMeterHostProps): ReactNode => {
  const kit = useUiKit();
  useKitStyles(kit);
  const max = props.max ?? 1;
  const quantize = isLive(value);
  const [drawn, text] = useLiveSelect(value, (now) => drawnMeter(now, max, readout, quantize), sameDrawnMeter);
  const Meter = kit.components.Meter;
  return <Meter {...props} value={drawn} {...(text === undefined ? {} : { readout: text })} />;
});

/** The active kit's prompt with an explicit glyph. Prefer {@link KitActionPrompt}, which picks the glyph per device. */
export const KitPrompt = memoView("KitPrompt", (props: Omit<KitPromptProps, "device"> & { device?: KitPromptProps["device"] }): ReactNode => {
  const kit = useUiKit();
  useKitStyles(kit);
  const live = useInputDevice();
  const Prompt = kit.components.Prompt;
  return <Prompt {...props} device={props.device ?? live} />;
});

/** Props for {@link KitActionPrompt}. */
export interface KitActionPromptProps {
  /** Bound action name from the game's `input` map (`"interact"`). */
  action: string;
  label: ReactNode;
  progress?: number;
  tone?: KitTone;
  /** Touch: the prompt becomes the button. Without it, touch shows nothing (the game's touch button covers it). */
  onActivate?: () => void;
  /** Glyph when the action is not bound on the device in use. */
  fallbackGlyph?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * "Press E to take the parcel", drawn by the active kit with the right glyph for the device the player
 * is using: the bound key, the bound pad button, or a tap target on touch. Renders nothing when the action
 * is not bound on that device and no `fallbackGlyph` is given.
 *
 * @capability kit-action-prompt a device-correct "press X to do Y" prompt (keyboard key, pad button, tap) in the active UI kit
 */
export const KitActionPrompt = memoView("KitActionPrompt", ({ action, label, progress, tone, onActivate, fallbackGlyph, className, style }: KitActionPromptProps): ReactNode => {
  const context = useContext(UiKitContext);
  const kit = context?.kit ?? plainKit;
  useKitStyles(kit);
  const device = useInputDevice();
  if (device === "touch" && onActivate === undefined) return null;
  const glyph = (context?.bindings === undefined ? null : actionGlyph(context.bindings, action, device, context.glyphSet)) ?? fallbackGlyph ?? null;
  if (glyph === null) return null;
  const Prompt = kit.components.Prompt;
  return <Prompt glyph={glyph} label={label} device={device} progress={progress} tone={tone} onActivate={onActivate} className={className} style={style} />;
});

/** The active kit's toast. @capability kit-toast a short message drawn by the active UI kit, with its enter/exit motion */
export const KitToast = memoView("KitToast", (props: KitToastProps): ReactNode => {
  const kit = useUiKit();
  useKitStyles(kit);
  const Toast = kit.components.Toast;
  return <Toast {...props} />;
});

/** The active kit's menu list. Navigation comes from `useMenuNav`. @capability kit-menu a verb list drawn by the active UI kit over shared menu navigation */
export const KitMenu = memoView("KitMenu", (props: KitMenuProps): ReactNode => {
  const kit = useUiKit();
  useKitStyles(kit);
  const Menu = kit.components.Menu;
  return <Menu {...props} />;
});

/** The active kit's minimap frame. @capability kit-minimap-frame a minimap or radar frame drawn by the active UI kit */
export const KitMinimapFrame = memoView("KitMinimapFrame", (props: KitMinimapFrameProps): ReactNode => {
  const kit = useUiKit();
  useKitStyles(kit);
  const MinimapFrame = kit.components.MinimapFrame;
  return <MinimapFrame {...props} />;
});
