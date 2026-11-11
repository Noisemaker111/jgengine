/** @jsxImportSource @jgengine/core/ui/jsx */
import { Children, createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "../jsx";
import { isLive, live, type Live } from "../liveValue";
import { RuneBox, RuneIcon, RuneSurface, RuneText, RuneTextField, useRuneViewport } from "./elements.view";
import type { RuneElementProps, RuneBoundStyle, RuneBoundFont, RuneSpan } from "./element";
import { bind, runeFormat, runeViewportClass, ownRuneFlow, type RuneFlow, type RuneSource, type RuneTheme, type RuneViewportClass } from "./primitives";
import type { GameContext } from "../../runtime/gameContext";

export type RuneAnchor = "fill" | "center" | "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type RuneProjection = (target: { entity?: string; position?: readonly [number, number, number]; offset?: readonly [number, number, number] }) => { x: number; y: number; visible: boolean };
export interface RuneRootProps {
  theme: RuneTheme;
  context?: GameContext;
  safeArea?: readonly [number, number, number, number];
  project?: RuneProjection;
  localise?: (key: string, params?: Readonly<Record<string, string | number>>) => string;
  children?: ReactNode;
}
const Environment = createContext<RuneRootProps | null>(null);
function useEnvironment() {
  const env = useContext(Environment);
  if (env === null) throw new Error("Rune primitives need a RuneRoot");
  return env;
}

/** One native game surface, with injected game state, look, projection and translation. */
export function RuneRoot(props: RuneRootProps) {
  return <Environment value={props}><RuneSurface><RuneBox pin={[0,0,0,0]} {...props.theme.text["body"]}>{props.children}</RuneBox></RuneSurface></Environment>;
}

export interface RuneViewProps extends RuneElementProps {
  layout?: "stack" | "row" | "grid";
  anchor?: RuneAnchor;
  safe?: boolean;
  inset?: number;
  variant?: string;
  responsive?: Partial<Record<RuneViewportClass, RuneBoundStyle & RuneBoundFont & { layout?: "stack" | "row" | "grid" }>>;
}

/** Native layout, paint and responsive overrides. Anchors refer to the nearest positioned parent. */
export function RuneView({ layout, anchor, safe, inset = 0, variant, responsive, ...props }: RuneViewProps) {
  const env = useEnvironment(), viewport = useRuneViewport();
  const adjusted = responsive?.[runeViewportClass(viewport.width)];
  const skin = variant === undefined ? undefined : env.theme.variants[variant];
  if (variant !== undefined && skin === undefined) throw new Error(`Unknown Rune variant: ${variant}`);
  const native = { ...skin, ...props, ...adjusted };
  const mode = adjusted?.layout ?? layout;
  delete native.layout;
  if (mode === "row") native.direction = "row";
  if (mode === "grid") native.columns ??= 1;
  if (anchor === undefined) return <RuneBox {...native} />;
  const [t,r,b,l] = safe ? env.safeArea ?? [0,0,0,0] : [0,0,0,0];
  const vertical = anchor.includes("top") ? "start" : anchor.includes("bottom") ? "end" : "center";
  const horizontal = anchor.includes("left") ? "start" : anchor.includes("right") ? "end" : "center";
  return <RuneBox pin={[l + inset,t + inset,r + inset,b + inset]} justify={vertical} items={horizontal}>
    <RuneBox {...native} {...(anchor === "fill" ? { width: { fraction: 1 }, height: { fraction: 1 } } : {})} />
  </RuneBox>;
}

export interface RuneLabelProps<T> extends Omit<RuneElementProps, "text"> {
  value?: Live<T>;
  format?: (value: T) => string;
  textStyle?: string;
  message?: string;
  params?: Readonly<Record<string, string | number>>;
  rich?: Live<readonly RuneSpan[]>;
}

/** Text, formatting, rich spans and translated messages bound directly to a native leaf. */
export function RuneLabel<T = string>({ value, format, textStyle, message, params, rich, children, ...props }: RuneLabelProps<T>) {
  const env = useEnvironment();
  if (textStyle !== undefined && env.theme.text[textStyle] === undefined) throw new Error(`Unknown Rune text style: ${textStyle}`);
  const text = message === undefined ? value === undefined ? undefined : isLive(value) ? runeFormat(value, format ?? String) : (format ?? String)(value) :
    env.localise === undefined ? message : env.localise(message, params);
  return <RuneText {...(textStyle === undefined ? {} : env.theme.text[textStyle])} {...props}
    {...(text === undefined ? {} : { text })} {...(rich === undefined ? {} : { spans: rich })}>{children}</RuneText>;
}

export interface RuneActionProps extends RuneViewProps {
  command?: { name: string; input?: unknown };
  run?: () => void;
  acceptDrop?: (value: string) => void;
}

/** Command interaction with native focus, pointer/touch, keyboard, pad, hold and drag/drop. */
export function RuneAction({ command, run, acceptDrop, children, ...props }: RuneActionProps) {
  const env = useEnvironment();
  const parts = Children.toArray(children);
  const textOnly = parts.every(part => typeof part === "string" || typeof part === "number");
  const activate = () => {
    if (command !== undefined) {
      if (env.context === undefined) throw new Error("Rune command needs RuneRoot.context");
      env.context.game.commands.run(command.name, command.input ?? {});
    }
    run?.();
  };
  return <RuneView {...props} role="button" onPress={activate} {...(acceptDrop === undefined ? {} : { onDrop: acceptDrop })}>
    {textOnly ? <RuneLabel value={parts.join("")} /> : children}
  </RuneView>;
}

/** Props for {@link RuneField}: the controlled text, its callbacks and native field options. */
export interface RuneFieldProps extends Omit<RuneElementProps, "text" | "value" | "rev" | "onEdit" | "onSubmit" | "onReplace" | "children"> {
  /** The game's text. Typing reports through `onChange`; a different `value` replaces the field's text. */
  value: string;
  onChange: (text: string) => void;
  /** Enter in a single-line field (the phone keyboard's send key too). */
  onSubmit?: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secret?: boolean;
  /** Longest text in characters; longer input is cut and the field shows the cut text. */
  maxLength?: number;
  variant?: string;
  textStyle?: string;
}

/**
 * Native text entry: Rune owns caret, selection and IME; the game owns the text. While it has
 * focus, keys go to the field rather than menu navigation, captures or game hotkeys; Escape leaves it.
 * Keyboard and pad users reach it with navigation and Enter. On touch devices the surface raises the
 * phone keyboard through one offscreen proxy at the loader boundary.
 */
export function RuneField({ value, onChange, onSubmit, maxLength, variant, textStyle, ...props }: RuneFieldProps) {
  const env = useEnvironment();
  const skin = variant === undefined ? undefined : env.theme.variants[variant];
  if (variant !== undefined && skin === undefined) throw new Error(`Unknown Rune variant: ${variant}`);
  if (textStyle !== undefined && env.theme.text[textStyle] === undefined) throw new Error(`Unknown Rune text style: ${textStyle}`);
  // `shown` is the text Rune holds. A `value` that differs from it is the game replacing the text,
  // which a new `rev` tells Rune to take; a value that only echoes typing changes nothing.
  const state = useRef({ shown: value, rev: 0 });
  const [, redraw] = useState(0);
  if (value !== state.current.shown) state.current = { shown: value, rev: state.current.rev + 1 };
  const cut = (text: string) => maxLength === undefined ? text : Array.from(text).slice(0, Math.max(0, maxLength)).join("");
  // `replaced`: the text came from outside Rune (the phone keyboard proxy), so Rune must take it too.
  const take = (text: string, replaced: boolean) => {
    const next = cut(text), trimmed = next !== text;
    if (!replaced && !trimmed && next === state.current.shown) return;
    state.current = { shown: next, rev: replaced || trimmed ? state.current.rev + 1 : state.current.rev };
    if (next !== value) onChange(next);
    if (replaced || trimmed) redraw(n => n + 1);
  };
  return <RuneTextField {...(textStyle === undefined ? {} : env.theme.text[textStyle])} {...skin} {...props}
    value={state.current.shown} rev={state.current.rev} role="textbox"
    onEdit={text => take(text, false)} onReplace={text => take(text, true)}
    {...(onSubmit === undefined ? {} : { onSubmit: (text: string) => onSubmit(cut(text)) })} />;
}

/** Subscribed keyed composition. Per-frame fields belong in the item's bound leaves. */
export function RuneFor<T>({ source, keyBy, children }: { source: RuneSource<T>; keyBy: (item: T) => string | number; children: (item: T) => ReactNode }) {
  const items = useSyncExternalStore(source.subscribe, source.read, source.read);
  return <>{items.map(item => <RuneItem key={keyBy(item)} item={item} render={children} />)}</>;
}
function RuneItem<T>({ item, render }: { item: T; render: (item: T) => ReactNode }) { return render(item); }

/** Expiring collection presentation, with one deadline timer and game-authored message/popup contents. */
export function RuneTransient<T extends { id: string; expiresAt: number }>({ source, expire, now = Date.now, children }: {
  source: RuneSource<T>; expire: () => void; now?: () => number; children: (item: T) => ReactNode;
}) {
  const items = useSyncExternalStore(source.subscribe,source.read,source.read);
  useEffect(() => {
    if (items.length === 0) return;
    const at = Math.min(...items.map(item => item.expiresAt));
    const timer = setTimeout(expire,Math.max(1,at - now()));
    return () => clearTimeout(timer);
  }, [items,expire,now]);
  return <>{items.map(item => <RuneItem key={item.id} item={item} render={children} />)}</>;
}

/** A projected entity or point. Only the requested target is read; no world-wide scan. */
export function RuneWorldAnchor({ entity, position, offset, children, ...props }: Parameters<RuneProjection>[0] & RuneViewProps) {
  const env = useEnvironment();
  if (env.project === undefined) throw new Error("Rune world anchors need RuneRoot.project");
  const project = env.project;
  const target = { ...(entity === undefined ? {} : { entity }), ...(position === undefined ? {} : { position }), ...(offset === undefined ? {} : { offset }) };
  return <RuneView {...props} pin={[0,0,null,null]} x={bind(() => project(target).x)} y={bind(() => project(target).y)} hidden={bind(() => !project(target).visible)}>{children}</RuneView>;
}

type FlowEntry = ReturnType<RuneFlow["read"]>[number];
interface Presented { entry: FlowEntry; entered: number; exited?: number; }

/** Present a flow stack; route policy owns input/pause until the route leaves, including nested layers. */
export function RuneLayers({ flow, children, transition }: { flow: RuneFlow; children: (entry: FlowEntry) => ReactNode; transition?: { duration: number; distance: number } }) {
  const env = useEnvironment();
  const entries = useSyncExternalStore(flow.subscribe, flow.read, flow.read);
  const duration = transition?.duration ?? env.theme.motion.duration;
  const distance = transition?.distance ?? env.theme.motion.distance;
  const [presented, setPresented] = useState<readonly Presented[]>(() => entries.map(entry => ({ entry, entered: -Infinity })));
  useEffect(() => {
    if (env.context === undefined) return;
    return ownRuneFlow(flow, env.context);
  }, [flow, env.context]);
  useEffect(() => {
    const now = performance.now();
    setPresented(previous => {
      const next = entries.map(entry => {
        const prior = previous.find(p => p.entry.id === entry.id);
        return {entry,entered:prior?.exited === undefined ? prior?.entered ?? now : now};
      });
      const removed = previous.filter(p => !entries.some(entry => entry.id === p.entry.id)).map(p => ({ ...p, exited: p.exited ?? now }));
      return [...next, ...removed];
    });
    const timer = setTimeout(() => setPresented(previous => previous.some(p => p.exited !== undefined) ? previous.filter(p => p.exited === undefined) : previous), Math.max(0,duration));
    return () => clearTimeout(timer);
  }, [entries, duration]);
  const lastScreen = presented.reduce((last,p,index) => p.exited === undefined && flow.routes[p.entry.kind]?.layer === "screen" ? index : last,-1);
  return <>{presented.map((p,index) => {
    const route = flow.routes[p.entry.kind];
    const exiting = p.exited !== undefined;
    const progress = () => duration <= 0 ? 1 : Math.min(1, Math.max(0,(performance.now() - (p.exited ?? p.entered)) / duration));
    return <RuneView key={p.entry.id} anchor="fill" hidden={index < lastScreen} modal={!exiting && route?.capture === true}
      disabled={exiting} {...(!exiting && route?.capture === true ? {onBack:() => flow.pop()} : {})}
      opacity={live(() => exiting ? 1 - progress() : progress())}
      y={live(() => distance * (exiting ? -progress() : 1 - progress()))}>{children(p.entry)}</RuneView>;
  })}</>;
}

/** SVG artwork as a native icon. Tokens remain game-owned. */
export function RuneGlyph({ artwork, ...props }: Omit<RuneElementProps, "svg"> & { artwork: string }) { return <RuneIcon {...props} svg={artwork} />; }
