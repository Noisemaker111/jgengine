import type { PointerHit } from "../input/pointer";
import type { MapMarker, MarkerPosition, MarkerSet } from "../world/markers";

export type PingCategory = string;

export interface PingCategoryDef {
  id: PingCategory;
  markerKind: string;
  label: string;
  callout: string;
}

/** Content-agnostic default ping wheel: enemy / loot / location / danger. */
export const DEFAULT_PING_CATEGORIES: Record<PingCategory, PingCategoryDef> = {
  enemy: { id: "enemy", markerKind: "enemy", label: "Enemy", callout: "Enemy spotted" },
  loot: { id: "loot", markerKind: "loot", label: "Loot", callout: "Loot here" },
  location: { id: "location", markerKind: "location", label: "Location", callout: "Going here" },
  danger: { id: "danger", markerKind: "danger", label: "Danger", callout: "Watch out" },
};

export const PING_FEED_ACTION = "party.ping";

export interface PingClassifyDeps {
  roleOf?(entityId: string): string | null | undefined;
  categoryOf?(objectId: string): PingCategory | null | undefined;
}

export interface PingClassifyOptions {
  hostileRoles?: readonly string[];
  enemyCategory?: PingCategory;
  lootCategory?: PingCategory;
  locationCategory?: PingCategory;
  dangerCategory?: PingCategory;
}

const DEFAULT_HOSTILE_ROLES: readonly string[] = ["enemy", "hostile"];

/**
 * Classify what a pointer/aim ray hit into a ping category. Entity hits resolve
 * by catalog role (hostile → enemy, else location); object hits by an
 * optional catalog category tag; open ground is a location ping.
 */
export function classifyPing(
  hit: PointerHit,
  deps: PingClassifyDeps = {},
  options: PingClassifyOptions = {},
): PingCategory {
  const hostileRoles = options.hostileRoles ?? DEFAULT_HOSTILE_ROLES;
  const enemyCategory = options.enemyCategory ?? "enemy";
  const locationCategory = options.locationCategory ?? "location";
  if (hit.entity !== null) {
    const role = deps.roleOf?.(hit.entity);
    if (role !== null && role !== undefined && hostileRoles.includes(role)) return enemyCategory;
    return locationCategory;
  }
  if (hit.object !== null) {
    const category = deps.categoryOf?.(hit.object);
    if (category !== null && category !== undefined) return category;
    return locationCategory;
  }
  return locationCategory;
}

export interface PingPayload {
  id: string;
  from: string;
  category: PingCategory;
  position: MarkerPosition;
  entityId: string | null;
  objectId: string | null;
  at: number;
  callout: string;
  /** Party members the broadcast targets; empty when solo or party unconfigured. */
  recipients: readonly string[];
}

export interface PingFeedSink {
  push(action: string, entry: unknown): void;
}

export interface PingParty {
  membersOf(userId: string): string[];
}

export interface PingSystemDeps {
  markers: MarkerSet;
  feed: PingFeedSink;
  party?: PingParty;
  categories?: Record<PingCategory, PingCategoryDef>;
  now?(): number;
  /** Marker lifetime in ms; omit for permanent markers. */
  ttlMs?: number;
  feedAction?: string;
  classify?: PingClassifyDeps;
  classifyOptions?: PingClassifyOptions;
}

export interface PingSystem {
  classify(hit: PointerHit): PingCategory;
  buildPayload(from: string, hit: PointerHit, category?: PingCategory): PingPayload;
  broadcast(payload: PingPayload): MapMarker;
  /** Classify → build → broadcast in one call; the ping verb. */
  ping(from: string, hit: PointerHit, category?: PingCategory): PingPayload;
}

function categoryDef(
  categories: Record<PingCategory, PingCategoryDef>,
  category: PingCategory,
): PingCategoryDef {
  return categories[category] ?? { id: category, markerKind: category, label: category, callout: category };
}

/**
 * Contextual ping/marker communication between teammates, classified by what was pinged.
 *
 * @capability ping-wheel contextual ping/marker communication between teammates
 */
export function createPingSystem(deps: PingSystemDeps): PingSystem {
  const now = deps.now ?? Date.now;
  const categories = deps.categories ?? DEFAULT_PING_CATEGORIES;
  const feedAction = deps.feedAction ?? PING_FEED_ACTION;
  let counter = 0;

  const system: PingSystem = {
    classify(hit) {
      return classifyPing(hit, deps.classify, deps.classifyOptions);
    },
    buildPayload(from, hit, category) {
      const resolved = category ?? system.classify(hit);
      const at = now();
      counter += 1;
      const def = categoryDef(categories, resolved);
      const recipients = deps.party?.membersOf(from).filter((member) => member !== from) ?? [];
      return {
        id: `ping-${from}-${counter}`,
        from,
        category: resolved,
        position: hit.point,
        entityId: hit.entity,
        objectId: hit.object,
        at,
        callout: def.callout,
        recipients,
      };
    },
    broadcast(payload) {
      const def = categoryDef(categories, payload.category);
      const markerInput = {
        id: payload.id,
        kind: def.markerKind,
        position: payload.position,
        label: def.label,
        owner: payload.from,
        createdAt: payload.at,
        ...(deps.ttlMs !== undefined ? { expiresAt: payload.at + deps.ttlMs } : {}),
        meta: { ping: true, category: payload.category, callout: payload.callout },
      };
      deps.markers.add(markerInput);
      deps.feed.push(feedAction, payload);
      return deps.markers.get(payload.id)!;
    },
    ping(from, hit, category) {
      const payload = system.buildPayload(from, hit, category);
      system.broadcast(payload);
      return payload;
    },
  };

  return system;
}
