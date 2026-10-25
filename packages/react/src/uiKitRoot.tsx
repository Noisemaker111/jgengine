import { createContext, useContext, useEffect, useInsertionEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";
import type { GamepadGlyphName } from "@jgengine/core/input/gamepadModel";

import { useHudInteract } from "./hudInteract";
import { actionGlyph, useInputDevice } from "./inputDevice";
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
} from "./uiKit";
import { plainKit } from "./uiKitPlain";

interface UiKitContextValue {
  kit: UiKit;
  bindings: ActionCodesMap | undefined;
  glyphSet: GamepadGlyphName;
}

const UiKitContext = createContext<UiKitContextValue | null>(null);

const injected = new Map<Document, Set<string>>();

function cssKey(kit: UiKit): string {
  let hash = 5381;
  for (let index = 0; index < kit.css.length; index += 1) hash = ((hash << 5) + hash + kit.css.charCodeAt(index)) | 0;
  return `${kit.id}:${(hash >>> 0).toString(36)}`;
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
  className?: string;
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
  const value = useMemo<UiKitContextValue>(
    () => ({ kit, bindings: bindings ?? parent?.bindings, glyphSet }),
    [kit, bindings, parent?.bindings, glyphSet],
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
  const device = useInputDevice();
  if (device === "touch") return undefined;
  const glyph = context?.bindings === undefined ? null : actionGlyph(context.bindings, action, device, context.glyphSet);
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
    "--jg-card-text": "#f2f6fb",
    color: "var(--kit-ink)",
    fontFamily: "var(--kit-font-body)",
  } as CSSProperties;
}

function FallbackStyles({ kit }: { kit: UiKit }): null {
  useInsertionEffect(() => {
    ensureUiKitStyles(kit);
  }, [kit]);
  return null;
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

/**
 * The active kit's button. Hover, press and activate report to the nearest `HudInteractProvider`, so
 * the shell's UI cues sound without wiring.
 *
 * @capability kit-button a button drawn by the active UI kit, with UI cue sounds
 */
export function KitButton({ cue, onPointerEnter, onPointerDown, onClick, disabled, ...rest }: KitButtonProps & { cue?: string }): ReactNode {
  const kit = useUiKit();
  const report = useHudInteract("button", cue);
  const Button = kit.components.Button;
  return (
    <>
      <FallbackStyles kit={kit} />
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
    </>
  );
}

/** Props for {@link KitPanel}: the kit panel's props plus an `open` flag that plays enter and exit motion. */
export interface KitPanelHostProps extends KitPanelProps {
  /** Omit for always-shown panels. `false` plays the kit's exit motion, then unmounts. */
  open?: boolean;
}

/**
 * The active kit's panel. Give `open` to animate it in and out with the kit's own motion.
 *
 * @capability kit-panel a content surface drawn by the active UI kit, with the kit's enter/exit motion
 */
export function KitPanel({ open, ...props }: KitPanelHostProps): ReactNode {
  const kit = useUiKit();
  const presence = useKitPresence(open ?? true, kit.motion.exitMs);
  const report = useHudInteract("panel");
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open === undefined || open === wasOpen.current) return;
    wasOpen.current = open;
    report(open ? "open" : "close");
  }, [open, report]);
  if (!presence.mounted) return null;
  const Panel = kit.components.Panel;
  return (
    <>
      <FallbackStyles kit={kit} />
      <Panel {...props} leaving={props.leaving === true || presence.leaving} />
    </>
  );
}

/** The active kit's meter. @capability kit-meter a value meter (bar, segments, ring) drawn by the active UI kit */
export function KitMeter(props: KitMeterProps): ReactNode {
  const kit = useUiKit();
  const Meter = kit.components.Meter;
  return (
    <>
      <FallbackStyles kit={kit} />
      <Meter {...props} />
    </>
  );
}

/** The active kit's prompt with an explicit glyph. Prefer {@link KitActionPrompt}, which picks the glyph per device. */
export function KitPrompt(props: Omit<KitPromptProps, "device"> & { device?: KitPromptProps["device"] }): ReactNode {
  const kit = useUiKit();
  const live = useInputDevice();
  const Prompt = kit.components.Prompt;
  return (
    <>
      <FallbackStyles kit={kit} />
      <Prompt {...props} device={props.device ?? live} />
    </>
  );
}

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
export function KitActionPrompt({ action, label, progress, tone, onActivate, fallbackGlyph, className, style }: KitActionPromptProps): ReactNode {
  const context = useContext(UiKitContext);
  const kit = context?.kit ?? plainKit;
  const device = useInputDevice();
  if (device === "touch" && onActivate === undefined) return null;
  const glyph = (context?.bindings === undefined ? null : actionGlyph(context.bindings, action, device, context.glyphSet)) ?? fallbackGlyph ?? null;
  if (glyph === null) return null;
  const Prompt = kit.components.Prompt;
  return (
    <>
      <FallbackStyles kit={kit} />
      <Prompt glyph={glyph} label={label} device={device} progress={progress} tone={tone} onActivate={onActivate} className={className} style={style} />
    </>
  );
}

/** The active kit's toast. @capability kit-toast a short message drawn by the active UI kit, with its enter/exit motion */
export function KitToast(props: KitToastProps): ReactNode {
  const kit = useUiKit();
  const Toast = kit.components.Toast;
  return (
    <>
      <FallbackStyles kit={kit} />
      <Toast {...props} />
    </>
  );
}

/** The active kit's menu list. Navigation comes from `useMenuNav`. @capability kit-menu a verb list drawn by the active UI kit over shared menu navigation */
export function KitMenu(props: KitMenuProps): ReactNode {
  const kit = useUiKit();
  const Menu = kit.components.Menu;
  return (
    <>
      <FallbackStyles kit={kit} />
      <Menu {...props} />
    </>
  );
}

/** The active kit's minimap frame. @capability kit-minimap-frame a minimap or radar frame drawn by the active UI kit */
export function KitMinimapFrame(props: KitMinimapFrameProps): ReactNode {
  const kit = useUiKit();
  const MinimapFrame = kit.components.MinimapFrame;
  return (
    <>
      <FallbackStyles kit={kit} />
      <MinimapFrame {...props} />
    </>
  );
}
