const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

export function ChatBubble({
  body,
  fromLabel,
  x,
  y,
  className,
}: {
  body: string;
  fromLabel?: string;
  x?: number;
  y?: number;
  className?: string;
}) {
  const positioned = x !== undefined && y !== undefined;
  return (
    <span
      className={`${positioned ? "pointer-events-none absolute" : "inline-block"} max-w-[180px] rounded-md px-2 py-1 text-xs break-words ${className ?? ""}`}
      data-jg="chat-bubble"
      style={{
        ...(positioned
          ? { left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -110%)" }
          : {}),
        background: "rgba(11, 9, 6, 0.82)",
        color: "var(--jg-text)",
        textShadow: HUD_TEXT_SHADOW,
      }}
    >
      {fromLabel !== undefined && (
        <span
          className="mb-0.5 block text-[9px] font-bold uppercase tracking-[0.18em]"
          style={{ color: "var(--jg-text-dim)" }}
        >
          {fromLabel}
        </span>
      )}
      {body}
    </span>
  );
}
