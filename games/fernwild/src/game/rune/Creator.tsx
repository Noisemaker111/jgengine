/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { useGameContext } from "@jgengine/react/provider";

import { BODIES, cleanLook, DEFAULT_LOOK, HEIGHT, START_REGIONS, type SurvivorLook } from "../character";
import { islandBake } from "../islandMap";
import { Button, CYAN, FULL, INK, Panel, Row, Small, Tag, Text } from "./kit";
import { imageUrl } from "./live";

const DIFFICULTY_COLOR = { Easy: "#7fd67f", Medium: "#e7c84a", Hard: "#ef6b5b" } as const;

/**
 * Names the creator offers. The native UI has no text field yet, so the name is chosen from this list
 * (the run's `createSurvivor` command still accepts any name up to the limit).
 */
export const SURVIVOR_NAMES = [DEFAULT_LOOK.name, "Ada", "Bram", "Cass", "Dane", "Ezra", "Fern", "Juno", "Kito", "Mara", "Nell", "Rook", "Sable", "Tane", "Wren"] as const;

/** The height slider: drag or arrow keys, snapped to whole percent. */
function HeightSlider({ value, set }: { value: number; set: (height: number) => void }): ReactNode {
  const share = useRef((value - HEIGHT.min) / (HEIGHT.max - HEIGHT.min));
  share.current = (value - HEIGHT.min) / (HEIGHT.max - HEIGHT.min);
  const snap = (fraction: number) => Math.round((HEIGHT.min + Math.max(0, Math.min(1, fraction)) * (HEIGHT.max - HEIGHT.min)) * 100) / 100;
  return (
    <RuneAction label="Height" grow={1} height={28} padding={[10, 0, 10, 0]} fill="#0d1417" radius={4}
      onAdjust={(delta) => set(Math.min(HEIGHT.max, Math.max(HEIGHT.min, Math.round((value + delta * 0.01) * 100) / 100)))}
      onDrag={(gesture) => {
        if (gesture.cancelled) return;
        share.current = Math.max(0, Math.min(1, gesture.x / Math.max(1, gesture.width)));
        if (gesture.phase === "up") set(snap(share.current));
      }}>
      <RuneView height={8} radius={4} fill={CYAN} width={bind(() => ({ fraction: Math.max(0.02, share.current) }))} />
    </RuneAction>
  );
}

/**
 * ARK's survivor creation, then its spawn screen, on one page over the island: name, body and height on the left,
 * the spawn regions on the island map and in a list on the right. Body and height show on the survivor at once;
 * Wake up applies the choices and starts the run.
 */
export function Creator({ begin, back }: { begin: () => void; back: () => void }): ReactNode {
  const ctx = useGameContext();
  const { width, height } = useRuneViewport();
  const phone = width < 600;
  const [look, setLook] = useState<SurvivorLook>(DEFAULT_LOOK);
  const choose = (patch: Partial<SurvivorLook>) => setLook((current) => cleanLook({ ...current, ...patch }));
  useEffect(() => {
    ctx.scene.entity.update(ctx.player.userId, { look: look.body, size: look.height });
  }, [ctx, look.body, look.height]);
  const leave = () => {
    ctx.scene.entity.update(ctx.player.userId, { look: null, size: 1 });
    back();
  };
  const wake = () => {
    void ctx.game.commands.run("createSurvivor", { ...look });
    begin();
  };
  const nameAt = Math.max(0, SURVIVOR_NAMES.indexOf(look.name as (typeof SURVIVOR_NAMES)[number]));
  const cycle = (step: number) => choose({ name: SURVIVOR_NAMES[(nameAt + step + SURVIVOR_NAMES.length) % SURVIVOR_NAMES.length] ?? DEFAULT_LOOK.name });
  const bake = useMemo(() => islandBake(ctx), [ctx]);
  const mapSize = phone ? Math.min(340, width - 40) : 438;
  const span = bake.mapBounds.maxX - bake.mapBounds.minX;
  return (
    <RuneView anchor="fill" radial={{ center: [0.5, 0.4], radius: [0.8, 0.8], stops: [[0.3, "#00000000"], [1, "#000000aa"]] }} label="Create your survivor">
      <RuneView anchor="center" maxHeight={height - 16} scroll padding={phone ? 8 : 24}>
        <RuneView layout={phone ? "stack" : "row"} gap={18} items="start">
          <Panel width={phone ? Math.min(370, width - 16) : 330} gap={12}>
            <Tag text="Create your survivor" />
            <RuneView gap={4}>
              <Small text="Name" />
              <Row gap={6}>
                <Button label="Previous name" width={36} padding={0} run={() => cycle(-1)}>‹</Button>
                <RuneView grow={1} height={32} fill="#0d1417" border={{ width: 1, color: "#6fb7c966" }} radius={4} justify="center" items="center">
                  <Text size={15} weight={600} text={look.name} />
                </RuneView>
                <Button label="Next name" width={36} padding={0} run={() => cycle(1)}>›</Button>
              </Row>
            </RuneView>
            <RuneView layout="grid" columns={2} gap={6}>
              {BODIES.map((body) => <Button key={body.id} picked={look.body === body.id} label={body.label} run={() => choose({ body: body.id })}>{body.label}</Button>)}
            </RuneView>
            <Row gap={10}>
              <Small width={44} color={INK} text="Height" />
              <HeightSlider value={look.height} set={(h) => choose({ height: h })} />
              <Small width={40} align="right" color={INK} text={`${Math.round(look.height * 100)}%`} />
            </Row>
            <Small text="Body and height show on your survivor in the world as you choose." />
          </Panel>
          <Panel width={phone ? Math.min(370, width - 16) : 470} gap={10}>
            <Tag text="Choose where you wake" />
            <RuneView width={mapSize} height={mapSize} radius={4} clip image={imageUrl(bake.background)} fit="cover" maxWidth={mapSize} border={{ width: 1, color: "#6fb7c955" }} label="Spawn map">
              {START_REGIONS.map((region) => {
                const x = ((region.position[0] - bake.mapBounds.minX) / span) * mapSize;
                const y = ((region.position[2] - bake.mapBounds.minZ) / span) * mapSize;
                const picked = look.region === region.id;
                return (
                  <RuneAction key={region.id} pin={[x - 10, y - 10, null, null]} width={20} height={20} radius={10} justify="center" items="center" label={`Wake at ${region.label}`} tooltip={region.label} hover="#ffffff30" run={() => choose({ region: region.id })}>
                    <Text size={picked ? 18 : 13} weight={700} color={picked ? CYAN : INK} text={picked ? "★" : "●"} />
                  </RuneAction>
                );
              })}
            </RuneView>
            <RuneView gap={4} maxHeight={phone ? 180 : 200} scroll width={FULL}>
              {START_REGIONS.map((region) => (
                <Button key={region.id} picked={look.region === region.id} justify="between" label={region.label} run={() => choose({ region: region.id })}>
                  <Row justify="between" width={FULL}>
                    <Text size={13} weight={600} text={region.label} />
                    <Text size={13} weight={600} color={DIFFICULTY_COLOR[region.difficulty]} text={region.difficulty} />
                  </Row>
                </Button>
              ))}
            </RuneView>
            <Row justify="between">
              <Button run={leave}>Back</Button>
              <Button primary run={wake}>Wake up</Button>
            </Row>
          </Panel>
        </RuneView>
      </RuneView>
    </RuneView>
  );
}
