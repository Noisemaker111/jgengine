export type ResourceKind = "mana" | "rage" | "energy";
export type AbilitySchool = "physical" | "holy" | "fire" | "frost" | "arcane" | "nature" | "shadow";
export type AbilityKind = "damage" | "heal" | "dot" | "hot" | "buff" | "aoe";
export type AttributeId = "str" | "agi" | "sta" | "int" | "spi";
export type ItemQuality = "poor" | "common" | "uncommon" | "rare" | "epic";
export type EquipSlot =
  | "mainhand"
  | "helmet"
  | "shoulder"
  | "chest"
  | "waist"
  | "legs"
  | "feet"
  | "gloves"
  | "trinket";
export type ZoneId = "vale" | "marsh" | "peaks";

export interface AbilityCcDef {
  kind: "stun" | "root" | "taunt" | "armorShred";
  durationSec: number;
  amount?: number;
}

export interface AbilityDef {
  id: string;
  name: string;
  icon: string;
  school: AbilitySchool;
  kind: AbilityKind;
  levelReq: number;
  cost: number;
  castTime: number;
  cooldown: number;
  range: number;
  base: number;
  perLevel: number;
  coefficient?: number;
  duration?: number;
  tickInterval?: number;
  aoeRadius?: number;
  selfTarget?: boolean;
  buffStat?: AttributeId | "armor" | "attackPower" | "spellPower";
  buffAmount?: number;
  buffPerLevel?: number;
  cc?: AbilityCcDef;
  selfResource?: number;
}

export type HeroStatId =
  | AttributeId
  | "armor"
  | "attackPower"
  | "spellPower"
  | "critPct"
  | "maxHp"
  | "maxResource";

export interface SpecDef {
  id: string;
  classId: string;
  name: string;
  icon: string;
  nodes: readonly import("@jgengine/core/game/talents").TalentNodeDef<HeroStatId>[];
}

export type ProfessionId = "mining" | "logging" | "herbalism" | "fishing" | "crafting";

export interface GatherNodeDef {
  id: string;
  name: string;
  profession: ProfessionId;
  zone: ZoneId;
  skillReq: number;
  count: number;
  respawnSec: number;
  materials: readonly { itemId: string; min: number; max: number }[];
  skillUpTo: number;
}

export interface ClassDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  resource: ResourceKind;
  baseHp: number;
  hpPerLevel: number;
  baseResource: number;
  resourcePerLevel: number;
  baseStats: Record<AttributeId, number> & { armor: number };
  statsPerLevel: Partial<Record<AttributeId, number>> & { armor?: number };
  startWeapon: string;
  abilities: readonly AbilityDef[];
}

export interface BossMechanicsDef {
  enrage?: { belowHpFraction: number; hasteMult: number; damageMult?: number };
  summons?: { mobId: string; count: number; intervalSec: number; maxAlive?: number };
}

export interface MobAbilityDef {
  id: string;
  name: string;
  intervalSec: number;
  amount: number;
  radius?: number;
  school: AbilitySchool;
}

export interface DropDef {
  itemId?: string;
  copper?: [number, number];
  chance: number;
}

export interface MobDef {
  id: string;
  name: string;
  family: "beast" | "humanoid" | "undead" | "elemental" | "demon";
  zone: ZoneId;
  minLevel: number;
  maxLevel: number;
  hpBase: number;
  hpPerLevel: number;
  dmgBase: number;
  dmgPerLevel: number;
  attackSpeed: number;
  armorPerLevel: number;
  moveSpeed: number;
  aggroRadius: number;
  count: number;
  drops: readonly DropDef[];
  packFrenzy?: { radius: number; hasteMult: number; duration: number };
  rare?: boolean;
  boss?: boolean;
  abilities?: readonly MobAbilityDef[];
  mechanics?: BossMechanicsDef;
  dungeonId?: string;
}

export interface DungeonDef {
  id: string;
  name: string;
  zone: ZoneId;
  center: readonly [number, number];
  radius: number;
  levelRange: readonly [number, number];
  entrance: readonly [number, number];
  inside: readonly [number, number];
  raid?: boolean;
}

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  kind: "weapon" | "armor" | "consumable" | "junk" | "quest";
  quality: ItemQuality;
  slot?: EquipSlot;
  set?: string;
  weapon?: { min: number; max: number; speed: number };
  armor?: number;
  stats?: Partial<Record<AttributeId, number>>;
  heal?: number;
  restore?: number;
  levelReq?: number;
  buyPrice?: number;
  sellPrice?: number;
  shops?: readonly string[];
  stack?: number;
}

export interface NpcDef {
  id: string;
  name: string;
  zone: ZoneId;
  position: readonly [number, number];
  kind: "questgiver" | "vendor" | "flavor";
  dialogueId?: string;
  shopId?: string;
}

export const CLASS_ENTITY_ID = "player_hero";
export const COPPER = "copper";

export function classEntityId(classId: string): string {
  return `${CLASS_ENTITY_ID}_${classId}`;
}

export function isPlayerEntityId(catalogId: string): boolean {
  return catalogId === CLASS_ENTITY_ID || catalogId.startsWith(`${CLASS_ENTITY_ID}_`);
}
