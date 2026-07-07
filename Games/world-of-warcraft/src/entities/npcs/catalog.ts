export interface NpcDef {
  id: string;
  name: string;
  model: string;
  walkSpeed: number;
  talkable: string;
}

export const npc_marshal: NpcDef = {
  id: "npc_marshal",
  name: "Marshal Redpath",
  model: "npc/marshal",
  walkSpeed: 0,
  talkable: "marshal_town",
};

export const npcs: NpcDef[] = [npc_marshal];
