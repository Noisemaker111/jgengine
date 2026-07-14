import { leveled, type CartridgeSpec } from "./spec";

export function validateCartridge(spec: CartridgeSpec): string[] {
  const problems: string[] = [];
  const enemyIds = new Set(Object.keys(spec.enemies));
  const weaponIds = new Set(Object.keys(spec.weapons));

  if (spec.player.health <= 0) problems.push(`player "${spec.player.kind}": health must be positive`);
  if (spec.player.walkSpeed <= 0) problems.push(`player "${spec.player.kind}": walkSpeed must be positive`);
  if (enemyIds.has(spec.player.kind)) problems.push(`player kind "${spec.player.kind}" collides with an enemy id`);

  if (spec.flow?.countdownSeconds !== undefined && spec.flow.countdownSeconds < 0) {
    problems.push("flow.countdownSeconds must not be negative");
  }

  for (const [id, enemy] of Object.entries(spec.enemies)) {
    if (enemy.health <= 0) problems.push(`enemy "${id}": health must be positive`);
    if (enemy.walkSpeed <= 0) problems.push(`enemy "${id}": walkSpeed must be positive`);
    if (enemy.xp <= 0) problems.push(`enemy "${id}": xp must be positive`);
    if (enemy.contact.damage <= 0) problems.push(`enemy "${id}": contact.damage must be positive`);
    if (enemy.contact.intervalSeconds <= 0) problems.push(`enemy "${id}": contact.intervalSeconds must be positive`);
  }

  for (const wave of spec.spawning.director.waves) {
    for (const entry of wave.entries) {
      if (!enemyIds.has(entry.id)) problems.push(`spawning wave references unknown enemy "${entry.id}"`);
    }
  }

  for (const [id, weapon] of Object.entries(spec.weapons)) {
    for (let level = 1; level <= weapon.maxLevel; level += 1) {
      if (leveled(weapon.damage, level) <= 0) problems.push(`weapon "${id}": damage at level ${level} must be positive`);
      if (leveled(weapon.cooldownMs, level) <= 0) problems.push(`weapon "${id}": cooldownMs at level ${level} must be positive`);
    }
  }

  const seenUpgrades = new Set<string>();
  for (const upgrade of spec.progression.draft.upgrades) {
    if (seenUpgrades.has(upgrade.id)) problems.push(`upgrade "${upgrade.id}": duplicate id`);
    seenUpgrades.add(upgrade.id);
    if (upgrade.maxStacks <= 0) problems.push(`upgrade "${upgrade.id}": maxStacks must be positive`);
    const effect = upgrade.effect;
    if (effect.kind === "weaponLevel") {
      if (!weaponIds.has(effect.weapon)) {
        problems.push(`upgrade "${upgrade.id}": references unknown weapon "${effect.weapon}"`);
      } else {
        const weapon = spec.weapons[effect.weapon]!;
        if (1 + upgrade.maxStacks > weapon.maxLevel) {
          problems.push(
            `upgrade "${upgrade.id}": maxStacks ${upgrade.maxStacks} exceeds weapon "${effect.weapon}" maxLevel ${weapon.maxLevel}`,
          );
        }
      }
    }
    if ((effect.kind === "fieldAdd" || effect.kind === "fieldMultiply") && spec.fields?.[effect.field] === undefined) {
      problems.push(`upgrade "${upgrade.id}": references undeclared field "${effect.field}"`);
    }
  }

  if (spec.progression.draft.choices <= 0) problems.push("progression.draft.choices must be positive");
  if (spec.progression.maxLevel <= 1) problems.push("progression.maxLevel must exceed 1");

  const thresholds = spec.xpGems.rarityThresholds;
  for (let i = 1; i < thresholds.length; i += 1) {
    if (thresholds[i]![0] >= thresholds[i - 1]![0]) {
      problems.push("xpGems.rarityThresholds must be sorted by descending value");
    }
  }

  if (spec.rules.win?.kind === "survive" && spec.rules.win.seconds <= 0) {
    problems.push("rules.win.seconds must be positive");
  }

  return problems;
}
