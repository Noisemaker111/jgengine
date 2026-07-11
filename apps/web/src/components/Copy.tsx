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

export function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          })
          .catch(() => setCopied(false));
      }}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
        copied
          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
          : "border-white/15 bg-white/5 text-slate-200 hover:border-white/30 hover:bg-white/10"
      } ${className}`}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function CommandBlock({
  command,
  kind = "shell",
}: {
  command: string;
  /** shell = agent CLI; prompt = what a human says to their agent */
  kind?: "shell" | "prompt";
}) {
  const prefix = kind === "prompt" ? "›" : "$";
  return (
    <div className="shine group relative overflow-hidden rounded-2xl border border-emerald-400/25 bg-ink-deep/85 shadow-[0_0_50px_-12px_rgba(16,185,129,0.35),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />
      <div className="pointer-events-none absolute -inset-x-8 -top-12 h-16 bg-emerald-400/10 blur-2xl" />
      <div className="relative flex items-center gap-2 p-3 sm:gap-3 sm:px-5 sm:py-4">
        <span className="select-none font-mono text-sm font-semibold text-emerald-500/80">{prefix}</span>
        <code className="flex-1 break-all text-left font-mono text-[13px] leading-relaxed text-emerald-300 sm:text-sm">
          {command}
        </code>
        <CopyButton value={command} />
      </div>
    </div>
  );
}
