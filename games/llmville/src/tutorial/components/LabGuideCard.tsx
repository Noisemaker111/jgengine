/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { Button, C, FULL, Icon, Muted, Panel, Row, Text } from "../../ui/kit";
import type { LabGuideState } from "../labGuide";

/** The HUD's lab guide: what to do next and the one button that does it. */
export function LabGuideCard({ guide, canEdit }: { guide: LabGuideState; canEdit: boolean }) {
  return <Panel shell="toast" width={FULL} gap={8} padding={16} label="Lab guide">
    <Row justify="between" width={FULL}>
      <Row gap={6}><Icon name="sparkles" size={14} color={C.teal} /><Text size={12} weight={700} color={C.teal}>{guide.heading}</Text></Row>
      {guide.step === null ? null : <Text size={12} weight={700} color={C.teal}>{`${guide.step.step} / ${guide.step.total}`}</Text>}
    </Row>
    {guide.step === null ? null : <RuneView height={4} radius={2} fill={C.line} width={FULL}>
      <RuneView height={4} radius={2} fill={C.teal} width={{ fraction: Math.max(0, Math.min(1, (guide.step.step - 1) / Math.max(1, guide.step.total))) }} />
    </RuneView>}
    <Text size={16} weight={700}>{guide.title}</Text>
    <Muted size={12} color={C.creamDim}>{guide.detail}</Muted>
    <Button tone="primary" width={FULL} justify="between" disabled={!canEdit} label={guide.label} onPress={guide.action}>
      <Text weight={800} color={C.ink} grow={1} shrink>{guide.label}</Text>
      <Icon name="next" size={16} color={C.ink} />
    </Button>
  </Panel>;
}
