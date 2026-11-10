/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { RuneBox, RuneButton, RuneRow, RuneScroll, RuneText, useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import type { RuneElementProps } from "@jgengine/core/ui/rune/element";

export const TEAL = "#9cddd1", AMBER = "#e2bd6e", RED = "#ff6a52", INK = "#e8fbf5", DIM = "#bee0d6b8";
export const FULL = { fraction: 1 };
export const ALL = [0, 0, 0, 0] as const;
const HULL = { points: [[4,0],[96,0],[100,7],[100,93],[96,100],[4,100],[0,93],[0,7]], viewBox: [100,100] } as const;

export function Text(props: RuneElementProps) { return <RuneText size={14} color={INK} {...props} />; }
export function Tag(props: RuneElementProps) { return <RuneText size={11} family="Share Tech Mono" tracking={1.5} color={DIM} {...props} />; }
export function Heading(props: RuneElementProps) { return <RuneText size={23} weight={650} color={INK} {...props} />; }
export function Section(props: RuneElementProps) { return <RuneBox gap={9} padding={[12, 0, 12, 0]} {...props} />; }
export function Row(props: RuneElementProps) { return <RuneRow gap={8} items="center" {...props} />; }

export function Button({ children, ...props }: RuneElementProps) {
  return <RuneButton minHeight={36} padding={[8, 13, 8, 13]} fill="#d7b774" color="#172529" weight={600}
    border={{ width: 1, color: "#ecd3a1" }} hover="#ffffff20" press="#00000020" {...props}>
    {typeof children === "string" || typeof children === "number" ? <RuneText size={14} weight={600}>{children}</RuneText> : children}
  </RuneButton>;
}

export function Frame({ children, paper = false, ...props }: RuneElementProps & { paper?: boolean }) {
  return <RuneBox padding={2} shape={HULL} fill={paper ? "#342817" : "#04090b"} shadow={{ y: 12, blur: 18, color: "#00000080" }} {...props}>
    <RuneBox padding={12} gap={6} shape={HULL} fill={paper ? "#d9bd83" : "#1b2c33"} color={paper ? "#2b2014" : INK}>
      {children}
      {paper ? null : <><RuneBox pin={[7,7,null,null]} width={3} height={3} radius={2} fill="#78908f" /><RuneBox pin={[null,7,7,null]} width={3} height={3} radius={2} fill="#78908f" /><RuneBox pin={[7,null,null,7]} width={3} height={3} radius={2} fill="#78908f" /><RuneBox pin={[null,null,7,7]} width={3} height={3} radius={2} fill="#78908f" /></>}
    </RuneBox>
  </RuneBox>;
}

export function Sheet({ children, title, close, label }: { children: ReactNode; title: string; close?: (() => void) | undefined; label?: string }) {
  const viewport = useRuneViewport();
  const width = Math.min(640, viewport.width - 32), height = viewport.height - 40;
  return <RuneBox pin={ALL} fill="#0d181be8" justify="center" items="center" modal {...(close === undefined ? {} : { onBack: close })}>
    <RuneBox width={width} maxHeight={height} fill="#142429" border={{ width: 1, color: "#7c908b" }} padding={viewport.width < 700 ? 18 : 25} gap={12} label={label ?? title} role="dialog">
      <Row justify="between" width={FULL}><Heading>{title}</Heading>{close === undefined ? null : <Button onPress={close}>Close ×</Button>}</Row>
      <RuneScroll width={FULL} maxHeight={height - 110} minHeight={0} gap={10}>{children}</RuneScroll>
    </RuneBox>
  </RuneBox>;
}
