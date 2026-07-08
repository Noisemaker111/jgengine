import { Fragment, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useLocalPlayerDead } from "../hooks";
import { AccentRule, clampFraction, hudTextShadow, HudLabel, KeybindBadge, slantBar, useGameUiKeyframes } from "./chrome";
import { useGameUiTheme } from "./theme";

export function MenuButton({
  label,
  keybind,
  onActivate,
  variant = "primary",
  width,
  className,
}: {
  label: string;
  keybind?: string;
  onActivate?: () => void;
  variant?: "primary" | "ghost" | "danger";
  width?: number | string;
  className?: string;
}) {
  const theme = useGameUiTheme();
  const [hovered, setHovered] = useState(false);
  const gradient =
    variant === "danger"
      ? `linear-gradient(180deg, ${theme.danger} 0%, #5c1410 100%)`
      : `linear-gradient(180deg, ${theme.accent} 0%, ${theme.accentDeep} 100%)`;
  const variantStyle: CSSProperties =
    variant === "ghost"
      ? {
          background: hovered ? "rgba(255,255,255,0.06)" : "transparent",
          border: `1px solid ${theme.edgeBright}`,
          color: theme.textPrimary,
        }
      : {
          background: gradient,
          border: "none",
          color: variant === "danger" ? theme.textPrimary : theme.surfaceDeep,
          filter: hovered ? "brightness(1.15)" : "brightness(1)",
        };
  return (
    <button
      type="button"
      className={className}
      data-jgui="menu-button"
      data-variant={variant}
      onClick={onActivate}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width,
        padding: "9px 26px",
        clipPath: slantBar(8),
        fontFamily: theme.fontDisplay,
        fontSize: 13,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.2em",
        cursor: "pointer",
        transition: "filter 0.15s ease, background 0.15s ease",
        ...variantStyle,
      }}
    >
      {label}
      {keybind !== undefined && <KeybindBadge label={keybind} />}
    </button>
  );
}

export interface MenuEntry {
  id: string;
  label: string;
  keybind?: string;
  disabled?: boolean;
}

export function MenuList({
  entries,
  selectedId,
  onSelect,
  onActivate,
  className,
}: {
  entries: readonly MenuEntry[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onActivate?: (id: string) => void;
  className?: string;
}) {
  const theme = useGameUiTheme();
  return (
    <div className={className} data-jgui="menu-list" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {entries.map((entry) => {
        const selected = entry.id === selectedId;
        return (
          <div key={entry.id} data-jgui="menu-row" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <button
              type="button"
              disabled={entry.disabled}
              onMouseEnter={() => {
                if (!entry.disabled) onSelect?.(entry.id);
              }}
              onFocus={() => {
                if (!entry.disabled) onSelect?.(entry.id);
              }}
              onClick={() => {
                if (!entry.disabled) onActivate?.(entry.id);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "transparent",
                border: "none",
                padding: "4px 0",
                textAlign: "left",
                cursor: entry.disabled === true ? "default" : "pointer",
                opacity: entry.disabled === true ? 0.35 : 1,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 0,
                  height: 0,
                  borderTop: "5px solid transparent",
                  borderBottom: "5px solid transparent",
                  borderLeft: `8px solid ${selected ? theme.accent : "transparent"}`,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: theme.fontDisplay,
                  fontSize: 15,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.24em",
                  color: selected ? theme.textPrimary : theme.textDim,
                  textShadow: selected ? `0 0 10px ${theme.accentGlow}, ${hudTextShadow()}` : hudTextShadow(),
                }}
              >
                {entry.label}
              </span>
              {entry.keybind !== undefined && <KeybindBadge label={entry.keybind} />}
            </button>
            {selected && (
              <span
                aria-hidden
                style={{
                  width: 28,
                  height: 2,
                  marginLeft: 18,
                  background: theme.accent,
                  boxShadow: `0 0 6px ${theme.accentGlow}`,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const OVERLAY_BACKGROUND = "radial-gradient(circle, transparent 0%, rgba(0,0,0,0.78) 100%), rgba(0,0,0,0.45)";
const DEATH_OVERLAY_BACKGROUND = "radial-gradient(circle, transparent 30%, rgba(90,8,8,0.55) 80%), rgba(0,0,0,0.45)";

function FullScreenOverlay({
  dataJgui,
  background,
  backdropFilter,
  backdrop,
  className,
  children,
}: {
  dataJgui: string;
  background: string;
  backdropFilter?: string;
  backdrop?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={className}
      data-jgui={dataJgui}
      style={{ position: "absolute", inset: 0, pointerEvents: "auto", overflow: "hidden" }}
    >
      {backdrop !== undefined && <div style={{ position: "absolute", inset: 0 }}>{backdrop}</div>}
      <div
        aria-hidden
        style={{ position: "absolute", inset: 0, background, backdropFilter, WebkitBackdropFilter: backdropFilter }}
      />
      <div style={{ position: "relative", height: "100%", width: "100%" }}>{children}</div>
    </div>
  );
}

export function TitleScreen({
  title,
  subtitle,
  entries,
  selectedId,
  onSelect,
  onActivate,
  version,
  backdrop,
  className,
}: {
  title: string;
  subtitle?: string;
  entries: readonly MenuEntry[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onActivate?: (id: string) => void;
  version?: string;
  backdrop?: ReactNode;
  className?: string;
}) {
  const theme = useGameUiTheme();
  return (
    <FullScreenOverlay dataJgui="title-screen" background={OVERLAY_BACKGROUND} backdrop={backdrop} className={className}>
      <div
        style={{
          position: "absolute",
          top: "14%",
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 40,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: theme.fontDisplay,
              fontWeight: 800,
              fontSize: "clamp(32px, 6vw, 52px)",
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: theme.textPrimary,
              textShadow: `0 4px 0 ${theme.accentDeep}, 0 8px 22px rgba(0,0,0,0.9), 0 0 32px ${theme.accentGlow}`,
            }}
          >
            {title}
          </h1>
          <AccentRule width={300} />
          {subtitle !== undefined && (
            <span
              style={{
                fontFamily: theme.fontBody,
                fontSize: 13,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: theme.textDim,
              }}
            >
              {subtitle}
            </span>
          )}
        </div>
        <MenuList entries={entries} selectedId={selectedId} onSelect={onSelect} onActivate={onActivate} />
      </div>
      {version !== undefined && (
        <span
          style={{
            position: "absolute",
            bottom: 16,
            right: 20,
            fontFamily: theme.fontNumeric,
            fontSize: 10,
            color: theme.textDim,
          }}
        >
          {version}
        </span>
      )}
    </FullScreenOverlay>
  );
}

export function PauseScreen({
  entries,
  selectedId,
  onSelect,
  onActivate,
  title = "Paused",
  open = true,
  className,
}: {
  entries: readonly MenuEntry[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onActivate?: (id: string) => void;
  title?: string;
  open?: boolean;
  className?: string;
}) {
  const theme = useGameUiTheme();
  if (!open) return null;
  return (
    <FullScreenOverlay
      dataJgui="pause-screen"
      background={OVERLAY_BACKGROUND}
      backdropFilter="blur(3px)"
      className={className}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: theme.fontDisplay,
              fontWeight: 800,
              fontSize: 30,
              textTransform: "uppercase",
              letterSpacing: "0.3em",
              color: theme.textPrimary,
              textShadow: hudTextShadow(),
            }}
          >
            {title}
          </h1>
          <AccentRule width={200} />
        </div>
        <MenuList entries={entries} selectedId={selectedId} onSelect={onSelect} onActivate={onActivate} />
      </div>
    </FullScreenOverlay>
  );
}

export function DeathScreenView({
  title = "You Died",
  subtitle,
  respawnLabel = "Respawn",
  respawnKeybind,
  onRespawn,
  respawnAvailableIn,
  className,
}: {
  title?: string;
  subtitle?: string;
  respawnLabel?: string;
  respawnKeybind?: string;
  onRespawn?: () => void;
  respawnAvailableIn?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  const countingDown = respawnAvailableIn !== undefined && respawnAvailableIn > 0;
  return (
    <FullScreenOverlay dataJgui="death-screen" background={DEATH_OVERLAY_BACKGROUND} className={className}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: theme.fontDisplay,
            fontWeight: 800,
            fontSize: 46,
            textTransform: "uppercase",
            letterSpacing: "0.42em",
            color: theme.danger,
            textShadow: "0 4px 0 rgba(0,0,0,0.9), 0 10px 30px rgba(0,0,0,0.95)",
            animation: "jgui-pop 0.9s ease-out",
          }}
        >
          {title}
        </h1>
        {subtitle !== undefined && (
          <span style={{ fontFamily: theme.fontBody, fontSize: 13, color: theme.textDim }}>{subtitle}</span>
        )}
        {countingDown ? (
          <span style={{ fontFamily: theme.fontNumeric, fontSize: 18, fontWeight: 700, color: theme.warning }}>
            {`Respawn in ${Math.ceil(respawnAvailableIn ?? 0)}s`}
          </span>
        ) : (
          <MenuButton label={respawnLabel} keybind={respawnKeybind} onActivate={onRespawn} variant="danger" />
        )}
      </div>
    </FullScreenOverlay>
  );
}

export function DeathOverlayBound({
  statId = "health",
  title,
  subtitle,
  respawnLabel,
  respawnKeybind,
  onRespawn,
  respawnAvailableIn,
  className,
}: {
  statId?: string;
  title?: string;
  subtitle?: string;
  respawnLabel?: string;
  respawnKeybind?: string;
  onRespawn?: () => void;
  respawnAvailableIn?: number;
  className?: string;
}) {
  const dead = useLocalPlayerDead(statId);
  if (!dead) return null;
  return (
    <DeathScreenView
      title={title}
      subtitle={subtitle}
      respawnLabel={respawnLabel}
      respawnKeybind={respawnKeybind}
      onRespawn={onRespawn}
      respawnAvailableIn={respawnAvailableIn}
      className={className}
    />
  );
}

export interface ResultLine {
  label: string;
  value: string | number;
  accent?: boolean;
}

export function ResultsScreen({
  outcome,
  title,
  lines,
  entries,
  selectedId,
  onSelect,
  onActivate,
  className,
}: {
  outcome: "victory" | "defeat" | "draw";
  title?: string;
  lines?: readonly ResultLine[];
  entries?: readonly MenuEntry[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onActivate?: (id: string) => void;
  className?: string;
}) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  const outcomeColor = outcome === "victory" ? theme.accent : outcome === "defeat" ? theme.danger : theme.textDim;
  const defaultTitle = outcome === "victory" ? "Victory" : outcome === "defeat" ? "Defeat" : "Draw";
  return (
    <FullScreenOverlay dataJgui="results-screen" background={OVERLAY_BACKGROUND} className={className}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: theme.fontDisplay,
            fontWeight: 800,
            fontSize: 44,
            textTransform: "uppercase",
            letterSpacing: "0.32em",
            color: outcomeColor,
            textShadow: hudTextShadow(),
            animation: "jgui-slide-down 0.5s ease-out",
          }}
        >
          {title ?? defaultTitle}
        </h1>
        <AccentRule width={320} />
        {lines !== undefined && lines.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", columnGap: 40, rowGap: 10 }}>
            {lines.map((line, index) => {
              const color = line.accent === true ? theme.accent : theme.textPrimary;
              const delay = `${index * 90}ms`;
              return (
                <Fragment key={`${line.label}-${index}`}>
                  <span
                    style={{
                      fontFamily: theme.fontDisplay,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.24em",
                      textTransform: "uppercase",
                      color: theme.textDim,
                      textShadow: hudTextShadow(),
                      animation: "jgui-slide-up 0.4s ease-out",
                      animationDelay: delay,
                      animationFillMode: "backwards",
                    }}
                  >
                    {line.label}
                  </span>
                  <span
                    style={{
                      fontFamily: theme.fontNumeric,
                      fontSize: 16,
                      fontWeight: 700,
                      color,
                      textAlign: "right",
                      animation: "jgui-slide-up 0.4s ease-out",
                      animationDelay: delay,
                      animationFillMode: "backwards",
                    }}
                  >
                    {line.value}
                  </span>
                </Fragment>
              );
            })}
          </div>
        )}
        {entries !== undefined && (
          <MenuList entries={entries} selectedId={selectedId} onSelect={onSelect} onActivate={onActivate} />
        )}
      </div>
    </FullScreenOverlay>
  );
}

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
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  const determinate = fraction !== undefined;
  const clamped = determinate ? clampFraction(fraction) : 0;
  return (
    <div
      className={className}
      data-jgui="loading-screen"
      style={{
        position: "absolute",
        inset: 0,
        background: theme.surfaceDeep,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        pointerEvents: "auto",
      }}
    >
      {title !== undefined && (
        <span
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: theme.textDim,
            textShadow: hudTextShadow(),
          }}
        >
          {title}
        </span>
      )}
      <div
        style={{
          position: "relative",
          width: "min(520px, 60%)",
          height: 8,
          clipPath: slantBar(6),
          background: theme.surfaceDeep,
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.8)",
          overflow: "hidden",
        }}
      >
        {determinate ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${clamped * 100}%`,
              background: `linear-gradient(90deg, ${theme.accentDeep} 0%, ${theme.accent} 100%)`,
              boxShadow: `0 0 10px ${theme.accentGlow}`,
              transition: "width 0.2s ease-out",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)`,
              backgroundSize: "160px 100%",
              backgroundRepeat: "no-repeat",
              animation: "jgui-sheen 1.2s linear infinite",
            }}
          />
        )}
      </div>
      {tip !== undefined && (
        <span
          key={tip}
          style={{
            position: "absolute",
            bottom: 48,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: theme.fontBody,
            fontSize: 12,
            fontStyle: "italic",
            color: theme.textDim,
            animation: "jgui-slide-up 0.3s ease-out",
          }}
        >
          {tip}
        </span>
      )}
    </div>
  );
}

export function SliderRow({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  format = (input: number) => `${Math.round(clampFraction((input - min) / (max - min)) * 100)}%`,
  width,
  className,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  format?: (value: number) => string;
  width?: number | string;
  className?: string;
}) {
  const theme = useGameUiTheme();
  const trackRef = useRef<HTMLDivElement>(null);
  const fraction = clampFraction((value - min) / (max - min));

  function updateFromClientX(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return;
    const raw = clampFraction((clientX - rect.left) / rect.width);
    const rawValue = min + raw * (max - min);
    const stepped = Math.round(rawValue / step) * step;
    onChange?.(Math.min(max, Math.max(min, stepped)));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromClientX(event.clientX);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.buttons !== 1) return;
    updateFromClientX(event.clientX);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div
      className={className}
      data-jgui="slider-row"
      style={{ width, display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <HudLabel>{label}</HudLabel>
        <span style={{ fontFamily: theme.fontNumeric, fontSize: 11, fontWeight: 700, color: theme.textPrimary }}>
          {format(value)}
        </span>
      </div>
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          position: "relative",
          height: 6,
          clipPath: slantBar(3),
          background: theme.surfaceDeep,
          boxShadow: "inset 0 1px 3px rgba(0,0,0,0.85)",
          cursor: "pointer",
          touchAction: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${fraction * 100}%`,
            background: `linear-gradient(90deg, ${theme.accentDeep} 0%, ${theme.accent} 100%)`,
          }}
        />
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: `calc(${fraction * 100}% - 5px)`,
            width: 10,
            height: 10,
            transform: "translateY(-50%) rotate(45deg)",
            background: theme.accent,
            boxShadow: `0 0 8px ${theme.accentGlow}`,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

export function ToggleRow({
  label,
  value,
  onChange,
  onLabel = "On",
  offLabel = "Off",
  className,
}: {
  label: string;
  value: boolean;
  onChange?: (value: boolean) => void;
  onLabel?: string;
  offLabel?: string;
  className?: string;
}) {
  const theme = useGameUiTheme();
  function segmentStyle(active: boolean): CSSProperties {
    return {
      padding: "4px 14px",
      clipPath: slantBar(4),
      fontFamily: theme.fontDisplay,
      fontSize: 9,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      background: active ? `linear-gradient(180deg, ${theme.accent} 0%, ${theme.accentDeep} 100%)` : "transparent",
      color: active ? theme.surfaceDeep : theme.textDim,
      border: active ? "none" : `1px solid ${theme.edge}`,
    };
  }
  return (
    <div
      className={className}
      data-jgui="toggle-row"
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
    >
      <HudLabel>{label}</HudLabel>
      <button
        type="button"
        onClick={() => onChange?.(!value)}
        style={{ display: "flex", border: "none", background: "transparent", padding: 0, cursor: "pointer", gap: 2 }}
      >
        <span style={segmentStyle(!value)}>{offLabel}</span>
        <span style={segmentStyle(value)}>{onLabel}</span>
      </button>
    </div>
  );
}

export function SettingsGroup({
  title,
  children,
  width,
  className,
}: {
  title: string;
  children?: ReactNode;
  width?: number | string;
  className?: string;
}) {
  return (
    <div
      className={className}
      data-jgui="settings-group"
      style={{ width, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <HudLabel>{title}</HudLabel>
        <AccentRule width={60} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
    </div>
  );
}
