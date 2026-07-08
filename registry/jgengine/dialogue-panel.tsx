import { useState, type CSSProperties, type ReactNode } from "react";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const SURFACE_TEXTURE =
  "repeating-linear-gradient(135deg, rgba(255,255,255,0.016) 0px, rgba(255,255,255,0.016) 1px, transparent 1px, transparent 7px), linear-gradient(180deg, var(--jg-surface) 0%, var(--jg-surface-deep) 100%)";

const chamfer = (cut: number) =>
  `polygon(${cut}px 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, ${cut}px 100%, 0 calc(100% - ${cut}px), 0 ${cut}px)`;

const edgeNotch = (cut: number) =>
  `polygon(0 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% 100%, ${cut}px 100%, 0 calc(100% - ${cut}px))`;

export type CheckAdvantage = "advantage" | "disadvantage" | "normal";

export interface DialogueCheck {
  label?: string;
  modifier: number;
  dc: number;
  advantage?: CheckAdvantage;
  diceSides?: number;
}

export interface DialogueChoice {
  label: string;
  invoke: { command: string; args?: unknown } | null;
  check?: DialogueCheck;
  onSuccess?: { command: string; args?: unknown } | null;
  onFailure?: { command: string; args?: unknown } | null;
}

export type DialogueLine = { speaker: string; text: string } | { choices: readonly DialogueChoice[] };

export interface DialogueDef {
  id: string;
  lines: readonly DialogueLine[];
}

export interface CheckResult {
  rolls: readonly number[];
  roll: number;
  total: number;
  success: boolean;
  critical: "success" | "failure" | null;
}

function rollCheck(input: DialogueCheck, rng: () => number = Math.random): CheckResult {
  const sides = input.diceSides ?? 20;
  const advantage = input.advantage ?? "normal";
  const rollDie = () => Math.floor(rng() * sides) + 1;
  const rolls = advantage === "normal" ? [rollDie()] : [rollDie(), rollDie()];
  const roll =
    advantage === "advantage" ? Math.max(...rolls) : advantage === "disadvantage" ? Math.min(...rolls) : rolls[0]!;
  const total = roll + input.modifier;
  const success = total >= input.dc;
  const critical = roll === sides ? "success" : roll === 1 ? "failure" : null;
  return { rolls, roll, total, success, critical };
}

function HoverButton({
  onClick,
  style,
  hoverStyle,
  dataJg,
  className,
  children,
}: {
  onClick?: () => void;
  style: CSSProperties;
  hoverStyle: CSSProperties;
  dataJg?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      data-jg={dataJg}
      className={className}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...style, ...(hovered ? hoverStyle : {}) }}
    >
      {children}
    </button>
  );
}

export function DialoguePanel({
  dialogue,
  speakerPortrait,
  onChoice,
  rng,
  width = 560,
  className,
}: {
  dialogue: DialogueDef;
  speakerPortrait?: ReactNode;
  onChoice?: (choice: DialogueChoice, result: CheckResult | null) => void;
  rng?: () => number;
  width?: number;
  className?: string;
}) {
  const speakerLine = dialogue.lines.find((line) => "speaker" in line) as
    | { speaker: string; text: string }
    | undefined;
  return (
    <div
      className={`relative mt-3 flex gap-3 p-3.5 ${className ?? ""}`}
      data-jg="dialogue-panel"
      style={{
        width,
        clipPath: edgeNotch(12),
        background: SURFACE_TEXTURE,
        border: "1px solid var(--jg-edge)",
        borderTop: "2px solid var(--jg-accent)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.65), inset 0 0 40px rgba(0,0,0,0.45)",
        color: "var(--jg-text)",
      }}
    >
      {speakerPortrait !== undefined && (
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden"
          style={{
            clipPath: chamfer(6),
            border: "1px solid var(--jg-edge-bright)",
            background: "linear-gradient(180deg, var(--jg-surface) 0%, var(--jg-surface-deep) 100%)",
          }}
        >
          {speakerPortrait}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {speakerLine !== undefined && (
          <span
            className="absolute -top-2.5 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{
              left: speakerPortrait !== undefined ? 76 : 14,
              background: "linear-gradient(135deg, var(--jg-accent-deep) 0%, var(--jg-surface-deep) 100%)",
              border: "1px solid var(--jg-accent)",
              fontFamily: "var(--jg-font-display)",
              padding: "2px 10px",
              clipPath: chamfer(3),
              color: "var(--jg-text)",
              textShadow: HUD_TEXT_SHADOW,
            }}
          >
            {speakerLine.speaker}
          </span>
        )}
        {dialogue.lines.map((line, index) =>
          "choices" in line ? (
            <div key={index} data-jg="dialogue-choices" className="flex flex-col gap-0.5">
              {line.choices.map((choice) => (
                <HoverButton
                  key={choice.label}
                  dataJg="dialogue-choice"
                  onClick={() => onChoice?.(choice, choice.check === undefined ? null : rollCheck(choice.check, rng))}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 px-2 py-1.5 text-left text-[12.5px]"
                  style={{ border: "none", background: "transparent", color: "var(--jg-text)" }}
                  hoverStyle={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden style={{ color: "var(--jg-accent)" }}>
                      {"‣"}
                    </span>
                    <span>{choice.label}</span>
                  </span>
                  {choice.check !== undefined && (
                    <span className="shrink-0 font-mono text-[11px]" style={{ color: "var(--jg-warning)" }}>
                      [{choice.check.label ?? "Check"} DC {choice.check.dc}]
                    </span>
                  )}
                </HoverButton>
              ))}
            </div>
          ) : (
            <p key={index} className="m-0 text-[13px] leading-[1.55]" style={{ color: "var(--jg-text)" }}>
              {line.text}
            </p>
          ),
        )}
      </div>
    </div>
  );
}
