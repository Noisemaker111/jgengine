const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const slantBar = (lean: number) =>
  `polygon(${lean}px 0, 100% 0, calc(100% - ${lean}px) 100%, 0 100%)`;

const clampFraction = (value: number) => (Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value)));

export function LoadingScreen({
  fraction,
  tip,
  title,
  className,
}: {
  fraction?: number;
  tip?: string;
  title?: string;
  className?: string;
}) {
  const determinate = fraction !== undefined;
  const clamped = determinate ? clampFraction(fraction) : 0;
  return (
    <div
      className={`pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-6 ${className ?? ""}`}
      data-jg="loading-screen"
      style={{ background: "var(--jg-surface-deep)" }}
    >
      {title !== undefined && (
        <span
          className="text-[20px] font-bold uppercase tracking-[0.3em]"
          style={{ fontFamily: "var(--jg-font-display)", color: "var(--jg-text-dim)", textShadow: HUD_TEXT_SHADOW }}
        >
          {title}
        </span>
      )}
      <div
        className="relative overflow-hidden"
        style={{
          width: "min(520px, 60%)",
          height: 8,
          clipPath: slantBar(6),
          background: "var(--jg-surface-deep)",
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.8)",
        }}
      >
        {determinate ? (
          <div
            className="absolute inset-0 transition-[width] duration-200 ease-out"
            style={{
              width: `${clamped * 100}%`,
              background: "linear-gradient(90deg, var(--jg-accent-deep) 0%, var(--jg-accent) 100%)",
              boxShadow: "0 0 10px var(--jg-accent-glow)",
            }}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "linear-gradient(90deg, transparent, var(--jg-accent), transparent)",
              backgroundSize: "160px 100%",
              backgroundRepeat: "no-repeat",
              animation: "jg-sheen 1.2s linear infinite",
            }}
          />
        )}
      </div>
      {tip !== undefined && (
        <span
          key={tip}
          className="absolute inset-x-0 bottom-12 text-center text-[12px] italic"
          style={{ color: "var(--jg-text-dim)", animation: "jg-slide-up 0.3s ease-out" }}
        >
          {tip}
        </span>
      )}
    </div>
  );
}
