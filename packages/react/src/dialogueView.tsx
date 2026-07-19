import { useEffect, useReducer, type CSSProperties, type ReactNode } from "react";

import type {
  DialogueGraphChoice,
  DialogueGraphView,
  DialogueRun,
} from "@jgengine/core/game/dialogueGraph";

/**
 * Subscribe to a {@link DialogueRun} and re-render on every advance / jump / reset,
 * returning the current node view (or `null` if the run's node id is unknown).
 *
 * @capability use-dialogue-run React hook binding a branching dialogue run to a component — re-renders as the player advances the conversation
 */
export function useDialogueRun(run: DialogueRun): DialogueGraphView | null {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => run.subscribe(bump), [run]);
  return run.current();
}

/** Reskin tokens for {@link DialogueView}. Each defaults to a HudTheme `--jg-*` token. */
export interface DialogueViewTheme {
  /** Panel background. Default reads `--jg-frame-bg`. */
  background?: string;
  /** Panel border. Default reads `--jg-frame-border`. */
  border?: string;
  /** Panel corner radius (any CSS length). Default reads `--jg-frame-radius`. */
  radius?: string;
  /** Panel outer glow / drop shadow. Default reads `--jg-frame-glow`. */
  glow?: string;
  /** Body/line text color. Default reads `--jg-bar-text`. */
  text?: string;
  /** Accent for the speaker name and choice hover/focus. Default reads `--jg-accent`. */
  accent?: string;
  /** Choice button background. Default reads `--jg-slot-bg`. */
  choiceBackground?: string;
  /** Choice button border. Default reads `--jg-slot-border`. */
  choiceBorder?: string;
  /** Choice button corner radius. Default reads `--jg-slot-radius`. */
  choiceRadius?: string;
}

function resolveTheme(theme: DialogueViewTheme | undefined): Required<DialogueViewTheme> {
  return {
    background: theme?.background ?? "var(--jg-frame-bg, linear-gradient(180deg, rgba(20,24,32,0.92), rgba(10,12,16,0.94)))",
    border: theme?.border ?? "var(--jg-frame-border, 1px solid rgba(255,255,255,0.12))",
    radius: theme?.radius ?? "var(--jg-frame-radius, 12px)",
    glow: theme?.glow ?? "var(--jg-frame-glow, 0 18px 48px rgba(0,0,0,0.5))",
    text: theme?.text ?? "var(--jg-bar-text, #e5e9f0)",
    accent: theme?.accent ?? "var(--jg-accent, #38bdf8)",
    choiceBackground: theme?.choiceBackground ?? "var(--jg-slot-bg, rgba(12,14,20,0.72))",
    choiceBorder: theme?.choiceBorder ?? "var(--jg-slot-border, 1px solid rgba(148,163,184,0.28))",
    choiceRadius: theme?.choiceRadius ?? "var(--jg-slot-radius, 8px)",
  };
}

/** Props for {@link DialogueView}. */
export interface DialogueViewProps {
  /** The live branching-conversation run to render and advance. */
  run: DialogueRun;
  /**
   * Render a portrait for the current node. Given the node's opaque `portrait` key/URL and
   * its `speakerKind`; return `null` to omit the portrait slot. Omit the prop for no portrait.
   */
  renderPortrait?: (portrait: string | undefined, speakerKind: string | undefined) => ReactNode;
  /** Called when the player picks the choice at `index` (after the run advances). */
  onChoose?: (choice: DialogueGraphChoice, index: number) => void;
  /**
   * Called when the player advances a terminal node — a choice with no destination, or the
   * Close control on a node with no choices. Wire this to `ctx.game.dialogue.close()`.
   */
  onClose?: () => void;
  /** Label for the Close control shown on a terminal node with no choices. Default `"Close"`. */
  closeLabel?: string;
  theme?: DialogueViewTheme;
  className?: string;
  style?: CSSProperties;
  speakerClassName?: string;
  textClassName?: string;
  choicesClassName?: string;
  choiceClassName?: string;
}

/**
 * A drop-in branching-conversation view over a {@link DialogueRun}: renders the current
 * node's speaker name (+ an optional portrait slot), the line, and a list of clickable
 * response choices that advance the conversation — the game passes its dialogue graph and
 * gets working node traversal and choice state with no hand-rolled walk. A choice with a
 * destination advances the run; a terminal choice (or the Close control on a choiceless
 * node) fires `onClose`. Speaker/choice `kind` are free strings surfaced as `data-*`
 * attributes for the game to style; the view never interprets them. HudTheme-skinned via
 * `--jg-*` tokens; reskin further with {@link DialogueViewTheme}.
 *
 * @capability dialogue-view drop-in branching conversation UI — speaker + portrait slot, current line, clickable response choices that advance a DialogueRun
 */
export function DialogueView({
  run,
  renderPortrait,
  onChoose,
  onClose,
  closeLabel = "Close",
  theme,
  className,
  style,
  speakerClassName,
  textClassName,
  choicesClassName,
  choiceClassName,
}: DialogueViewProps): ReactNode {
  const view = useDialogueRun(run);
  const t = resolveTheme(theme);
  if (view === null) return null;

  const portrait = renderPortrait?.(view.portrait, view.speakerKind) ?? null;

  const handleChoose = (choice: DialogueGraphChoice, index: number): void => {
    const terminal = choice.to === undefined || choice.to === null;
    run.choose(index);
    onChoose?.(choice, index);
    if (terminal) onClose?.();
  };

  return (
    <div
      className={className}
      data-dialogue-node={view.nodeId}
      data-speaker-kind={view.speakerKind}
      style={{
        boxSizing: "border-box",
        maxWidth: 560,
        width: "100%",
        padding: 18,
        background: t.background,
        border: t.border,
        borderRadius: t.radius,
        boxShadow: t.glow,
        color: t.text,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        pointerEvents: "auto",
        ...style,
      }}
    >
      {portrait !== null ? (
        <div
          data-dialogue-portrait
          style={{
            flex: "0 0 auto",
            width: 72,
            height: 72,
            borderRadius: 10,
            overflow: "hidden",
            border: t.choiceBorder,
            display: "grid",
            placeItems: "center",
            background: t.choiceBackground,
          }}
        >
          {portrait}
        </div>
      ) : null}
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        {view.speaker !== undefined ? (
          <div
            className={speakerClassName}
            data-dialogue-speaker
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: t.accent,
            }}
          >
            {view.speaker}
          </div>
        ) : null}
        <p
          className={textClassName}
          data-dialogue-text
          style={{ margin: view.speaker !== undefined ? "6px 0 0" : 0, fontSize: 15, lineHeight: 1.55 }}
        >
          {view.text}
        </p>
        <div
          className={choicesClassName}
          data-dialogue-choices
          style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}
        >
          {view.choices.length > 0
            ? view.choices.map((choice, index) => (
                <button
                  key={index}
                  type="button"
                  className={choiceClassName}
                  data-dialogue-choice={index}
                  data-choice-kind={choice.kind}
                  onClick={() => handleChoose(choice, index)}
                  style={{
                    appearance: "none",
                    textAlign: "left",
                    cursor: "pointer",
                    padding: "9px 13px",
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: t.text,
                    background: t.choiceBackground,
                    border: t.choiceBorder,
                    borderRadius: t.choiceRadius,
                  }}
                >
                  {choice.text}
                </button>
              ))
            : onClose !== undefined
              ? (
                  <button
                    type="button"
                    className={choiceClassName}
                    data-dialogue-close
                    onClick={onClose}
                    style={{
                      appearance: "none",
                      alignSelf: "flex-start",
                      cursor: "pointer",
                      padding: "9px 16px",
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: "#06121b",
                      background: t.accent,
                      border: "1px solid transparent",
                      borderRadius: t.choiceRadius,
                    }}
                  >
                    {closeLabel}
                  </button>
                )
              : null}
        </div>
      </div>
    </div>
  );
}
