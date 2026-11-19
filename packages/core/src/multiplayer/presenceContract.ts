export interface PresencePosition {
  x: number;
  y: number;
  z: number;
}

export interface PresencePose {
  position: { x: number; y?: number; z: number };
  rotationY?: number;
  rotationPitch?: number;
  externalId?: string;
}

/** Resident identity used to suppress offline actors while their owner is online. */
export interface PresenceResidentRow {
  actorExternalId: string;
  ownerActorId?: string | undefined;
}

export interface EnsurePresenceArgs<TGameId extends string = string> {
  gameId: TGameId;
  externalId: string;
}

export interface EnsurePresenceResult {
  presenceId: string;
  position: PresencePosition;
  rotationY: number;
}

export interface LeavePresenceArgs<TGameId extends string = string> {
  gameId: TGameId;
  externalId: string;
}
