import type { CSSProperties, ReactNode } from "react";
import { useEntityStat } from "../hooks";
import {
  chamfer,
  clampFraction,
  hudTextShadow,
  slantBar,
  useGameUiKeyframes,
} from "./chrome";
import { useGameUiTheme, vitalColors, type VitalTone } from "./theme";

export interface VitalValue {
  current: number;
  max: number;
  min?: number;
}

function vitalFraction(value: VitalValue): number {
  const min = value.min ?? 0;
  const range = value.max - min;
  if (range <= 0) return 0;
  return clampFraction((value.current - min) / range);
}

export function VitalBar({
  value,
  tone = "health",
  label,
  width = 220,
  height = 16,
  lean = 7,
  segments = 0,
  showNumbers = true,
  className,
  style,
}: {
  value: VitalValue;
  tone?: VitalTone;
  label?: string;
  width?: number | string;
  height?: number;
  lean?: number;
  segments?: number;
  showNumbers?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const theme = useGameUiTheme();
  const colors = vitalColors(theme, tone);
  const fraction = vitalFraction(value);
  const percent = `${fraction * 100}%`;
  return (
    <div className={className} data-jgui="vital-bar" data-tone={tone} style={{ width, ...style }}>
      {(label !== undefined || showNumbers) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 2,
            paddingLeft: lean,
          }}
        >
          <span
            style={{
              fontFamily: theme.fontDisplay,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: theme.textDim,
              textShadow: hudTextShadow(),
            }}
          >
            {label ?? ""}
          </span>
          {showNumbers && (
            <span
              style={{
                fontFamily: theme.fontNumeric,
                fontSize: 11,
                fontWeight: 700,
                color: theme.textPrimary,
                textShadow: hudTextShadow(),
              }}
            >
              {Math.ceil(value.current)}
              <span style={{ color: theme.textDim }}> / {value.max}</span>
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={value.min ?? 0}
        aria-valuemax={value.max}
        aria-valuenow={value.current}
        style={{
          position: "relative",
          height,
          clipPath: slantBar(lean),
          background: `linear-gradient(180deg, ${theme.surfaceDeep} 0%, ${theme.surface} 100%)`,
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.8)",
          overflow: "hidden",
        }}
      >
        <div
          data-ghost
          style={{
            position: "absolute",
            inset: 0,
            width: percent,
            background: theme.danger,
            opacity: 0.5,
            transition: "width 0.7s ease 0.28s",
          }}
        />
        <div
          data-fill
          style={{
            position: "absolute",
            inset: 0,
            width: percent,
            background: `linear-gradient(180deg, ${colors.fill} 0%, ${colors.deep} 100%)`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35)`,
            transition: "width 0.14s ease-out",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              segments > 1
                ? `repeating-linear-gradient(90deg, transparent 0, transparent calc(${100 / segments}% - 1px), rgba(0,0,0,0.55) calc(${100 / segments}% - 1px), rgba(0,0,0,0.55) ${100 / segments}%)`
                : "none",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 45%)",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

export function EntityVitalBar({
  instanceId,
  statId,
  tone,
  label,
  width,
  height,
  lean,
  segments,
  showNumbers,
  className,
}: {
  instanceId: string;
  statId: string;
  tone?: VitalTone;
  label?: string;
  width?: number | string;
  height?: number;
  lean?: number;
  segments?: number;
  showNumbers?: boolean;
  className?: string;
}) {
  const stat = useEntityStat(instanceId, statId);
  if (stat === null) return null;
  return (
    <VitalBar
      value={{ current: stat.current, max: stat.max, min: stat.min }}
      tone={tone}
      label={label}
      width={width}
      height={height}
      lean={lean}
      segments={segments}
      showNumbers={showNumbers}
      className={className}
    />
  );
}

function DefaultPortrait({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill={color} aria-hidden>
      <circle cx="12" cy="8.4" r="4.1" />
      <path d="M4 21c0-4.4 3.6-7.2 8-7.2s8 2.8 8 7.2v1H4z" />
    </svg>
  );
}

function LevelRosette({ level }: { level: number }) {
  const theme = useGameUiTheme();
  return (
    <span
      data-jgui="level-rosette"
      style={{
        position: "absolute",
        bottom: -7,
        left: -7,
        width: 22,
        height: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: "rotate(45deg)",
        background: `linear-gradient(135deg, ${theme.accentDeep} 0%, ${theme.surfaceDeep} 100%)`,
        border: `1px solid ${theme.accent}`,
        boxShadow: `0 0 8px ${theme.accentGlow}`,
      }}
    >
      <span
        style={{
          transform: "rotate(-45deg)",
          fontFamily: theme.fontNumeric,
          fontSize: 10,
          fontWeight: 700,
          color: theme.accent,
        }}
      >
        {level}
      </span>
    </span>
  );
}

export interface UnitVital {
  tone: VitalTone;
  value: VitalValue;
}

export function UnitFrame({
  name,
  level,
  vitals,
  portrait,
  reverse = false,
  nameColor,
  width = 260,
  className,
  children,
}: {
  name: string;
  level?: number;
  vitals: readonly UnitVital[];
  portrait?: ReactNode;
  reverse?: boolean;
  nameColor?: string;
  width?: number;
  className?: string;
  children?: ReactNode;
}) {
  const theme = useGameUiTheme();
  const portraitSize = 52;
  return (
    <div
      className={className}
      data-jgui="unit-frame"
      style={{
        display: "flex",
        flexDirection: reverse ? "row-reverse" : "row",
        alignItems: "flex-start",
        gap: 8,
        width,
      }}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div
          style={{
            width: portraitSize,
            height: portraitSize,
            clipPath: chamfer(6),
            background: `linear-gradient(180deg, ${theme.surface} 0%, ${theme.surfaceDeep} 100%)`,
            border: `1px solid ${theme.edgeBright}`,
            boxShadow: `inset 0 0 12px rgba(0,0,0,0.7)`,
            padding: 5,
          }}
        >
          {portrait ?? <DefaultPortrait color={theme.textDim} />}
        </div>
        {level !== undefined && <LevelRosette level={level} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: nameColor ?? theme.textPrimary,
            textShadow: hudTextShadow(),
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            textAlign: reverse ? "right" : "left",
          }}
        >
          {name}
        </span>
        {vitals.map((vital, index) => (
          <VitalBar
            key={`${vital.tone}-${index}`}
            value={vital.value}
            tone={vital.tone}
            width="100%"
            height={index === 0 ? 14 : 8}
            showNumbers={index === 0}
            lean={5}
          />
        ))}
        {children}
      </div>
    </div>
  );
}

export type TargetRelationTone = "hostile" | "friendly" | "neutral";

export function TargetFrame({
  name,
  level,
  vitals,
  relation = "hostile",
  portrait,
  width,
  className,
  children,
}: {
  name: string;
  level?: number;
  vitals: readonly UnitVital[];
  relation?: TargetRelationTone;
  portrait?: ReactNode;
  width?: number;
  className?: string;
  children?: ReactNode;
}) {
  const theme = useGameUiTheme();
  const relationColor =
    relation === "hostile" ? theme.hostile : relation === "friendly" ? theme.friendly : theme.neutral;
  return (
    <UnitFrame
      name={name}
      level={level}
      vitals={vitals}
      portrait={portrait}
      reverse
      nameColor={relationColor}
      width={width}
      className={className}
    >
      {children}
    </UnitFrame>
  );
}

export function CastBar({
  fraction,
  label,
  width = 240,
  interrupted = false,
  className,
}: {
  fraction: number;
  label?: string;
  width?: number | string;
  interrupted?: boolean;
  className?: string;
}) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  const clamped = clampFraction(fraction);
  const fillColor = interrupted ? theme.danger : theme.accent;
  return (
    <div className={className} data-jgui="cast-bar" style={{ width }}>
      <div
        style={{
          position: "relative",
          height: 10,
          clipPath: slantBar(5),
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
            background: `linear-gradient(180deg, ${fillColor} 0%, ${interrupted ? theme.danger : theme.accentDeep} 100%)`,
            transition: "width 0.05s linear",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `calc(${clamped * 100}% - 3px)`,
            width: 6,
            background: "rgba(255,255,255,0.85)",
            filter: "blur(2px)",
            opacity: clamped > 0 && clamped < 1 ? 1 : 0,
          }}
        />
      </div>
      {label !== undefined && (
        <div
          style={{
            marginTop: 3,
            textAlign: "center",
            fontFamily: theme.fontBody,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            color: interrupted ? theme.danger : theme.textPrimary,
            textShadow: hudTextShadow(),
          }}
        >
          {interrupted ? "Interrupted" : label}
        </div>
      )}
    </div>
  );
}

function Finial({ flip }: { flip?: boolean }) {
  const theme = useGameUiTheme();
  return (
    <span
      aria-hidden
      style={{
        width: 10,
        height: 10,
        transform: `rotate(45deg) ${flip === true ? "scale(-1)" : ""}`,
        background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accentDeep} 100%)`,
        boxShadow: `0 0 6px ${theme.accentGlow}`,
        flexShrink: 0,
      }}
    />
  );
}

export function BossBar({
  name,
  value,
  subLabel,
  phases = [],
  width = 460,
  className,
}: {
  name: string;
  value: VitalValue;
  subLabel?: string;
  phases?: readonly number[];
  width?: number | string;
  className?: string;
}) {
  const theme = useGameUiTheme();
  const fraction = vitalFraction(value);
  return (
    <div
      className={className}
      data-jgui="boss-bar"
      style={{ width, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
    >
      <span
        style={{
          fontFamily: theme.fontDisplay,
          fontSize: 17,
          fontWeight: 700,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: theme.textPrimary,
          textShadow: `0 2px 4px rgba(0,0,0,0.95), 0 0 14px ${theme.accentGlow}`,
        }}
      >
        {name}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
        <Finial />
        <div
          role="progressbar"
          aria-valuemin={value.min ?? 0}
          aria-valuemax={value.max}
          aria-valuenow={value.current}
          style={{
            position: "relative",
            flex: 1,
            height: 13,
            background: `linear-gradient(180deg, ${theme.surfaceDeep} 0%, ${theme.surface} 100%)`,
            border: `1px solid ${theme.edge}`,
            boxShadow: "inset 0 2px 4px rgba(0,0,0,0.85)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${fraction * 100}%`,
              background: `linear-gradient(180deg, ${theme.hostile} 0%, #5c1410 100%)`,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3)",
              transition: "width 0.25s ease-out",
            }}
          />
          {phases.map((phase) => (
            <span
              key={phase}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${clampFraction(phase) * 100}%`,
                width: 2,
                background: theme.accent,
                boxShadow: `0 0 4px ${theme.accentGlow}`,
              }}
            />
          ))}
        </div>
        <Finial flip />
      </div>
      {subLabel !== undefined && (
        <span
          style={{
            fontFamily: theme.fontBody,
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: theme.textDim,
            textShadow: hudTextShadow(),
          }}
        >
          {subLabel}
        </span>
      )}
    </div>
  );
}

export function ResourceOrb({
  fraction,
  tone = "health",
  size = 84,
  label,
  className,
}: {
  fraction: number;
  tone?: VitalTone;
  size?: number;
  label?: string;
  className?: string;
}) {
  const theme = useGameUiTheme();
  const colors = vitalColors(theme, tone);
  const clamped = clampFraction(fraction);
  return (
    <div
      className={className}
      data-jgui="resource-orb"
      data-tone={tone}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
    >
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
        style={{
          position: "relative",
          width: size,
          height: size,
          borderRadius: "50%",
          background: `radial-gradient(circle at 32% 28%, ${theme.surface} 0%, ${theme.surfaceDeep} 70%)`,
          border: `2px solid ${theme.edgeBright}`,
          boxShadow: `inset 0 0 ${size / 5}px rgba(0,0,0,0.85), 0 4px 12px rgba(0,0,0,0.6)`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "-25%",
            right: "-25%",
            bottom: 0,
            height: `${clamped * 100}%`,
            background: `radial-gradient(circle at 50% 0%, ${colors.fill} 0%, ${colors.deep} 80%)`,
            borderRadius: "45% 45% 0 0 / 18% 18% 0 0",
            transition: "height 0.2s ease-out",
            boxShadow: `0 -2px 10px ${colors.fill}66`,
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "9%",
            left: "18%",
            width: "34%",
            height: "20%",
            borderRadius: "50%",
            background: "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 100%)",
            transform: "rotate(-18deg)",
          }}
        />
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: theme.fontNumeric,
            fontSize: size / 4.6,
            fontWeight: 700,
            color: theme.textPrimary,
            textShadow: hudTextShadow(),
          }}
        >
          {Math.round(clamped * 100)}
        </span>
      </div>
      {label !== undefined && (
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
          {label}
        </span>
      )}
    </div>
  );
}

const HEART_PATH =
  "M12 21.2C8.2 18.4 2.6 14 2.6 8.9 2.6 5.6 5 3.4 7.7 3.4c1.8 0 3.3 1 4.3 2.5 1-1.5 2.5-2.5 4.3-2.5 2.7 0 5.1 2.2 5.1 5.5 0 5.1-5.6 9.5-9.4 12.3z";

export function HeartRow({
  current,
  max,
  size = 20,
  icon,
  className,
}: {
  current: number;
  max: number;
  size?: number;
  icon?: (filled: boolean, index: number) => ReactNode;
  className?: string;
}) {
  const theme = useGameUiTheme();
  return (
    <div
      className={className}
      data-jgui="heart-row"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={current}
      style={{ display: "flex", gap: 3 }}
    >
      {Array.from({ length: max }, (_, index) => {
        const filled = index < current;
        if (icon !== undefined) return <span key={index}>{icon(filled, index)}</span>;
        return (
          <svg
            key={index}
            viewBox="0 0 24 24"
            width={size}
            height={size}
            style={{
              filter: filled
                ? `drop-shadow(0 0 4px ${theme.danger}aa) drop-shadow(0 1px 1px rgba(0,0,0,0.8))`
                : "drop-shadow(0 1px 1px rgba(0,0,0,0.8))",
            }}
          >
            <path
              d={HEART_PATH}
              fill={filled ? theme.danger : "rgba(0,0,0,0.45)"}
              stroke={filled ? "#ffb3ad" : theme.edge}
              strokeWidth={filled ? 0.8 : 1.2}
            />
          </svg>
        );
      })}
    </div>
  );
}

export function XpBar({
  fraction,
  level,
  width = "100%",
  ticks = 10,
  className,
}: {
  fraction: number;
  level?: number;
  width?: number | string;
  ticks?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  const clamped = clampFraction(fraction);
  return (
    <div className={className} data-jgui="xp-bar" style={{ display: "flex", alignItems: "center", gap: 8, width }}>
      {level !== undefined && (
        <span
          style={{
            fontFamily: theme.fontNumeric,
            fontSize: 11,
            fontWeight: 700,
            color: theme.xp,
            textShadow: hudTextShadow(),
            flexShrink: 0,
          }}
        >
          Lv {level}
        </span>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
        style={{
          position: "relative",
          flex: 1,
          height: 5,
          background: theme.surfaceDeep,
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.8)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${clamped * 100}%`,
            background: `linear-gradient(90deg, ${theme.xpDeep} 0%, ${theme.xp} 100%)`,
            boxShadow: `0 0 6px ${theme.xp}99`,
            transition: "width 0.3s ease-out",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `repeating-linear-gradient(90deg, transparent 0, transparent calc(${100 / ticks}% - 1px), rgba(0,0,0,0.7) calc(${100 / ticks}% - 1px), rgba(0,0,0,0.7) ${100 / ticks}%)`,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

export function ChargeMeter({
  fraction,
  ready = false,
  tiers = [],
  label,
  width = 180,
  className,
}: {
  fraction: number;
  ready?: boolean;
  tiers?: readonly number[];
  label?: string;
  width?: number | string;
  className?: string;
}) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  const clamped = clampFraction(fraction);
  return (
    <div className={className} data-jgui="charge-meter" data-ready={ready} style={{ width }}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
        style={{
          position: "relative",
          height: 12,
          clipPath: slantBar(8),
          background: `linear-gradient(180deg, ${theme.surfaceDeep} 0%, ${theme.surface} 100%)`,
          boxShadow: "inset 0 2px 3px rgba(0,0,0,0.8)",
          overflow: "hidden",
          animation: ready ? "jgui-ready-glow 1.1s ease-in-out infinite" : "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${clamped * 100}%`,
            background: `linear-gradient(90deg, ${theme.accentDeep} 0%, ${theme.accent} 100%)`,
            boxShadow: `0 0 10px ${theme.accentGlow}`,
            transition: "width 0.18s ease-out",
          }}
        />
        {tiers.map((tier) => (
          <span
            key={tier}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${clampFraction(tier) * 100}%`,
              width: 2,
              background: "rgba(255,255,255,0.55)",
            }}
          />
        ))}
      </div>
      {label !== undefined && (
        <div
          style={{
            marginTop: 3,
            fontFamily: theme.fontDisplay,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: ready ? theme.accent : theme.textDim,
            textShadow: hudTextShadow(),
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

export function BreakMeter({
  fraction,
  broken = false,
  width = 150,
  className,
}: {
  fraction: number;
  broken?: boolean;
  width?: number | string;
  className?: string;
}) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  const clamped = clampFraction(fraction);
  const rampColor = broken ? theme.danger : clamped > 0.66 ? theme.danger : clamped > 0.33 ? theme.warning : theme.textDim;
  return (
    <div
      className={className}
      data-jgui="break-meter"
      data-broken={broken}
      style={{
        width,
        animation: broken ? "jgui-shake 0.35s ease-in-out" : "none",
      }}
    >
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
        style={{
          position: "relative",
          height: 7,
          clipPath:
            "polygon(0 50%, 4% 0, 96% 0, 100% 50%, 96% 100%, 4% 100%)",
          background: theme.surfaceDeep,
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.85)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${(broken ? 1 : clamped) * 100}%`,
            background: `linear-gradient(90deg, ${rampColor}bb 0%, ${rampColor} 100%)`,
            boxShadow: broken ? `0 0 8px ${theme.danger}` : "none",
            transition: "width 0.12s ease-out",
            animation: broken ? "jgui-pulse 0.5s ease-in-out infinite" : "none",
          }}
        />
      </div>
    </div>
  );
}
