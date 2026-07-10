export function ProverbsTicker({ text }: { text: string }) {
  return (
    <div
      className="pointer-events-none flex items-center justify-center px-4 py-1.5"
      style={{
        background: "linear-gradient(180deg, rgba(36,26,16,0.85) 0%, rgba(22,15,9,0.85) 100%)",
        border: "1px solid var(--jg-edge)",
      }}
    >
      <span
        className="text-center text-[12px] italic"
        style={{
          fontFamily: "var(--jg-font-display)",
          color: "var(--jg-text-dim)",
          textShadow: "0 1px 2px rgba(0,0,0,0.9)",
        }}
      >
        “{text}”
      </span>
    </div>
  );
}
