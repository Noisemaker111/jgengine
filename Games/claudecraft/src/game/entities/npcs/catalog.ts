import { sceneMarkerXZ } from "../../../editorLayers";
import type { NpcDef } from "../../model";

type NpcMeta = Omit<NpcDef, "position">;

const NPC_META: readonly NpcMeta[] = [
  { id: "marshal_redbrook", name: "Marshal Redbrook", zone: "vale", kind: "questgiver", dialogueId: "dlg_marshal_redbrook" },
  { id: "trader_wilkes", name: "Trader Wilkes", zone: "vale", kind: "vendor", dialogueId: "dlg_trader_wilkes", shopId: "shop_eastbrook" },
  { id: "wilkes_hand", name: "Caravan Hand Doss", zone: "vale", kind: "questgiver", dialogueId: "dlg_wilkes_hand" },
  { id: "apothecary_lin", name: "Apothecary Lin", zone: "vale", kind: "questgiver", dialogueId: "dlg_apothecary_lin" },
  { id: "brother_aldric", name: "Brother Aldric", zone: "vale", kind: "questgiver", dialogueId: "dlg_brother_aldric" },
  { id: "fisherman_brandt", name: "Fisherman Brandt", zone: "vale", kind: "questgiver", dialogueId: "dlg_fisherman_brandt" },
  { id: "foreman_odell", name: "Foreman Odell", zone: "vale", kind: "questgiver", dialogueId: "dlg_foreman_odell" },
  { id: "warden_fenwick", name: "Warden Fenwick", zone: "marsh", kind: "questgiver", dialogueId: "dlg_warden_fenwick" },
  { id: "provisioner_hale", name: "Provisioner Hale", zone: "marsh", kind: "vendor", dialogueId: "dlg_provisioner_hale", shopId: "shop_fenbridge" },
  { id: "hale_dockhand", name: "Dockhand Sela", zone: "marsh", kind: "questgiver", dialogueId: "dlg_hale_dockhand" },
  { id: "herbalist_yara", name: "Herbalist Yara", zone: "marsh", kind: "questgiver", dialogueId: "dlg_herbalist_yara" },
  { id: "scout_maren", name: "Scout Maren", zone: "marsh", kind: "questgiver", dialogueId: "dlg_scout_maren" },
  { id: "brother_aldric_fen", name: "Brother Aldric", zone: "marsh", kind: "questgiver", dialogueId: "dlg_brother_aldric_fen" },
  { id: "captain_thessaly", name: "Captain Thessaly", zone: "peaks", kind: "questgiver", dialogueId: "dlg_captain_thessaly" },
  { id: "quartermaster_bree", name: "Quartermaster Bree", zone: "peaks", kind: "vendor", dialogueId: "dlg_quartermaster_bree", shopId: "shop_highwatch" },
  { id: "bree_clerk", name: "Requisitions Clerk Pell", zone: "peaks", kind: "questgiver", dialogueId: "dlg_bree_clerk" },
  { id: "scout_maren_highwatch", name: "Scout Maren", zone: "peaks", kind: "questgiver", dialogueId: "dlg_scout_maren_highwatch" },
  { id: "loremaster_caddis", name: "Loremaster Caddis", zone: "peaks", kind: "questgiver", dialogueId: "dlg_loremaster_caddis" },
  { id: "brother_aldric_highwatch", name: "Brother Aldric", zone: "peaks", kind: "questgiver", dialogueId: "dlg_brother_aldric_highwatch" },
];

/** NPCs — metadata in code, spawn positions read from the `npc:<id>` markers in `editor.scene.json`. */
export const NPCS: readonly NpcDef[] = NPC_META.map((meta) => ({ ...meta, position: sceneMarkerXZ(`npc:${meta.id}`) }));
