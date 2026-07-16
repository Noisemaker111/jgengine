export const CLASS_ENTITY_ID = "player_hero";
export const COPPER = "copper";
export function classEntityId(classId) {
    return `${CLASS_ENTITY_ID}_${classId}`;
}
export function isPlayerEntityId(catalogId) {
    return catalogId === CLASS_ENTITY_ID || catalogId.startsWith(`${CLASS_ENTITY_ID}_`);
}
