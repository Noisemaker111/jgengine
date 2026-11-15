/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useGameStore } from "@jgengine/ui/hooks";

import { editorLayers } from "../../editorLayers";
import { campaign } from "../campaign";
import { towerDef, TOWER_IDS } from "../entities/towers/catalog";
import { HIRE_DUES, isHired, townRank, TOWN_UPGRADES, TRAINING, trainingCost, trainingRank, unionRefusal } from "../union";
import { DIM, GOLD, Glyph, INK, Plank, Row, Tag, Text } from "./look";

/**
 * The union hall between days: dues on hand, the trades still to hire (cheapest first), training
 * for the trades on the crew, and the town's upgrades. Every button runs `union.buy`.
 */
export function UnionHall() {
  const state = useGameStore((c) => campaign.read(c));
  const dues = state.union.dues;
  const toHire = Object.keys(HIRE_DUES).filter((kind) => !isHired(state, kind)).sort((a, b) => HIRE_DUES[a]! - HIRE_DUES[b]!);
  const crew = TOWER_IDS.filter((kind) => isHired(state, kind));
  return <RuneView gap={8} padding={[10, 0, 4, 0]} label="Union hall">
    <Row justify="between" gap={8}>
      <Row gap={5}><Glyph name="megaphone" size={14} color={GOLD} /><Text size={15} weight={700}>{`Union Hall · ${dues} dues`}</Text></Row>
      <Text size={12} color={DIM}>Every finished day pays dues: waves, stars, and more for a held street</Text>
    </Row>
    <RuneView layout="grid" columns={3} responsive={{ phone: { columns: 1 } }} gap={8}>
      <RuneView gap={4}>
        <Tag>NEW HIRES</Tag>
        {toHire.length === 0 ? <Text size={12} color={DIM}>Every trade is in the union</Text> : toHire.slice(0, 5).map((kind) => {
          const def = towerDef(kind, editorLayers), refusal = unionRefusal(state, { hire: kind });
          return <Plank key={kind} variant="keystone" minHeight={26} padding={[2, 8, 2, 8]} layout="row" justify="between" opacity={refusal === null ? 1 : 0.6}
            tooltip={`${def.label}: ${def.role}${refusal === null ? "" : ` — ${refusal}`}`} label={`Hire ${def.label}`} command={{ name: "union.buy", input: { hire: kind } }}>
            <Row gap={4}><Glyph name={def.icon} size={13} /><Text size={12} color={INK}>{def.label}</Text></Row><Text size={12} color={GOLD}>{`${HIRE_DUES[kind]}`}</Text>
          </Plank>;
        })}
      </RuneView>
      <RuneView gap={4}>
        <Tag>{`TRAINING · +${Math.round(TRAINING.damage * 100)}% A RANK`}</Tag>
        <RuneView gap={4} scroll maxHeight={170}>
          {crew.map((kind) => {
            const def = towerDef(kind, editorLayers), rank = trainingRank(state, kind), refusal = unionRefusal(state, { train: kind });
            return <Plank key={kind} variant="keystone" minHeight={24} padding={[2, 8, 2, 8]} layout="row" justify="between" opacity={refusal === null ? 1 : 0.6}
              fill={rank > 0 ? "#2f7a5a" : "#2a2f3a"} tooltip={refusal ?? `Train ${def.label}: +${Math.round(TRAINING.damage * 100)}% damage`} label={`Train ${def.label}`}
              command={{ name: "union.buy", input: { train: kind } }}>
              <Text size={12} color={INK}>{def.label}</Text><Text size={12} color={rank > 0 ? GOLD : DIM}>{rank >= TRAINING.maxRank ? "max" : `${rank}/${TRAINING.maxRank} · ${trainingCost(state, kind)}`}</Text>
            </Plank>;
          })}
        </RuneView>
      </RuneView>
      <RuneView gap={4}>
        <Tag>TOWN UPGRADES</Tag>
        {TOWN_UPGRADES.map((upgrade) => {
          const rank = townRank(state, upgrade.id), refusal = unionRefusal(state, { town: upgrade.id });
          return <Plank key={upgrade.id} variant="keystone" minHeight={26} padding={[2, 8, 2, 8]} layout="row" justify="between" opacity={refusal === null || rank > 0 ? 1 : 0.6}
            fill={rank > 0 ? "#2f7a5a" : "#2a2f3a"} tooltip={`${upgrade.detail}${refusal === null ? "" : ` — ${refusal}`}`} label={upgrade.label}
            command={{ name: "union.buy", input: { town: upgrade.id } }}>
            <Text size={12} color={INK}>{upgrade.label}</Text><Text size={12} color={rank > 0 ? GOLD : DIM}>{rank >= upgrade.maxRank ? "built" : `${upgrade.dues}`}</Text>
          </Plank>;
        })}
      </RuneView>
    </RuneView>
  </RuneView>;
}
