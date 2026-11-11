/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useState } from "@jgengine/core/ui/jsx";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import type { BaseModelLibraryEntry } from "../training";
import { Button, C, ErrorText, FULL, Label, Muted, Row, Sheet, Stack, Text } from "../../ui/kit";
import { ModelTrainingDurationEstimate } from "./ModelPresentation";

export interface TrainDataCommitmentModalProps {
  model: BaseModelLibraryEntry;
  dataTokens: number;
  estimateTrainingDurationSeconds: (model: BaseModelLibraryEntry, overtrainBracket?: number) => number;
  onConfirm: (overtrainBracket: number) => void;
  onCancel: () => void;
}

const BRACKETS = [1, 2, 3, 4] as const;

/**
 * Fine-tune only: pick 1×–4× the base required data tokens, capped by wallet.
 * The full track shows 1×–4×; segments past what you can afford are dimmed and locked.
 */
export function TrainDataCommitmentModal({ model, dataTokens, estimateTrainingDurationSeconds, onConfirm, onCancel }: TrainDataCommitmentModalProps) {
  const required = model.requiredDataTokens;
  const maxAffordable = useMemo(() => required <= 0 ? 1 : Math.max(1, Math.min(BRACKETS.length, Math.floor(dataTokens / required))), [dataTokens, required]);
  const [bracket, setBracket] = useState(1);
  useEffect(() => { setBracket(1); }, [model.id]);
  useEffect(() => { setBracket((b) => Math.min(b, maxAffordable)); }, [maxAffordable]);
  const committed = required * bracket;
  const estimated = estimateTrainingDurationSeconds(model, bracket);
  const short = dataTokens < committed;

  return <Sheet title={`Data commitment · ${model.name}`} close={onCancel} width={440}>
    <Stack gap={12} width={FULL}>
      <Muted size={12} color={C.teal}>Choose how many data tokens to commit (1× to 4× the model minimum). Higher commitment boosts baselines before quality tier and per-stat rolls.</Muted>
      <Row justify="between" width={FULL}><Label>{`MIN ${required.toLocaleString()}`}</Label><Label>{`MAX ${(required * BRACKETS.length).toLocaleString()} (4×)`}</Label></Row>
      <Row gap={6} width={FULL}>{BRACKETS.map((step) => {
        const affordable = step <= maxAffordable;
        return <Button key={step} tone="chip" grow={1} minHeight={40} disabled={!affordable} label={`Commit ${step}× data`}
          fill={affordable && step <= bracket ? C.teal : "#ffffff0d"} onPress={() => setBracket(step)}>
          <Text size={13} weight={800} color={affordable && step <= bracket ? C.ink : C.muted}>{`${step}×`}</Text>
        </Button>;
      })}</Row>
      <RuneView items="center" gap={6} width={FULL}>
        <Text size={14} weight={800} color={C.teal}>{`${committed.toLocaleString()} data tokens (${bracket}× minimum)`}</Text>
        <ModelTrainingDurationEstimate estimatedSeconds={estimated} />
        {short ? <ErrorText>{`Collect ${Math.ceil(committed - dataTokens).toLocaleString()} more data tokens before training.`}</ErrorText>
          : !Number.isFinite(estimated) ? <ErrorText>Assign a GPU to Training in GPU jobs before starting.</ErrorText>
            : maxAffordable <= 1 ? <Muted size={11}>Your balance covers a 1× training run. Collect more data to increase it.</Muted> : null}
      </RuneView>
      <Row gap={10} width={FULL}>
        <Button tone="secondary" grow={1} onPress={onCancel}>Cancel</Button>
        <Button tone="primary" grow={1} disabled={short || !Number.isFinite(estimated)} onPress={() => onConfirm(bracket)}>Start training</Button>
      </Row>
    </Stack>
  </Sheet>;
}
