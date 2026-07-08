export function AccentRule({ width = 120, className }: { width?: number | string; className?: string }) {
  return (
    <span
      className={`block h-0.5 ${className ?? ""}`}
      style={{
        width,
        background:
          "linear-gradient(90deg, transparent 0%, var(--jg-accent) 18%, var(--jg-accent) 82%, transparent 100%)",
        boxShadow: "0 0 8px var(--jg-accent-glow)",
      }}
    />
  );
}
