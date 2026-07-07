export function KeybindBadge({ label, className }: { label: string; className?: string }) {
  return (
    <kbd
      className={[
        "inline-flex min-w-[1.25rem] items-center justify-center rounded border border-stone-600/80 bg-black/70 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-200 shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </kbd>
  );
}