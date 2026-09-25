import { useState } from "react";

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3.5 w-3.5" aria-hidden>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5v-2a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3.5V9A1.5 1.5 0 0 0 4 10.5h1.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden>
      <path d="M3 8.5 6.5 12 13 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const VARIANTS = {
  outline: "border border-line-strong bg-raised text-fg hover:border-fg",
  ghost: "border border-transparent text-faint hover:bg-fg/[0.06] hover:text-fg",
  solid: "border border-transparent bg-accent text-on-accent hover:brightness-110",
} as const;

export function CopyButton({
  value,
  label = "Copy",
  variant = "outline",
  className = "",
  ariaLabel,
}: {
  value: string;
  label?: string;
  ariaLabel?: string;
  variant?: keyof typeof VARIANTS;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          })
          .catch(() => setCopied(false));
      }}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${VARIANTS[variant]} ${className}`}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {(label !== "" || copied) && <span aria-live="polite">{copied ? "Copied" : label}</span>}
    </button>
  );
}

/** A single copyable line: what a person says to their agent, or a shell command. */
export function CommandBlock({
  command,
  kind = "shell",
}: {
  command: string;
  kind?: "shell" | "prompt";
}) {
  const prefix = kind === "prompt" ? "›" : "$";
  return (
    <div className="card flex items-center gap-3 p-2 pl-4 sm:p-2.5 sm:pl-5">
      <span className="select-none font-mono text-sm font-semibold text-accent-text" aria-hidden>
        {prefix}
      </span>
      <code className="min-w-0 flex-1 break-words text-left font-mono text-[13px] leading-relaxed text-fg sm:text-sm">
        {command}
      </code>
      <CopyButton value={command} variant="solid" className="py-2" />
    </div>
  );
}
