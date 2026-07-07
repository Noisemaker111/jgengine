import { useState } from "react";

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
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
      className={`shrink-0 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-white/30 hover:bg-white/10 ${className}`}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

export function CommandBlock({ command }: { command: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-slate-950/60 p-3 sm:gap-3 sm:px-4 sm:py-3.5">
      <span className="select-none pt-px font-mono text-sm text-slate-500">$</span>
      <code className="flex-1 break-all font-mono text-[13px] leading-relaxed text-emerald-300 sm:text-sm">
        {command}
      </code>
      <CopyButton value={command} className="shrink-0" />
    </div>
  );
}
