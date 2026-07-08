import type { ReactNode } from "react";
import type { EventMeter } from "@jgengine/core/stats/eventMeter";
import { useCurrency, useEventMeter } from "../hooks";
import {
  AccentRule,
  HudLabel,
  clampFraction,
  formatTimer,
  hudTextShadow,
  padScore,
  slantBar,
  useGameUiKeyframes,
} from "./chrome";
import { useGameUiTheme } from "./theme";
import { ChargeMeter } from "./bars";

function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1000) return String(Math.floor(value));
  const units: readonly { value: number; suffix: string }[] = [
    { value: 1_000_000_000, suffix: "b" },
    { value: 1_000_000, suffix: "m" },
    { value: 1_000, suffix: "k" },
  ];
  for (const unit of units) {
    if (abs >= unit.value) {
      const scaled = value / unit.value;
      const rounded = Math.round(scaled * 10) / 10;
      return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}${unit.suffix}`;
    }
  }
  return String(Math.floor(value));
}

function ordinalSuffix(position: number): string {
  const rounded = Math.floor(position);
  const mod100 = rounded % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (rounded % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function ScoreReadout({
  value,
  digits = 6,
  label = "Score",
  size = "md",
  className,
}: {
  value: number;
  digits?: number;
  label?: string;
  size?: "md" | "lg";
  className?: string;
}) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  const padded = padScore(value, digits);
  const firstSignificant = padded.search(/[1-9]/);
  const splitAt = firstSignificant === -1 ? padded.length : firstSignificant;
  const leading = padded.slice(0, splitAt);
  const significant = padded.slice(splitAt);
  const fontSize = size === "lg" ? 32 : 22;
  return (
    <div
      className={className}
      data-jgui="score-readout"
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}
    >
      <HudLabel>{label}</HudLabel>
      <span
        key={value}
        style={{
          fontFamily: theme.fontNumeric,
          fontSize,
          fontWeight: 800,
          letterSpacing: "0.02em",
          textShadow: `${hudTextShadow()}, 0 0 10px ${theme.accentGlow}`,
          animation: "jgui-pop 0.18s ease-out",
        }}
      >
        {leading.length > 0 && <span style={{ color: theme.textDim }}>{leading}</span>}
        <span style={{ color: theme.textPrimary }}>{significant}</span>
      </span>
    </div>
  );
}

function TimerTick({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 4,
        height: 4,
        background: color,
        transform: "rotate(45deg)",
        flexShrink: 0,
      }}
    />
  );
}

export function MatchTimer({
  seconds,
  warningAt = 30,
  criticalAt = 10,
  label,
  size = "md",
  className,
}: {
  seconds: number;
  warningAt?: number;
  criticalAt?: number;
  label?: string;
  size?: "md" | "lg";
  className?: string;
}) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  const isCritical = seconds <= criticalAt;
  const isWarning = seconds <= warningAt;
  const color = isCritical ? theme.danger : isWarning ? theme.warning : theme.textPrimary;
  const fontSize = size === "lg" ? 36 : 24;
  return (
    <div
      className={className}
      data-jgui="match-timer"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
    >
      {label !== undefined && <HudLabel>{label}</HudLabel>}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <TimerTick color={color} />
        <span
          style={{
            fontFamily: theme.fontNumeric,
            fontSize,
            fontWeight: 800,
            color,
            textShadow: hudTextShadow(),
            animation: isCritical ? "jgui-pulse 1s infinite" : "none",
          }}
        >
          {formatTimer(seconds)}
        </span>
        <TimerTick color={color} />
      </div>
    </div>
  );
}

export function CountdownPips({ value, className }: { value: number; className?: string }) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  if (value <= 0) return null;
  return (
    <div
      className={className}
      data-jgui="countdown-pips"
      style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <span
        key={value}
        style={{
          fontFamily: theme.fontDisplay,
          fontSize: 72,
          fontWeight: 800,
          letterSpacing: "0.1em",
          color: theme.accent,
          textShadow: `0 2px 4px rgba(0,0,0,0.9), 0 0 30px ${theme.accentGlow}`,
          animation: "jgui-pop 0.3s ease-out",
        }}
      >
        {Math.ceil(value)}
      </span>
    </div>
  );
}

export function WaveIndicator({
  wave,
  totalWaves,
  remaining,
  remainingLabel = "hostiles",
  className,
}: {
  wave: number;
  totalWaves?: number;
  remaining?: number;
  remainingLabel?: string;
  className?: string;
}) {
  const theme = useGameUiTheme();
  return (
    <div
      className={className}
      data-jgui="wave-indicator"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
    >
      <HudLabel>Wave</HudLabel>
      <AccentRule width={80} />
      <span
        style={{
          fontFamily: theme.fontNumeric,
          fontSize: 30,
          fontWeight: 800,
          color: theme.textPrimary,
          textShadow: hudTextShadow(),
        }}
      >
        {wave}
        {totalWaves !== undefined && (
          <span style={{ fontSize: 14, color: theme.textDim }}> / {totalWaves}</span>
        )}
      </span>
      {remaining !== undefined && (
        <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span
            style={{
              fontFamily: theme.fontNumeric,
              fontSize: 13,
              fontWeight: 700,
              color: theme.danger,
              textShadow: hudTextShadow(),
            }}
          >
            {remaining}
          </span>
          <span
            style={{
              fontFamily: theme.fontDisplay,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: theme.textDim,
            }}
          >
            {remainingLabel}
          </span>
        </span>
      )}
    </div>
  );
}

export function AmmoCounter({
  magazine,
  reserve,
  lowAt = 5,
  reloading = false,
  icon,
  className,
}: {
  magazine: number;
  reserve?: number;
  lowAt?: number;
  reloading?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  const isLow = magazine <= lowAt;
  return (
    <div
      className={className}
      data-jgui="ammo-counter"
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}
    >
      {reloading && (
        <span
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: theme.warning,
            textShadow: hudTextShadow(),
            animation: "jgui-pulse 1s infinite",
          }}
        >
          Reloading
        </span>
      )}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        {icon !== undefined && (
          <span
            style={{
              width: 20,
              height: 20,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: theme.textDim,
            }}
          >
            {icon}
          </span>
        )}
        <span
          style={{
            fontFamily: theme.fontNumeric,
            fontSize: 38,
            fontWeight: 800,
            color: isLow ? theme.danger : theme.textPrimary,
            textShadow: hudTextShadow(),
            animation: isLow ? "jgui-pulse 1s infinite" : "none",
          }}
        >
          {magazine}
        </span>
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 2,
            height: 26,
            background: theme.edgeBright,
            transform: "skewX(-18deg)",
          }}
        />
        {reserve !== undefined && (
          <span
            style={{
              fontFamily: theme.fontNumeric,
              fontSize: 16,
              fontWeight: 700,
              color: theme.textDim,
              textShadow: hudTextShadow(),
            }}
          >
            {reserve}
          </span>
        )}
      </div>
    </div>
  );
}

function CoinGlyph({ className }: { className?: string }) {
  const theme = useGameUiTheme();
  return (
    <svg className={className} viewBox="0 0 24 24" width={16} height={16} aria-hidden>
      <circle cx="12" cy="12" r="10" fill={theme.accent} stroke={theme.accentDeep} strokeWidth={1.5} />
      <circle cx="12" cy="12" r="5.5" fill="none" stroke={theme.accentDeep} strokeWidth={1.2} />
    </svg>
  );
}

export function CurrencyDisplay({
  amount,
  symbol,
  name,
  compact = false,
  className,
}: {
  amount: number;
  symbol?: ReactNode;
  name?: string;
  compact?: boolean;
  className?: string;
}) {
  const theme = useGameUiTheme();
  return (
    <div
      className={className}
      data-jgui="currency-display"
      style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}
    >
      <span style={{ display: "inline-flex", alignItems: "center" }}>{symbol ?? <CoinGlyph />}</span>
      <span
        style={{
          fontFamily: theme.fontNumeric,
          fontSize: 15,
          fontWeight: 700,
          color: theme.textPrimary,
          textShadow: hudTextShadow(),
        }}
      >
        {compact ? compactNumber(amount) : Math.floor(amount)}
      </span>
      {name !== undefined && (
        <span
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: theme.textDim,
          }}
        >
          {name}
        </span>
      )}
    </div>
  );
}

export function WalletCurrencyDisplay({
  currencyId,
  symbol,
  name,
  compact,
  className,
}: {
  currencyId: string;
  symbol?: ReactNode;
  name?: string;
  compact?: boolean;
  className?: string;
}) {
  const amount = useCurrency(currencyId);
  return <CurrencyDisplay amount={amount} symbol={symbol} name={name} compact={compact} className={className} />;
}

export function ObjectiveChannel({
  progress,
  label,
  contested = false,
  owner = "none",
  width = 200,
  className,
}: {
  progress: number;
  label?: string;
  contested?: boolean;
  owner?: "friendly" | "hostile" | "none";
  width?: number | string;
  className?: string;
}) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  const clamped = clampFraction(progress);
  const fillColor = owner === "friendly" ? theme.friendly : owner === "hostile" ? theme.hostile : theme.accent;
  return (
    <div className={className} data-jgui="objective-channel" data-owner={owner} style={{ width }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
        {label !== undefined ? <HudLabel>{label}</HudLabel> : <span />}
        <span
          style={{
            fontFamily: theme.fontNumeric,
            fontSize: 12,
            fontWeight: 700,
            color: theme.textPrimary,
            textShadow: hudTextShadow(),
          }}
        >
          {Math.round(clamped * 100)}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
        style={{
          position: "relative",
          height: 9,
          clipPath: slantBar(6),
          background: `linear-gradient(180deg, ${theme.surfaceDeep} 0%, ${theme.surface} 100%)`,
          boxShadow: "inset 0 2px 3px rgba(0,0,0,0.8)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${clamped * 100}%`,
            background: `linear-gradient(90deg, ${fillColor}aa 0%, ${fillColor} 100%)`,
            boxShadow: `0 0 8px ${fillColor}99`,
            transition: "width 0.16s ease-out",
            animation: contested ? "jgui-pulse 1s infinite" : "none",
          }}
        />
      </div>
    </div>
  );
}

export interface TeamScore {
  name?: string;
  score: number;
  color?: string;
}

export function TeamScoreBoard({
  left,
  right,
  roundLabel,
  className,
}: {
  left: TeamScore;
  right: TeamScore;
  roundLabel?: string;
  className?: string;
}) {
  const theme = useGameUiTheme();
  return (
    <div
      className={className}
      data-jgui="team-score-board"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span
            style={{
              fontFamily: theme.fontNumeric,
              fontSize: 26,
              fontWeight: 800,
              color: left.color ?? theme.friendly,
              textShadow: hudTextShadow(),
            }}
          >
            {left.score}
          </span>
          {left.name !== undefined && (
            <span
              style={{
                fontFamily: theme.fontDisplay,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: theme.textDim,
                textShadow: hudTextShadow(),
              }}
            >
              {left.name}
            </span>
          )}
        </div>
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            transform: "rotate(45deg)",
            background: theme.accent,
            boxShadow: `0 0 8px ${theme.accentGlow}`,
            flexShrink: 0,
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span
            style={{
              fontFamily: theme.fontNumeric,
              fontSize: 26,
              fontWeight: 800,
              color: right.color ?? theme.hostile,
              textShadow: hudTextShadow(),
            }}
          >
            {right.score}
          </span>
          {right.name !== undefined && (
            <span
              style={{
                fontFamily: theme.fontDisplay,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: theme.textDim,
                textShadow: hudTextShadow(),
              }}
            >
              {right.name}
            </span>
          )}
        </div>
      </div>
      {roundLabel !== undefined && (
        <span
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: theme.textDim,
            textShadow: hudTextShadow(),
          }}
        >
          {roundLabel}
        </span>
      )}
    </div>
  );
}

export function RacePosition({
  position,
  total,
  lap,
  laps,
  className,
}: {
  position: number;
  total?: number;
  lap?: number;
  laps?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  return (
    <div
      className={className}
      data-jgui="race-position"
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}
    >
      <span
        style={{
          fontFamily: theme.fontNumeric,
          fontSize: 44,
          fontWeight: 800,
          color: theme.textPrimary,
          textShadow: hudTextShadow(),
        }}
      >
        {position}
        <span
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 16,
            fontWeight: 800,
            color: theme.accent,
            verticalAlign: "super",
          }}
        >
          {ordinalSuffix(position)}
        </span>
        {total !== undefined && (
          <span style={{ fontFamily: theme.fontNumeric, fontSize: 16, color: theme.textDim }}> / {total}</span>
        )}
      </span>
      {lap !== undefined && (
        <HudLabel>
          Lap {lap}
          {laps !== undefined ? `/${laps}` : ""}
        </HudLabel>
      )}
    </div>
  );
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDegrees: number): { x: number; y: number } {
  const angleRadians = ((angleDegrees - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(angleRadians), y: cy + radius * Math.sin(angleRadians) };
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

export function ArcGauge({
  fraction,
  label,
  readout,
  size = 110,
  tone = "accent",
  sweepDegrees = 240,
  className,
}: {
  fraction: number;
  label?: string;
  readout?: string;
  size?: number;
  tone?: "accent" | "danger" | "warning";
  sweepDegrees?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  const clamped = clampFraction(fraction);
  const toneColor = tone === "danger" ? theme.danger : tone === "warning" ? theme.warning : theme.accent;
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = size / 12;
  const radius = size / 2 - strokeWidth;
  const startAngle = -sweepDegrees / 2;
  const endAngle = sweepDegrees / 2;
  const sweepAngle = startAngle + clamped * sweepDegrees;
  const ticks = Array.from({ length: 11 }, (_, index) => index * 0.1).filter((tick) => tick <= 1);
  return (
    <div
      className={className}
      data-jgui="arc-gauge"
      data-tone={tone}
      style={{ position: "relative", width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <path
          d={describeArc(cx, cy, radius, startAngle, endAngle)}
          fill="none"
          stroke={theme.edge}
          strokeOpacity={0.4}
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
        />
        {ticks.map((tick) => {
          const angle = startAngle + tick * sweepDegrees;
          const inner = polarToCartesian(cx, cy, radius - strokeWidth / 2 - 2, angle);
          const outer = polarToCartesian(cx, cy, radius + strokeWidth / 2 + 2, angle);
          return (
            <line
              key={tick}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={theme.edge}
              strokeWidth={1}
            />
          );
        })}
        {clamped > 0 && (
          <path
            d={describeArc(cx, cy, radius, startAngle, sweepAngle)}
            fill="none"
            stroke={toneColor}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            style={{ filter: `drop-shadow(0 0 6px ${toneColor})` }}
          />
        )}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
        }}
      >
        {readout !== undefined && (
          <span
            style={{
              fontFamily: theme.fontNumeric,
              fontSize: size / 4.5,
              fontWeight: 800,
              color: theme.textPrimary,
              textShadow: hudTextShadow(),
            }}
          >
            {readout}
          </span>
        )}
        {label !== undefined && <HudLabel>{label}</HudLabel>}
      </div>
    </div>
  );
}

export function EventChargeMeter({
  meter,
  label,
  width = 180,
  className,
}: {
  meter: EventMeter;
  label?: string;
  width?: number | string;
  className?: string;
}) {
  const view = useEventMeter(meter);
  return <ChargeMeter fraction={view.fraction} ready={view.ready} label={label} width={width} className={className} />;
}
