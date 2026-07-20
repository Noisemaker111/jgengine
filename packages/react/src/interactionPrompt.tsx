import { useEffect, useReducer, type CSSProperties, type ReactNode } from "react";

import type { PositionedPrompt, PromptPoint } from "@jgengine/core/interaction/proximityPrompt";
import type { PromptRegistry } from "@jgengine/core/interaction/promptRegistry";

import { StaminaBar } from "./bars";
import { KeyHint, Keycap } from "./keyHint";

/**
 * Subscribe to a {@link PromptRegistry} and re-`resolve` it whenever the player
 * moves, returning the prompt to draw right now — or `null` when the player is
 * out of range of every interactable. The registry notifies only on active-prompt
 * *changes*, so this re-renders on transitions rather than every frame the hero
 * moves. Feed it the player's `{ x, z }` position each frame; identical positions
 * do no work.
 *
 * @capability use-interaction-prompt React hook binding a prompt registry to a moving player — resolves the nearest interactable prompt and returns the active one
 */
export function useInteractionPrompt(
  registry: PromptRegistry,
  playerPosition: PromptPoint,
): PositionedPrompt | null {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => registry.subscribe(bump), [registry]);

  useEffect(() => {
    registry.resolve(playerPosition);
  }, [registry, playerPosition.x, playerPosition.z]);

  return registry.active();
}

/** Reskin tokens for {@link InteractionPrompt}. */
export interface InteractionPromptTheme {
  /** Accent for the key cap and glow. Default reads `--jg-accent`. */
  accent?: string;
  /** Callout background. */
  background?: string;
  /** Callout border color. */
  border?: string;
  /** Label text color. */
  text?: string;
  /** Font family. */
  fontFamily?: string;
}

function resolveTheme(theme: InteractionPromptTheme | undefined): Required<InteractionPromptTheme> {
  return {
    accent: theme?.accent ?? "var(--jg-accent, #38bdf8)",
    background: theme?.background ?? "rgba(15,20,28,0.86)",
    border: theme?.border ?? "rgba(148,163,184,0.28)",
    text: theme?.text ?? "#e2e8f0",
    fontFamily: theme?.fontFamily ?? "ui-sans-serif, system-ui, sans-serif",
  };
}

/** Where the callout sits over the scene. */
export type InteractionPromptAnchor = "bottom-center" | "top-center" | "center";

const ANCHOR_STYLE: Record<InteractionPromptAnchor, CSSProperties> = {
  "bottom-center": { bottom: "12%", left: "50%", transform: "translateX(-50%)" },
  "top-center": { top: "12%", left: "50%", transform: "translateX(-50%)" },
  center: { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
};

/** Props for {@link InteractionPrompt}. */
export interface InteractionPromptProps {
  /** The registry that owns the prompts and the active selection. */
  registry: PromptRegistry;
  /**
   * The player's ground position. When supplied the host drives `resolve` on
   * every position change; omit it if the game already calls `registry.resolve`
   * from its own tick (the host still subscribes and renders the active prompt).
   */
  playerPosition?: PromptPoint;
  /** Base reskin tokens. */
  theme?: InteractionPromptTheme;
  /**
   * Per-prompt accent chooser. The registry never interprets a prompt's meaning,
   * so the game decides the accent from the active prompt (its id, action id, or
   * label) — e.g. a warm hue for a chest, cool for a door. Returning `undefined`
   * falls back to the theme accent.
   */
  accentFor?: (prompt: PositionedPrompt) => string | undefined;
  /**
   * Key glyph shown on the cap for a `keybind` prompt, chosen from the prompt's
   * free-string `actionId`. Default `"E"`.
   */
  keyFor?: (actionId: string) => string;
  /**
   * Hold progress `0..1` for a `gauge` prompt, by its free-string `gaugeId` —
   * fills the ring/bar as the player holds. Default `0`.
   */
  gaugeProgress?: (gaugeId: string) => number;
  /** Where the callout sits. Default `"bottom-center"`. */
  anchor?: InteractionPromptAnchor;
  /** Overlay `z-index`. Default `40`. */
  zIndex?: number;
  className?: string;
  style?: CSSProperties;
}

/** Bind to the registry either through the moving player, or passively on the active id. */
function useActive(registry: PromptRegistry, playerPosition: PromptPoint | undefined): PositionedPrompt | null {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => registry.subscribe(bump), [registry]);
  const px = playerPosition?.x;
  const pz = playerPosition?.z;
  useEffect(() => {
    if (px !== undefined && pz !== undefined) registry.resolve({ x: px, z: pz });
  }, [registry, px, pz]);
  return registry.active();
}

/**
 * A screen-anchored "Press E to …" interaction callout that renders the active
 * prompt of a {@link PromptRegistry}. It subscribes to the registry and — when
 * given `playerPosition` — re-resolves as the hero moves, showing the nearest
 * in-range interactable and switching to a closer/higher-priority one as they
 * cross radii. Each display kind renders as itself: a `keybind` shows a key cap
 * plus its label ("Press [E] Open"), a `gauge` shows a hold bar filling with
 * `gaugeProgress`, and a `label` shows plain text. Presentation only — the
 * registry never branches on a prompt's meaning; the game colors each via
 * `accentFor` and maps action ids to key glyphs via `keyFor`. HudTheme-skinnable
 * through `--jg-accent` and {@link InteractionPromptTheme}.
 *
 * @capability interaction-prompt-host screen-anchored "press E to…" callout rendering a prompt registry's active interactable — keybind cap+label, gauge hold bar, or plain label, theme- and per-prompt-accent skinnable
 */
export function InteractionPrompt({
  registry,
  playerPosition,
  theme,
  accentFor,
  keyFor,
  gaugeProgress,
  anchor = "bottom-center",
  zIndex = 40,
  className,
  style,
}: InteractionPromptProps): ReactNode {
  const prompt = useActive(registry, playerPosition);
  if (prompt === null) return null;

  const t = resolveTheme(theme);
  const accent = accentFor?.(prompt) ?? t.accent;
  const display = prompt.prompt.display;

  let body: ReactNode;
  if (display.kind === "keybind") {
    const glyph = keyFor?.(display.actionId) ?? "E";
    body = (
      <KeyHint style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.4, opacity: 0.85 }}>Press</span>
        <Keycap
          style={{
            display: "inline-flex",
            minWidth: 26,
            justifyContent: "center",
            padding: "3px 8px",
            borderRadius: 6,
            border: `1px solid ${accent}`,
            background: "rgba(0,0,0,0.35)",
            color: accent,
            fontWeight: 800,
            fontSize: 14,
            boxShadow: `0 0 10px -2px ${accent}`,
          }}
        >
          {glyph}
        </Keycap>
        {display.label !== undefined ? (
          <span style={{ fontSize: 15, fontWeight: 700 }}>{display.label}</span>
        ) : null}
      </KeyHint>
    );
  } else if (display.kind === "gauge") {
    const progress = Math.max(0, Math.min(1, gaugeProgress?.(display.gaugeId) ?? 0));
    body = (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.4, opacity: 0.85 }}>Hold</span>
        <StaminaBar value={progress * 100} showValue={false} width={140} fill={accent} />
      </span>
    );
  } else {
    body = <span style={{ fontSize: 15, fontWeight: 700 }}>{display.text}</span>;
  }

  return (
    <div
      className={className}
      data-interaction-prompt={prompt.id}
      data-prompt-kind={display.kind}
      style={{
        position: "absolute",
        ...ANCHOR_STYLE[anchor],
        display: "flex",
        alignItems: "center",
        pointerEvents: "none",
        padding: "9px 16px",
        borderRadius: 12,
        border: `1px solid ${t.border}`,
        background: t.background,
        color: t.text,
        fontFamily: t.fontFamily,
        boxShadow: `0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px ${accent}22`,
        backdropFilter: "blur(4px)",
        whiteSpace: "nowrap",
        zIndex,
        ...style,
      }}
    >
      {body}
    </div>
  );
}
