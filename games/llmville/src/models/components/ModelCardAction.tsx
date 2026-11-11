/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { DISPLAY } from "../../ui/theme";
import { Button, C, Row, Text } from "../../ui/kit";

export const MODEL_CARD_ACTION_VARIANT = {
  train: "train",
  unlock: "unlock",
  progress: "progress",
  locked: "locked",
  reveal: "reveal",
  serve: "serve",
  serving: "serving",
} as const;

export type ModelCardActionVariant = (typeof MODEL_CARD_ACTION_VARIANT)[keyof typeof MODEL_CARD_ACTION_VARIANT];

/** `model` names the card the action belongs to, so every action has its own label. */
export type ModelCardActionProps = { model: string } & (
  | { variant: typeof MODEL_CARD_ACTION_VARIANT.train; label: string; disabled?: boolean; onClick: () => void }
  | { variant: typeof MODEL_CARD_ACTION_VARIANT.unlock; label: string; disabled?: boolean; onClick: () => void }
  | { variant: typeof MODEL_CARD_ACTION_VARIANT.progress; label: string }
  | { variant: typeof MODEL_CARD_ACTION_VARIANT.locked; label: string }
  | { variant: typeof MODEL_CARD_ACTION_VARIANT.reveal; onReveal: () => void }
  | { variant: typeof MODEL_CARD_ACTION_VARIANT.serve; onServe: () => void; label?: string }
  | { variant: typeof MODEL_CARD_ACTION_VARIANT.serving });

const word = (text: string, color: string) => <Text family={DISPLAY} size={14} weight={800} color={color}>{text.toUpperCase()}</Text>;

/** A static state chip (scraping, locked, serving) in the same footprint as the buttons. */
function Chip({ text, color, dot = false }: { text: string; color: string; dot?: boolean }) {
  return <Row minWidth={100} minHeight={36} padding={[6, 12, 6, 12]} radius={12} justify="center" gap={6} border={{ width: 1, color: `${color}80` }}>
    {dot ? <RuneView width={8} height={8} radius={4} fill={color} /> : null}
    {word(text, color)}
  </Row>;
}

export function ModelCardAction(props: ModelCardActionProps) {
  const sized = { minWidth: 100, minHeight: 36, padding: [6, 12, 6, 12] as const };
  switch (props.variant) {
    case "train":
    case "unlock": {
      const color = props.variant === "train" ? C.coral : C.teal;
      return <Button tone="secondary" {...sized} border={{ width: 1, color: `${color}80` }} disabled={props.disabled === true} label={`${props.label} ${props.model}`} onPress={props.onClick}>
        {word(props.label, color)}
      </Button>;
    }
    case "progress": return <Chip text={props.label} color={C.amber} />;
    case "locked": return <RuneView opacity={0.4}><Chip text={props.label} color={C.cream} /></RuneView>;
    case "reveal": return <Button tone="primary" {...sized} label={`Reveal ${props.model}`} onPress={props.onReveal}>{word("Reveal", C.ink)}</Button>;
    case "serve": return <Button tone="primary" {...sized} label={`${props.label ?? "Serve"} ${props.model}`} onPress={props.onServe}>{word(props.label ?? "Serve", C.ink)}</Button>;
    case "serving": return <Chip text="Serving" color={C.teal} dot />;
  }
}
