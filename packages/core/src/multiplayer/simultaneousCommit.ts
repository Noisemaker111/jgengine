export type CommitPhase = "collecting" | "revealed";

export interface SealedCommit<TAction> {
  playerId: string;
  action: TAction;
  sealedAt: number;
}

export interface CommitRoundConfig {
  participants: readonly string[];
  allowReseal?: boolean;
}

export type SealResult =
  | { ok: true; allSealed: boolean }
  | { ok: false; reason: "unknown_participant" | "already_sealed" | "already_revealed" };

/** @internal */
export class CommitRound<TAction> {
  private readonly order: readonly string[];
  private readonly participants: ReadonlySet<string>;
  private readonly allowReseal: boolean;
  private readonly sealed = new Map<string, SealedCommit<TAction>>();
  private revealedFlag = false;

  constructor(config: CommitRoundConfig) {
    if (config.participants.length === 0) {
      throw new RangeError("a commit round needs at least one participant");
    }
    this.order = [...config.participants];
    this.participants = new Set(config.participants);
    this.allowReseal = config.allowReseal ?? false;
  }

  seal(playerId: string, action: TAction, at: number): SealResult {
    if (this.revealedFlag) return { ok: false, reason: "already_revealed" };
    if (!this.participants.has(playerId)) return { ok: false, reason: "unknown_participant" };
    if (this.sealed.has(playerId) && !this.allowReseal) {
      return { ok: false, reason: "already_sealed" };
    }
    this.sealed.set(playerId, { playerId, action, sealedAt: at });
    return { ok: true, allSealed: this.allSealed() };
  }

  hasSealed(playerId: string): boolean {
    return this.sealed.has(playerId);
  }

  sealedCount(): number {
    return this.sealed.size;
  }

  pending(): string[] {
    return this.order.filter((id) => !this.sealed.has(id));
  }

  allSealed(): boolean {
    return this.sealed.size === this.participants.size;
  }

  get phase(): CommitPhase {
    return this.revealedFlag ? "revealed" : "collecting";
  }

  reveal(): readonly SealedCommit<TAction>[] | null {
    if (!this.allSealed()) return null;
    this.revealedFlag = true;
    return this.order.map((id) => this.sealed.get(id)!);
  }
}

/** @internal */
export function createCommitRound<TAction>(config: CommitRoundConfig): CommitRound<TAction> {
  return new CommitRound<TAction>(config);
}

/** @internal */
export function resolveCommits<TAction, TResult>(
  reveals: readonly SealedCommit<TAction>[],
  resolver: (ordered: readonly SealedCommit<TAction>[]) => TResult,
): TResult {
  return resolver(reveals);
}
