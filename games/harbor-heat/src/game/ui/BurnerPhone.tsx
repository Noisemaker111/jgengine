/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneView, type RuneActionProps } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useGameContext } from "@jgengine/ui/provider";
import { clockText, Label, Lcd, LcdText, Row, Text } from "./kit";
import { HH, DISPLAY } from "./theme";

/** A physical key's job: the label printed on the screen above it and what pressing it does. */
export interface PhoneKey {
  label: string;
  run: () => void;
}

const NUMPAD = ["1", "2 ABC", "3 DEF", "4 GHI", "5 JKL", "6 MNO", "7 PQRS", "8 TUV", "9 WXYZ", "*", "0 +", "#"] as const;

/** Four signal bars and a two-cell battery, drawn on the LCD's status line. */
function StatusLine() {
  const ctx = useGameContext();
  return (
    <Row justify="between">
      <Row gap={2} items="end">{[0, 1, 2, 3].map((i) => <RuneView key={i} width={3} height={3 + i * 3} fill={i < 3 ? HH.lcdInk : "#2a170433"} />)}</Row>
      <LcdText size={12} text={bind(() => { const c = ctx.time.calendar(); return clockText(c.hour, c.minute); })} />
      <Row gap={1} padding={1} border={{ width: 1, color: HH.lcdInk }}>{[0, 1, 2].map((i) => <RuneView key={i} width={4} height={6} fill={i < 2 ? HH.lcdInk : "#2a170422"} />)}</Row>
    </Row>
  );
}

function SoftKey({ keyDef }: { keyDef: PhoneKey | undefined }) {
  if (keyDef === undefined) return <RuneView width={64} height={14} />;
  return (
    <RuneAction run={keyDef.run} label={keyDef.label} width={64} height={22} radius={11}
      fill="#24343a" hover="#ffffff22" press="#00000040" border={{ width: 1, color: "#000000" }} justify="center" items="center">
      <RuneView width={22} height={3} fill="#9fb3b8" radius={2} />
    </RuneAction>
  );
}

/**
 * The courier's burner: a chunky candybar phone with a stub antenna, an amber LCD and a rubber keypad.
 * Pause, settings and the city phone (T) are all apps on this one handset. The softkeys work; the
 * number keys are just keys. The LCD's rows are native actions, so arrows, pad and touch reach them.
 */
export function BurnerPhone({ app, children, softLeft, softRight, notice, keypad = false, width = 300, lcdHeight }: {
  app: string;
  children: ReactNode;
  softLeft?: PhoneKey | undefined;
  softRight?: PhoneKey | undefined;
  notice?: string | undefined;
  keypad?: boolean;
  width?: number;
  lcdHeight?: number | undefined;
}) {
  return (
    <RuneView width={width} items="center" gap={0}>
      <RuneView width={14} height={26} fill="#1b2326" radius={4} x={width * 0.3} />
      <RuneView width={width} padding={[12, 14, 16, 14]} gap={10} fill="#2b3b41" radius={26} border={{ width: 3, color: "#0b1114" }}
        shadow={{ x: 8, y: 10, blur: 0, color: "#00000066" }}>
        <Row justify="center" gap={8}><RuneView width={34} height={4} fill="#0b1114" radius={2} /><Text family={DISPLAY} size={13} tracking={2} color="#9fb3b8" text="MAINSAIL tel" /></Row>
        <RuneView padding={6} fill="#0b1114" radius={8}>
          <Lcd gap={6} {...(lcdHeight === undefined ? {} : { height: lcdHeight })}>
            <StatusLine />
            <RuneView fill={HH.lcdInk} padding={[2, 6, 2, 6]}><LcdText color={HH.lcd} size={13} text={app.toUpperCase()} /></RuneView>
            <RuneView gap={4} grow={1}>{children}</RuneView>
            {notice === undefined || notice === "" ? null : <LcdText size={12} text={notice} role="status" />}
            <Row justify="between"><LcdText size={12} text={softLeft?.label ?? ""} /><LcdText size={12} text={softRight?.label ?? ""} /></Row>
          </Lcd>
        </RuneView>
        <Row justify="between">
          <SoftKey keyDef={softLeft} />
          <RuneView width={54} height={54} radius={27} fill="#1d282c" border={{ width: 2, color: "#0b1114" }} justify="center" items="center"><RuneView width={18} height={18} radius={9} fill="#3c4d53" /></RuneView>
          <SoftKey keyDef={softRight} />
        </Row>
        {keypad ? (
          <RuneView layout="grid" columns={3} gap={6}>
            {NUMPAD.map((key) => (
              <RuneView key={key} height={26} fill="#1d282c" radius={9} justify="center" items="center" layout="row" gap={4}>
                <Text family={DISPLAY} size={15} color="#dfe8ea" text={key.split(" ")[0] ?? key} />
                <Label size={8} text={key.split(" ")[1] ?? ""} />
              </RuneView>
            ))}
          </RuneView>
        ) : null}
      </RuneView>
    </RuneView>
  );
}

/** One LCD line you can pick: arrows, pad, mouse and touch reach it. */
export function LcdLine({ children, ...props }: RuneActionProps) {
  return <RuneAction variant="line" layout="row" justify="between" color={HH.lcdInk} {...props}>{children}</RuneAction>;
}
