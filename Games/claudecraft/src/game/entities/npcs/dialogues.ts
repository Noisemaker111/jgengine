import type { DialogueDef } from "@jgengine/react/components";

export const DIALOGUES: readonly DialogueDef[] = [
  {
    id: "dlg_marshal_redbrook",
    lines: [
      { speaker: "Marshal Redbrook", text: "Keep your blade close. The Vale is not what it was." },
      {
        choices: [
          { label: "[Wolves at the Door] Accept", invoke: { command: "quest.accept", args: { questId: "q_wolves" } } },
          { label: "[Wolves at the Door] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_wolves" } } },
          { label: "[The Old Wolf] Accept", invoke: { command: "quest.accept", args: { questId: "q_greyjaw" } } },
          { label: "[The Old Wolf] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_greyjaw" } } },
          { label: "[Bandits of the Vale] Accept", invoke: { command: "quest.accept", args: { questId: "q_bandits" } } },
          { label: "[Bandits of the Vale] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_bandits" } } },
          { label: "[The Ringleader] Accept", invoke: { command: "quest.accept", args: { questId: "q_ringleader" } } },
          { label: "[The Ringleader] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_ringleader" } } },
          { label: "[Mogger Must Fall] Accept", invoke: { command: "quest.accept", args: { questId: "q_mogger" } } },
          { label: "[Mogger Must Fall] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_mogger" } } },
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
    id: "dlg_wilkes_hand",
    lines: [
      { speaker: "Caravan Hand Doss", text: "Wilkes has me chasing down what the road keeps taking. You look capable enough." },
      {
        choices: [
          { label: "[Bristly Boar Hides] Accept", invoke: { command: "quest.accept", args: { questId: "q_boars" } } },
          { label: "[Bristly Boar Hides] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_boars" } } },
          { label: "[Stolen Supplies] Accept", invoke: { command: "quest.accept", args: { questId: "q_supplies" } } },
          { label: "[Stolen Supplies] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_supplies" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
  {
    id: "dlg_apothecary_lin",
    lines: [
      { speaker: "Apothecary Lin", text: "Careful where you step in the eastern woods, friend." },
      {
        choices: [
          { label: "[Sableweb Menace] Accept", invoke: { command: "quest.accept", args: { questId: "q_spiders" } } },
          { label: "[Sableweb Menace] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_spiders" } } },
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
          { label: "[The Restless Dead] Accept", invoke: { command: "quest.accept", args: { questId: "q_bones" } } },
          { label: "[The Restless Dead] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_bones" } } },
          { label: "[Whispers Below] Accept", invoke: { command: "quest.accept", args: { questId: "q_whispers" } } },
          { label: "[Whispers Below] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_whispers" } } },
          { label: "[The Names of the Dead] Accept", invoke: { command: "quest.accept", args: { questId: "q_names_of_the_dead" } } },
          { label: "[The Names of the Dead] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_names_of_the_dead" } } },
          { label: "[Silence the Call] Accept", invoke: { command: "quest.accept", args: { questId: "q_silence_the_call" } } },
          { label: "[Silence the Call] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_silence_the_call" } } },
          { label: "[The Binding Rite] Accept", invoke: { command: "quest.accept", args: { questId: "q_rite" } } },
          { label: "[The Binding Rite] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_rite" } } },
          { label: "[Into the Hollow] Accept", invoke: { command: "quest.accept", args: { questId: "q_hollow" } } },
          { label: "[Into the Hollow] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_hollow" } } },
          { label: "[The Sexton's Bell] Accept", invoke: { command: "quest.accept", args: { questId: "q_sexton" } } },
          { label: "[The Sexton's Bell] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_sexton" } } },
          { label: "[The Gravecaller's Trail] Accept", invoke: { command: "quest.accept", args: { questId: "q_gravecallers_trail" } } },
          { label: "[The Gravecaller's Trail] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_gravecallers_trail" } } },
          { label: "[Muster at Fenbridge] Accept", invoke: { command: "quest.accept", args: { questId: "q_fenbridge_muster" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
  {
    id: "dlg_fisherman_brandt",
    lines: [
      { speaker: "Fisherman Brandt", text: "Blrb-glub— sorry, been listening to those fish-men too long." },
      {
        choices: [
          { label: "[Trouble at the Lake] Accept", invoke: { command: "quest.accept", args: { questId: "q_murlocs" } } },
          { label: "[Trouble at the Lake] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_murlocs" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
  {
    id: "dlg_foreman_odell",
    lines: [
      { speaker: "Foreman Odell", text: "Whole dig's crawling with those dirt-caked vermin!" },
      {
        choices: [
          { label: "[Rats in the Mine] Accept", invoke: { command: "quest.accept", args: { questId: "q_mine" } } },
          { label: "[Rats in the Mine] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_mine" } } },
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
          { label: "[Muster at Fenbridge] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_fenbridge_muster" } } },
          { label: "[Teeth of the Fen] Accept", invoke: { command: "quest.accept", args: { questId: "q_prowlers" } } },
          { label: "[Teeth of the Fen] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_prowlers" } } },
          { label: "[The Deepfen Stirs] Accept", invoke: { command: "quest.accept", args: { questId: "q_deepfen" } } },
          { label: "[The Deepfen Stirs] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_deepfen" } } },
          { label: "[Back to the Shallows] Accept", invoke: { command: "quest.accept", args: { questId: "q_deepfen_purge" } } },
          { label: "[Back to the Shallows] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_deepfen_purge" } } },
          { label: "[Mounds of the Mirefen] Accept", invoke: { command: "quest.accept", args: { questId: "q_trolls" } } },
          { label: "[Mounds of the Mirefen] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_trolls" } } },
          { label: "[The Deacon of the Mire] Accept", invoke: { command: "quest.accept", args: { questId: "q_deacon" } } },
          { label: "[The Deacon of the Mire] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_deacon" } } },
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
    id: "dlg_hale_dockhand",
    lines: [
      { speaker: "Dockhand Sela", text: "Hale keeps the ledger, I keep the causeway from swallowing what's on it. Mind the reeds." },
      {
        choices: [
          { label: "[Pelts for the Causeway] Accept", invoke: { command: "quest.accept", args: { questId: "q_prowler_pelts" } } },
          { label: "[Pelts for the Causeway] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_prowler_pelts" } } },
          { label: "[The Lost Caravan] Accept", invoke: { command: "quest.accept", args: { questId: "q_fen_supplies" } } },
          { label: "[The Lost Caravan] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_fen_supplies" } } },
          { label: "[The Codfather] Accept", invoke: { command: "quest.accept", args: { questId: "q_the_codfather" } } },
          { label: "[The Codfather] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_the_codfather" } } },
          { label: "[The Glutton] Accept", invoke: { command: "quest.accept", args: { questId: "q_grubjaw" } } },
          { label: "[The Glutton] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_grubjaw" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
  {
    id: "dlg_herbalist_yara",
    lines: [
      { speaker: "Herbalist Yara", text: "Mind the thicket west of the road. The webs are thick as sailcloth this season." },
      {
        choices: [
          { label: "[Silk and Venom] Accept", invoke: { command: "quest.accept", args: { questId: "q_widows" } } },
          { label: "[Silk and Venom] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_widows" } } },
          { label: "[The Broodmother] Accept", invoke: { command: "quest.accept", args: { questId: "q_broodmother" } } },
          { label: "[The Broodmother] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_broodmother" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
  {
    id: "dlg_scout_maren",
    lines: [
      { speaker: "Scout Maren", text: "Quiet feet and a short blade keep you breathing out here. Speak quick — I am due back in the reeds." },
      {
        choices: [
          { label: "[Fetish and Bone] Accept", invoke: { command: "quest.accept", args: { questId: "q_troll_fetishes" } } },
          { label: "[Fetish and Bone] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_troll_fetishes" } } },
          { label: "[Robes in the Reeds] Accept", invoke: { command: "quest.accept", args: { questId: "q_cult_camp" } } },
          { label: "[Robes in the Reeds] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_cult_camp" } } },
          { label: "[The Knight-Commander's Shame] Accept", invoke: { command: "quest.accept", args: { questId: "q_olen" } } },
          { label: "[The Knight-Commander's Shame] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_olen" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
  {
    id: "dlg_brother_aldric_fen",
    lines: [
      { speaker: "Brother Aldric", text: "The Light keep you above the water. The dead in this fen do not sleep — they wade." },
      {
        choices: [
          { label: "[The Watch on the Peaks] Accept", invoke: { command: "quest.accept", args: { questId: "q_highwatch_summons" } } },
          { label: "[Idols of the Deep] Accept", invoke: { command: "quest.accept", args: { questId: "q_idols" } } },
          { label: "[Idols of the Deep] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_idols" } } },
          { label: "[The Drowned Dead] Accept", invoke: { command: "quest.accept", args: { questId: "q_drowned" } } },
          { label: "[The Drowned Dead] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_drowned" } } },
          { label: "[Censers from the Deep] Accept", invoke: { command: "quest.accept", args: { questId: "q_drowned_censers" } } },
          { label: "[Censers from the Deep] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_drowned_censers" } } },
          { label: "[No Rest in the Reeds] Accept", invoke: { command: "quest.accept", args: { questId: "q_no_rest" } } },
          { label: "[No Rest in the Reeds] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_no_rest" } } },
          { label: "[Stopping the Summoning] Accept", invoke: { command: "quest.accept", args: { questId: "q_summoners" } } },
          { label: "[Stopping the Summoning] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_summoners" } } },
          { label: "[The Sunken Bastion] Accept", invoke: { command: "quest.accept", args: { questId: "q_bastion_door" } } },
          { label: "[The Sunken Bastion] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_bastion_door" } } },
          { label: "[The Fogbinder] Accept", invoke: { command: "quest.accept", args: { questId: "q_mistcaller" } } },
          { label: "[The Fogbinder] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_mistcaller" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
  {
    id: "dlg_captain_thessaly",
    lines: [
      { speaker: "Captain Thessaly", text: "Two hundred years this wall has held. It will not break on my watch — but it groans." },
      {
        choices: [
          { label: "[The Watch on the Peaks] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_highwatch_summons" } } },
          { label: "[Stalkers on the Ridge] Accept", invoke: { command: "quest.accept", args: { questId: "q_stalkers" } } },
          { label: "[Stalkers on the Ridge] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_stalkers" } } },
          { label: "[The Stalkers Return] Accept", invoke: { command: "quest.accept", args: { questId: "q_stalkers_return" } } },
          { label: "[The Stalkers Return] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_stalkers_return" } } },
          { label: "[Old Cragmaw] Accept", invoke: { command: "quest.accept", args: { questId: "q_old_cragmaw" } } },
          { label: "[Old Cragmaw] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_old_cragmaw" } } },
          { label: "[The Captain's Bounty] Accept", invoke: { command: "quest.accept", args: { questId: "q_ogre_bounty" } } },
          { label: "[The Captain's Bounty] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_ogre_bounty" } } },
          { label: "[Break the War-Camp] Accept", invoke: { command: "quest.accept", args: { questId: "q_crushers" } } },
          { label: "[Break the War-Camp] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_crushers" } } },
          { label: "[Warlord Drogmar] Accept", invoke: { command: "quest.accept", args: { questId: "q_drogmar" } } },
          { label: "[Warlord Drogmar] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_drogmar" } } },
          { label: "[The Revenant Fields] Accept", invoke: { command: "quest.accept", args: { questId: "q_revenants" } } },
          { label: "[The Revenant Fields] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_revenants" } } },
          { label: "[Bones of the Vanguard] Accept", invoke: { command: "quest.accept", args: { questId: "q_revenant_vanguard" } } },
          { label: "[Bones of the Vanguard] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_revenant_vanguard" } } },
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
    id: "dlg_bree_clerk",
    lines: [
      { speaker: "Requisitions Clerk Pell", text: "Bree handles the shop, I handle the paperwork — and the paperwork wants pelts and strange wax." },
      {
        choices: [
          { label: "[Winter Is Coming to Highwatch] Accept", invoke: { command: "quest.accept", args: { questId: "q_stalker_pelts" } } },
          { label: "[Winter Is Coming to Highwatch] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_stalker_pelts" } } },
          { label: "[Cloaks for the Watch] Accept", invoke: { command: "quest.accept", args: { questId: "q_stalker_cloaks" } } },
          { label: "[Cloaks for the Watch] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_stalker_cloaks" } } },
          { label: "[Strange Wax] Accept", invoke: { command: "quest.accept", args: { questId: "q_glowing_wax" } } },
          { label: "[Strange Wax] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_glowing_wax" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
  {
    id: "dlg_scout_maren_highwatch",
    lines: [
      { speaker: "Scout Maren", text: "I tracked cultists through the fen at your side, and the trail led here. The peaks are worse. Stay sharp." },
      {
        choices: [
          { label: "[Ogres at the Foothills] Accept", invoke: { command: "quest.accept", args: { questId: "q_ogre_edges" } } },
          { label: "[Ogres at the Foothills] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_ogre_edges" } } },
          { label: "[Totems of War] Accept", invoke: { command: "quest.accept", args: { questId: "q_ogre_totems" } } },
          { label: "[Totems of War] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_ogre_totems" } } },
          { label: "[The Bound Guardian] Accept", invoke: { command: "quest.accept", args: { questId: "q_korgath" } } },
          { label: "[The Bound Guardian] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_korgath" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
  {
    id: "dlg_loremaster_caddis",
    lines: [
      { speaker: "Loremaster Caddis", text: "Mind the loose shale. The mountain has been... restless of late. I intend to learn why." },
      {
        choices: [
          { label: "[Deeprock Trouble] Accept", invoke: { command: "quest.accept", args: { questId: "q_kobold_tunnels" } } },
          { label: "[Deeprock Trouble] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_kobold_tunnels" } } },
          { label: "[The Mountain Wakes] Accept", invoke: { command: "quest.accept", args: { questId: "q_elementals" } } },
          { label: "[The Mountain Wakes] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_elementals" } } },
          { label: "[Cores of the Storm] Accept", invoke: { command: "quest.accept", args: { questId: "q_shard_cores" } } },
          { label: "[Cores of the Storm] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_shard_cores" } } },
          { label: "[The Shardlord] Accept", invoke: { command: "quest.accept", args: { questId: "q_kazzix" } } },
          { label: "[The Shardlord] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_kazzix" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
  {
    id: "dlg_brother_aldric_highwatch",
    lines: [
      {
        speaker: "Brother Aldric",
        text: "From a chapel yard in the Vale to the roof of the world... the trail we have followed ends here. I can feel the mountain listening.",
      },
      {
        choices: [
          { label: "[Chants on the Wind] Accept", invoke: { command: "quest.accept", args: { questId: "q_zealots" } } },
          { label: "[Chants on the Wind] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_zealots" } } },
          { label: "[Orders from Below] Accept", invoke: { command: "quest.accept", args: { questId: "q_cult_orders" } } },
          { label: "[Orders from Below] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_cult_orders" } } },
          { label: "[The Phylactery Ring] Accept", invoke: { command: "quest.accept", args: { questId: "q_necromancers" } } },
          { label: "[The Phylactery Ring] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_necromancers" } } },
          { label: "[Sigils of the Wyrm] Accept", invoke: { command: "quest.accept", args: { questId: "q_wyrm_sigils" } } },
          { label: "[Sigils of the Wyrm] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_wyrm_sigils" } } },
          { label: "[Breaking the Seal] Accept", invoke: { command: "quest.accept", args: { questId: "q_breaking_the_seal" } } },
          { label: "[Breaking the Seal] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_breaking_the_seal" } } },
          { label: "[The Voice Below] Accept", invoke: { command: "quest.accept", args: { questId: "q_voice_below" } } },
          { label: "[The Voice Below] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_voice_below" } } },
          { label: "[The Sanctum Gate] Accept", invoke: { command: "quest.accept", args: { questId: "q_sanctum_gate" } } },
          { label: "[The Sanctum Gate] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_sanctum_gate" } } },
          { label: "[The Grand Necromancer] Accept", invoke: { command: "quest.accept", args: { questId: "q_velkhar" } } },
          { label: "[The Grand Necromancer] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_velkhar" } } },
          { label: "[Korzul the Gravewyrm] Accept", invoke: { command: "quest.accept", args: { questId: "q_gravewyrm" } } },
          { label: "[Korzul the Gravewyrm] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_gravewyrm" } } },
          { label: "[Unrest in the Bonefields] Accept", invoke: { command: "quest.accept", args: { questId: "q_nythraxis_restless_dead" } } },
          { label: "[Unrest in the Bonefields] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_nythraxis_restless_dead" } } },
          { label: "[Graves of the Forgotten] Accept", invoke: { command: "quest.accept", args: { questId: "q_nythraxis_graves" } } },
          { label: "[Graves of the Forgotten] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_nythraxis_graves" } } },
          { label: "[The Abandoned Crypt] Accept", invoke: { command: "quest.accept", args: { questId: "q_nythraxis_sealed_crypt" } } },
          { label: "[The Abandoned Crypt] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_nythraxis_sealed_crypt" } } },
          { label: "[The Bound Guardian] Accept", invoke: { command: "quest.accept", args: { questId: "q_nythraxis_bound_guardian" } } },
          { label: "[The Bound Guardian] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_nythraxis_bound_guardian" } } },
          { label: "[Scourge's End] Accept", invoke: { command: "quest.accept", args: { questId: "q_nythraxis_scourges_end" } } },
          { label: "[Scourge's End] Turn in", invoke: { command: "quest.turnIn", args: { questId: "q_nythraxis_scourges_end" } } },
          { label: "Farewell.", invoke: null },
        ],
      },
    ],
  },
];
