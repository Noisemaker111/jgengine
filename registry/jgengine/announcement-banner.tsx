import { KeybindBadge } from "@/components/ui/keybind-badge";

export type AnnouncementTone = "neutral" | "victory" | "defeat" | "warning";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

function AccentRule({ width = 260 }: { width?: number | string }) {
  return (
    <span
      style={{
        display: "block",
        width,
        height: 2,
        background:
          "linear-gradient(90deg, transparent 0%, var(--jg-accent) 18%, var(--jg-accent) 82%, transparent 100%)",
        boxShadow: "0 0 8px var(--jg-accent-glow)",
      }}
    />
  );
}

export function AnnouncementBanner({
  title,
  subtitle,
  tone = "neutral",
  keybindHint,
  visible = true,
  className,
}: {
  title: string;
  subtitle?: string;
  tone?: AnnouncementTone;
  keybindHint?: { label: string; keybind: string };
  visible?: boolean;
  className?: string;
}) {
  if (!visible) return null;
  const color =
    tone === "victory"
      ? "var(--jg-accent)"
      : tone === "defeat"
        ? "var(--jg-danger)"
        : tone === "warning"
          ? "var(--jg-warning)"
          : "var(--jg-text)";
  return (
    <div
      className={className}
      data-jg="announcement-banner"
      data-tone={tone}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        animation: "jg-slide-down 0.4s ease-out",
      }}
    >
      <span
        style={{
          fontFamily: "var(--jg-font-display)",
          fontSize: 34,
          fontWeight: 800,
          letterSpacing: "0.34em",
          paddingLeft: "0.34em",
          textTransform: "uppercase",
          color,
          textShadow: `0 2px 8px rgba(0,0,0,0.95), 0 0 22px var(--jg-accent-glow)`,
        }}
      >
        {title}
      </span>
      <AccentRule width={260} />
      {subtitle !== undefined && (
        <span
          style={{
            fontFamily: "var(--jg-font-body)",
            fontSize: 13,
            letterSpacing: "0.14em",
            color: "var(--jg-text-dim)",
            textShadow: HUD_TEXT_SHADOW,
          }}
        >
          {subtitle}
        </span>
      )}
      {keybindHint !== undefined && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <span
            style={{
              fontFamily: "var(--jg-font-body)",
              fontSize: 11,
              color: "var(--jg-text-dim)",
              textShadow: HUD_TEXT_SHADOW,
            }}
          >
            Press
          </span>
          <KeybindBadge label={keybindHint.keybind} size="sm" />
          <span
            style={{
              fontFamily: "var(--jg-font-body)",
              fontSize: 11,
              color: "var(--jg-text-dim)",
              textShadow: HUD_TEXT_SHADOW,
            }}
          >
            {keybindHint.label}
          </span>
        </div>
      )}
    </div>
  );
}
