export type SessionVisibility = "public" | "private";

export type SessionStatus = "open" | "running" | "closed";

export interface SessionListing {
  serverId: string;
  gameId: string;
  status: SessionStatus;
  visibility: SessionVisibility;
  memberCount: number;
  slotsPerServer: number;
  label?: string;
  mode?: string;
  joinCode?: string;
  tags?: readonly string[];
  updatedAt: number;
}

export interface MatchFilter {
  mode?: string;
  tags?: readonly string[];
  query?: string;
  notFull?: boolean;
  status?: readonly SessionStatus[];
  includePrivate?: boolean;
}

export interface BrowseOptions {
  limit?: number;
}

export function normalizeJoinCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateJoinCode(random: () => number, length = 6): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    const index = Math.min(CODE_ALPHABET.length - 1, Math.floor(random() * CODE_ALPHABET.length));
    code += CODE_ALPHABET[index];
  }
  return code;
}

export function hasSpace(listing: SessionListing): boolean {
  return listing.memberCount < listing.slotsPerServer;
}

export function matchesFilter(listing: SessionListing, filter: MatchFilter): boolean {
  if (listing.visibility === "private" && filter.includePrivate !== true) return false;
  const statuses = filter.status ?? (["open", "running"] as const);
  if (!statuses.includes(listing.status)) return false;
  if (filter.mode !== undefined && listing.mode !== filter.mode) return false;
  if (filter.notFull === true && !hasSpace(listing)) return false;
  if (filter.tags !== undefined && filter.tags.length > 0) {
    const owned = new Set(listing.tags ?? []);
    if (!filter.tags.every((tag) => owned.has(tag))) return false;
  }
  if (filter.query !== undefined && filter.query.length > 0) {
    const haystack = (listing.label ?? "").toLowerCase();
    if (!haystack.includes(filter.query.toLowerCase())) return false;
  }
  return true;
}

export function browseSessions(
  listings: readonly SessionListing[],
  filter: MatchFilter = {},
  options: BrowseOptions = {},
): SessionListing[] {
  const matched = listings
    .filter((listing) => matchesFilter(listing, filter))
    .sort((a, b) => b.memberCount - a.memberCount || b.updatedAt - a.updatedAt);
  return options.limit !== undefined ? matched.slice(0, options.limit) : matched;
}

export function findByJoinCode(
  listings: readonly SessionListing[],
  code: string,
): SessionListing | null {
  const normalized = normalizeJoinCode(code);
  if (normalized.length === 0) return null;
  for (const listing of listings) {
    if (listing.joinCode !== undefined && normalizeJoinCode(listing.joinCode) === normalized) {
      return listing;
    }
  }
  return null;
}

export function quickMatch(
  listings: readonly SessionListing[],
  filter: MatchFilter = {},
): SessionListing | null {
  const candidates = listings
    .filter((listing) => matchesFilter(listing, { ...filter, notFull: true }))
    .sort((a, b) => b.memberCount - a.memberCount || a.updatedAt - b.updatedAt);
  return candidates[0] ?? null;
}
