export type CommitMode = "immediate" | "simultaneous" | "resealable";

export interface SubmittedAction<TAction> {
  participant: string;
  action: TAction;
}

export interface CommitOutcome<TAction> {
  status: "committed" | "sealed" | "pending" | "rejected";
  committed: SubmittedAction<TAction>[];
  reason?: string;
}

export interface CommitControllerConfig {
  mode: CommitMode;
  participants?: readonly string[];
}

export interface CommitController<TAction> {
  readonly mode: CommitMode;
  submit(participant: string, action: TAction): CommitOutcome<TAction>;
  expected(participants: readonly string[]): void;
  hasSubmitted(participant: string): boolean;
  allReady(): boolean;
  pending(): SubmittedAction<TAction>[];
  reveal(): SubmittedAction<TAction>[];
  commit(): SubmittedAction<TAction>[];
  discard(): SubmittedAction<TAction>[];
  clear(): void;
}

export function createCommitController<TAction>(config: CommitControllerConfig): CommitController<TAction> {
  const mode = config.mode;
  let expected = config.participants === undefined ? null : [...config.participants];
  let sealed = new Map<string, TAction>();
  let revealed = false;

  function orderedSubmissions(): SubmittedAction<TAction>[] {
    const source = expected ?? [...sealed.keys()];
    const result: SubmittedAction<TAction>[] = [];
    for (const participant of source) {
      if (sealed.has(participant)) result.push({ participant, action: sealed.get(participant)! });
    }
    for (const [participant, action] of sealed) {
      if (expected !== null && !expected.includes(participant)) result.push({ participant, action });
    }
    return result;
  }

  function allReady(): boolean {
    if (expected === null) return sealed.size > 0;
    return expected.every((participant) => sealed.has(participant));
  }

  function clear(): void {
    sealed = new Map();
    revealed = false;
  }

  return {
    mode,
    submit(participant, action) {
      if (mode === "immediate") {
        return { status: "committed", committed: [{ participant, action }] };
      }
      if (sealed.has(participant) && mode !== "resealable") {
        return { status: "rejected", committed: [], reason: "already-submitted" };
      }
      sealed.set(participant, action);
      if (mode === "simultaneous") {
        return { status: "sealed", committed: [] };
      }
      return { status: "pending", committed: [] };
    },
    expected(participants) {
      expected = [...participants];
    },
    hasSubmitted: (participant) => sealed.has(participant),
    allReady,
    pending: () => orderedSubmissions(),
    reveal() {
      if (mode !== "simultaneous") return orderedSubmissions();
      if (!allReady()) return [];
      revealed = true;
      const out = orderedSubmissions();
      return out;
    },
    commit() {
      if (mode === "simultaneous" && !revealed && !allReady()) return [];
      const out = orderedSubmissions();
      clear();
      return out;
    },
    discard() {
      const discarded = orderedSubmissions();
      clear();
      return discarded;
    },
    clear,
  };
}
