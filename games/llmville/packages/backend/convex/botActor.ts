const BOT_ACTOR_PREFIX = "bot:";

export const BOT_NONCE_CLAIM = "bot_nonce";

export function botActorExternalId(ownerExternalId: string): string {
  return `${BOT_ACTOR_PREFIX}${ownerExternalId}`;
}

export function isBotActorExternalId(externalId: string): boolean {
  return externalId.startsWith(BOT_ACTOR_PREFIX);
}

export function ownerFromBotActor(actorExternalId: string): string {
  return actorExternalId.slice(BOT_ACTOR_PREFIX.length);
}
