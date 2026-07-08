const chamfer = (cut: number) =>
  `polygon(${cut}px 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, ${cut}px 100%, 0 calc(100% - ${cut}px), 0 ${cut}px)`;

export function KeybindBadge({
  label,
  size = "md",
  className,
}: {
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const dims =
    size === "sm"
      ? "min-w-[15px] h-[15px] px-[3px] text-[9px]"
      : "min-w-[20px] h-5 px-[5px] text-[11px]";
  return (
    <kbd
      data-jg="keybind-badge"
      className={`inline-flex items-center justify-center font-mono font-bold uppercase leading-none ${dims} ${className ?? ""}`}
      style={{
        color: "var(--jg-text)",
        background:
          "linear-gradient(180deg, var(--jg-edge-bright) 0%, var(--jg-edge) 8%, var(--jg-surface) 90%)",
        border: "1px solid var(--jg-edge-bright)",
        borderBottomWidth: 2,
        clipPath: chamfer(3),
      }}
    >
      {label}
    </kbd>
  );
}
