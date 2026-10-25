import { expect, test } from 'bun:test';
import { defineGameDefinition } from '@jgengine/core/game/defineGame';
import { memorySaveBackend, type SaveBackend } from '@jgengine/core/game/saveStore';
import { createGameContext, type GameContext } from '@jgengine/core/runtime/gameContext';
import { content } from './content';
import { registerCommands } from './commands';

function boot(backend: SaveBackend = memorySaveBackend()): GameContext {
  const ctx = createGameContext({ definition: defineGameDefinition({ name: 'harbor-garage-test', multiplayer: 'off', persist: true }), content, player: { userId: 'p1', isNew: true }, save: { backend, key: 'garage-test', mode: 'manual' } });
  ctx.scene.entity.spawn('street_runner', { id:'p1', position:[0,0,0], role:'player' });
  registerCommands(ctx);
  return ctx;
}
function buy(ctx: GameContext, vehicle='car_compact'): void { ctx.game.commands.run('garage.buy',{vehicle}); }
function cars(ctx:GameContext) { return ctx.scene.entity.list().filter(e=>e.name==='car_compact'); }

test('two same-model paid purchases at one game time create two distinct cars', () => {
  const ctx=boot(); ctx.game.economy.grant('p1','cash',1600);
  buy(ctx); const first=cars(ctx)[0]!;
  expect(ctx.game.economy.balance('p1','cash')).toBe(800);
  expect(()=>buy(ctx)).not.toThrow();
  expect(ctx.game.economy.balance('p1','cash')).toBe(0);
  expect(cars(ctx)).toHaveLength(2);
  expect(new Set(cars(ctx).map(e=>e.id)).size).toBe(2);
  expect(ctx.scene.entity.get(first.id)).toEqual(first);
});

test('a fresh-runtime reload preserves the old purchased car when another is bought', async () => {
  const backend=memorySaveBackend(); const ctx=boot(backend);
  ctx.game.economy.grant('p1','cash',1600); buy(ctx);
  const old=cars(ctx)[0]!;
  await ctx.game.save!.save();
  const restored=boot(backend); expect(await restored.game.save!.load()).toBe(true);
  expect(restored.scene.entity.get(old.id)).toEqual(old);
  expect(()=>buy(restored)).not.toThrow();
  expect(cars(restored)).toHaveLength(2);
  expect(restored.scene.entity.get(old.id)).toEqual(old);
  expect(restored.game.economy.balance('p1','cash')).toBe(0);
  await restored.game.save!.save();
  const next=boot(backend); expect(await next.game.save!.load()).toBe(true);
  expect(cars(next)).toEqual(cars(restored));
  expect(next.game.economy.balance('p1','cash')).toBe(0);
});

test('legacy time-derived car identities coexist with new purchases after reload', async () => {
  const backend=memorySaveBackend(); const ctx=boot(backend);
  ctx.scene.entity.spawn('car_compact',{id:'bought_0_car_compact',position:[20,0,20],role:'prop'});
  ctx.game.economy.grant('p1','cash',800); await ctx.game.save!.save();
  const restored=boot(backend); expect(await restored.game.save!.load()).toBe(true);
  expect(()=>buy(restored)).not.toThrow();
  expect(cars(restored)).toHaveLength(2);
  expect(restored.scene.entity.get('bought_0_car_compact')?.position).toEqual([20,0,20]);
  expect(restored.game.economy.balance('p1','cash')).toBe(0);
});

test('unaffordable and cred-locked purchases spend nothing and create no vehicles', () => {
  const ctx=boot(); ctx.game.economy.grant('p1','cash',7000);
  buy(ctx,'car_sport');
  expect(ctx.game.economy.balance('p1','cash')).toBe(7000);
  expect(ctx.scene.entity.list().filter(e=>e.name==='car_sport')).toHaveLength(0);
  ctx.game.economy.charge('p1','cash',6300);
  buy(ctx); buy(ctx);
  expect(ctx.game.economy.balance('p1','cash')).toBe(700);
  expect(cars(ctx)).toHaveLength(0);
  const refusals=ctx.game.notices.list().filter(n=>n.tone==='deny').map(n=>[n.text,n.count]);
  expect(refusals).toEqual([['Needs street cred 4.',1],['Not enough cash.',2]]);
});

test('different available models keep their catalog identity and authored garage placement', () => {
  const ctx=boot(); ctx.game.economy.grant('p1','cash',3200);
  buy(ctx); buy(ctx,'car_muscle');
  const purchased=ctx.scene.entity.list().filter(e=>e.name==='car_compact'||e.name==='car_muscle');
  expect(purchased.map(e=>e.name)).toEqual(['car_compact','car_muscle']);
  expect(purchased.every(e=>e.role==='prop'&&e.position[0]===-62&&e.position[2]===122)).toBe(true);
  expect(ctx.game.economy.balance('p1','cash')).toBe(0);
});
