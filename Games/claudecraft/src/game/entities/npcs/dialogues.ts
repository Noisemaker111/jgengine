import type { DialogueDef } from "@jgengine/react/components";

export const DIALOGUES: readonly DialogueDef[] = [
  {
    id: "dlg_marshal_redbrook",
    lines: [
      { speaker: "Marshal Redbrook", text: "Keep your blade close, traveler. The Vale is not what it was." },
      {
        choices: [
          { label: "[Wolves at the Door] Accept", invoke: { command: "quest.accept", args: { questId: "wolves_at_the_door" } } },
          { label: "[Wolves at the Door] Turn in", invoke: { command: "quest.turnIn", args: { questId: "wolves_at_the_door" } } },
          { label: "[Fang Bounty] Accept", invoke: { command: "quest.accept", args: { questId: "wolf_fang_bounty" } } },
          { label: "[Fang Bounty] Turn in", invoke: { command: "quest.turnIn", args: { questId: "wolf_fang_bounty" } } },
          { label: "[Boar Cull] Accept", invoke: { command: "quest.accept", args: { questId: "boar_cull" } } },
          { label: "[Boar Cull] Turn in", invoke: { command: "quest.turnIn", args: { questId: "boar_cull" } } },
          { label: "[Bristly Boar Hides] Accept", invoke: { command: "quest.accept", args: { questId: "bristly_boar_hides" } } },
          { label: "[Bristly Boar Hides] Turn in", invoke: { command: "quest.turnIn", args: { questId: "bristly_boar_hides" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
  {
    id: "dlg_trader_wilkes",
    lines: [
      { speaker: "Trader Wilkes", text: "Fresh bread, clean water, fair prices. What can I get you?" },
      {
        choices: [
          { label: "Browse goods", invoke: { command: "shop.open", args: { shopId: "shop_eastbrook" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
  {
    id: "dlg_brother_aldric",
    lines: [
      { speaker: "Brother Aldric", text: "The Light keep you. Even the dead find no rest here of late." },
      {
        choices: [
          { label: "[The Restless Dead] Accept", invoke: { command: "quest.accept", args: { questId: "the_restless_dead" } } },
          { label: "[The Restless Dead] Turn in", invoke: { command: "quest.turnIn", args: { questId: "the_restless_dead" } } },
          { label: "[Whispers Below] Accept", invoke: { command: "quest.accept", args: { questId: "whispers_below" } } },
          { label: "[Whispers Below] Turn in", invoke: { command: "quest.turnIn", args: { questId: "whispers_below" } } },
          { label: "[The Binding Rite] Accept", invoke: { command: "quest.accept", args: { questId: "the_binding_rite" } } },
          { label: "[The Binding Rite] Turn in", invoke: { command: "quest.turnIn", args: { questId: "the_binding_rite" } } },
          { label: "[Into the Hollow] Accept", invoke: { command: "quest.accept", args: { questId: "into_the_hollow" } } },
          { label: "[Into the Hollow] Turn in", invoke: { command: "quest.turnIn", args: { questId: "into_the_hollow" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
  {
    id: "dlg_warden_fenwick",
    lines: [
      { speaker: "Warden Fenwick", text: "Hold at the gate. Past those reeds, the fen does the killing for us." },
      {
        choices: [
          { label: "[Teeth of the Fen] Accept", invoke: { command: "quest.accept", args: { questId: "teeth_of_the_fen" } } },
          { label: "[Teeth of the Fen] Turn in", invoke: { command: "quest.turnIn", args: { questId: "teeth_of_the_fen" } } },
          { label: "[Pelts for the Causeway] Accept", invoke: { command: "quest.accept", args: { questId: "pelts_for_the_causeway" } } },
          { label: "[Pelts for the Causeway] Turn in", invoke: { command: "quest.turnIn", args: { questId: "pelts_for_the_causeway" } } },
          { label: "[Mirefen Widows] Accept", invoke: { command: "quest.accept", args: { questId: "mirefen_widows" } } },
          { label: "[Mirefen Widows] Turn in", invoke: { command: "quest.turnIn", args: { questId: "mirefen_widows" } } },
          { label: "[Venom for the Apothecary] Accept", invoke: { command: "quest.accept", args: { questId: "venom_for_the_apothecary" } } },
          { label: "[Venom for the Apothecary] Turn in", invoke: { command: "quest.turnIn", args: { questId: "venom_for_the_apothecary" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
  {
    id: "dlg_provisioner_hale",
    lines: [
      { speaker: "Provisioner Hale", text: "Dry boots, dry bread, dry powder — at Fenbridge you get two of the three on a good day." },
      {
        choices: [
          { label: "Browse goods", invoke: { command: "shop.open", args: { shopId: "shop_fenbridge" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
  {
    id: "dlg_brother_aldric_fen",
    lines: [
      { speaker: "Brother Aldric", text: "The Light keep you above the water. The dead in this fen do not sleep — they wade." },
      { choices: [{ label: "Farewell.", invoke: null }] },
    ],
  },
  {
    id: "dlg_captain_thessaly",
    lines: [
      { speaker: "Captain Thessaly", text: "Two hundred years this wall has held. It will not break on my watch — but it groans." },
      {
        choices: [
          { label: "[Ridge Stalkers] Accept", invoke: { command: "quest.accept", args: { questId: "ridge_stalkers" } } },
          { label: "[Ridge Stalkers] Turn in", invoke: { command: "quest.turnIn", args: { questId: "ridge_stalkers" } } },
          { label: "[Stalker Pelts] Accept", invoke: { command: "quest.accept", args: { questId: "stalker_pelts" } } },
          { label: "[Stalker Pelts] Turn in", invoke: { command: "quest.turnIn", args: { questId: "stalker_pelts" } } },
          { label: "[Deeprock Tunnelers] Accept", invoke: { command: "quest.accept", args: { questId: "deeprock_tunnelers" } } },
          { label: "[Deeprock Tunnelers] Turn in", invoke: { command: "quest.turnIn", args: { questId: "deeprock_tunnelers" } } },
          { label: "[Glowing Wax] Accept", invoke: { command: "quest.accept", args: { questId: "glowing_wax" } } },
          { label: "[Glowing Wax] Turn in", invoke: { command: "quest.turnIn", args: { questId: "glowing_wax" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
  {
    id: "dlg_quartermaster_bree",
    lines: [
      { speaker: "Quartermaster Bree", text: "Wool, hardtack, and steel-shod boots — Highwatch runs on all three, and I am short of everything." },
      {
        choices: [
          { label: "Browse goods", invoke: { command: "shop.open", args: { shopId: "shop_highwatch" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
  {
    id: "dlg_brother_aldric_highwatch",
    lines: [
      { speaker: "Brother Aldric", text: "From a chapel yard in the Vale to the roof of the world... the trail we have followed ends here." },
      { choices: [{ label: "Farewell.", invoke: null }] },
    ],
  },
];
