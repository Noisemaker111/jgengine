/** @jsxImportSource @jgengine/core/ui/jsx */
/** Stats app — read-only site health and income readouts. GPU dedication lives in the GPU jobs app. */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { servingIncomePerHour, servingThroughputPerHour } from "@llmville/game/economy/hourlyRates";
import { isOverCapacity } from "@llmville/game/infrastructure/infrastructure";

import type { SiteHealth } from "../../runtime/worldViewModel";
import { DISPLAY } from "../../ui/theme";
import { Button, C, FULL, Label, Muted, Panel, Row, Stack, Text, useCompact } from "../../ui/kit";

interface StatsAppProps {
  servingIncomeRate: number;
  servingThroughputTps: number;
  siteHealth: SiteHealth;
  totalGpus: number;
  trainingGpus: number;
  scrapingGpus: number;
  servingGpus: number;
  onOpenCoolingStore?: (() => void) | undefined;
}

const kilo = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0));

function Scoreboard({ label, value, color }: { label: string; value: string; color: string }) {
  return <Panel shell="inset" items="center" gap={4} minWidth={140} grow={1}>
    <Label>{label.toUpperCase()}</Label>
    <Text family={DISPLAY} size={28} weight={800} color={color}>{value}</Text>
  </Panel>;
}

function Reading({ label, value, over = false }: { label: string; value: string; over?: boolean }) {
  return <RuneView items="center" gap={4}>
    <Label>{label.toUpperCase()}</Label>
    <Text size={14} weight={800} color={over ? C.error : C.cream}>{value}</Text>
  </RuneView>;
}

export function StatsApp({ servingIncomeRate, servingThroughputTps, siteHealth, totalGpus, trainingGpus, scrapingGpus, servingGpus, onOpenCoolingStore }: StatsAppProps) {
  const compact = useCompact();
  const tokensPerHour = servingThroughputPerHour(servingThroughputTps);
  const undedicated = Math.max(0, totalGpus - trainingGpus - scrapingGpus - servingGpus);
  const throttle = siteHealth.thermalThrottle * siteHealth.powerThrottle;
  return <Stack gap={16} width={FULL}>
    <Row gap={12} width={FULL}>
      <Scoreboard label="Tokens/hour" value={tokensPerHour >= 1000 ? `${(tokensPerHour / 1000).toFixed(1)}k` : String(tokensPerHour)} color={C.teal} />
      <Scoreboard label="$/hour serving" value={`$${kilo(servingIncomePerHour(servingIncomeRate))}`} color={C.amber} />
    </Row>
    <Panel shell="inset" width={FULL}>
      <Row justify="between" width={FULL}>
        <Label>SITE POWER</Label>
        {throttle < 0.99 ? <Text size={11} weight={800} color={C.coral}>{`Throttled −${Math.round((1 - throttle) * 100)}%`}</Text> : null}
      </Row>
      <RuneView layout="grid" columns={compact ? 2 : 3} gap={12} width={FULL}>
        <Reading label="Grid draw" value={`${siteHealth.powerDrawKw.toFixed(1)}/${siteHealth.powerCapacityKw.toFixed(1)} kW`} over={isOverCapacity(siteHealth.powerDrawKw, siteHealth.powerCapacityKw)} />
        <Reading label="Rack cooling" value={`${siteHealth.heatLoadKw.toFixed(1)}/${siteHealth.coolingCapacityKw.toFixed(1)} kW`} over={isOverCapacity(siteHealth.heatLoadKw, siteHealth.coolingCapacityKw)} />
        <Reading label="VRAM" value={`${Math.round(siteHealth.vramUsedGb)}/${Math.round(siteHealth.vramCapacityGb)} GB`} over={isOverCapacity(siteHealth.vramUsedGb, siteHealth.vramCapacityGb)} />
      </RuneView>
      {onOpenCoolingStore != null && siteHealth.thermalThrottle < 0.99 ? <Button tone="primary" width={FULL} onPress={onOpenCoolingStore}>Buy rack coolers →</Button> : null}
    </Panel>
    <Panel shell="inset" width={FULL}>
      <Row justify="between" width={FULL}><Label>GPU DEDICATION</Label><Label>{`${totalGpus} INSTALLED`}</Label></Row>
      <RuneView layout="grid" columns={compact ? 2 : 4} gap={12} width={FULL}>
        <Reading label="Training" value={String(trainingGpus)} />
        <Reading label="Scraping" value={String(scrapingGpus)} />
        <Reading label="Serving" value={String(servingGpus)} />
        <Reading label="Undedicated" value={String(undedicated)} />
      </RuneView>
      <Muted size={10}>Give GPUs a job in the GPU jobs app to change dedication.</Muted>
    </Panel>
  </Stack>;
}
