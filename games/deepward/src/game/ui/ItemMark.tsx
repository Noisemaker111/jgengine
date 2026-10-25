import { IconTreatment } from '@jgengine/react/iconTreatment';
import { hudTheme } from '@jgengine/react/hudTheme';
import { gameFontStacks } from '@jgengine/react/gameFonts';
import { ITEMS, type ItemKind } from '../state';
import { GAME_FONTS } from '../../art/fonts/fonts';

const FONTS = gameFontStacks(GAME_FONTS);

/** Marrow's inventory is a stamped issue docket, with game-specific technical pictograms. The shell applies it at the HUD root. */
export const shiftTheme = hudTheme({
 palette:{accent:'#d5b879',accentDeep:'#8c723f',accentGlow:'#d5b87933',accentDim:'#d5b87915',health:'#a1e1d5',healthDeep:'#467c73',ammo:'#e1c18c'},
 surface:{surface:'#25383b',surfaceDeep:'#142429',edge:'#657d76',edgeBright:'#a1c4b3',text:'#ede9d9',textDim:'#bac7c1',backdrop:'#0d181bcc'},
 font:{display:FONTS.fontDisplay,body:FONTS.fontBody,numeric:FONTS.fontNumeric},
 frame:{bg:'linear-gradient(150deg,#27383b,#142429)',border:'#7c908b',radius:'0',glow:'none'},
 slot:{bg:'#1b3030',border:'#5a7470',radius:'0'},
 state:{disabledOpacity:'1',focusRing:'0 0 0 3px #9ce0da'},
});
function Glyph({kind}:{kind:ItemKind}) {
 return <svg viewBox="0 0 64 64" fill="none" stroke={ITEMS[kind].color} strokeWidth="3" strokeLinejoin="round" aria-hidden="true">
  {kind==='wire'?<><ellipse cx="32" cy="14" rx="19" ry="8"/><path d="M13 14v32c0 5 9 9 19 9s19-4 19-9V14M13 22c10 9 28 9 38 0M13 30c10 9 28 9 38 0M13 38c10 9 28 9 38 0M28 6v13m8-13v13"/></>
   :kind==='polymer'?<><rect x="9" y="11" width="30" height="30" rx="8"/><rect x="16" y="18" width="16" height="16" rx="4"/><rect x="27" y="27" width="28" height="27" rx="8"/><rect x="34" y="34" width="14" height="13" rx="3"/></>
   :kind==='cells'?<><path d="M18 12h28v44H18zM26 6h12v6M24 21h16M24 45h16"/><path d="m35 25-9 11h8l-4 7 10-12h-8z" fill={ITEMS[kind].color}/></>
   :kind==='ink'?<><path d="M20 6h24v11l7 8v31H13V25l7-8zM20 17h24M18 32h28v17H18zM23 11h18"/><path d="M32 34c-8 10-8 13 0 13s8-3 0-13" fill={ITEMS[kind].color}/></>
   :<><path d="M5 24h38l4 5h12v7H39l-7 8H20l-4-8H5zM20 36l-3 15h10l4-15M43 24v12M48 27v9M35 19v5M12 19v5"/><path d="M6 27h11v6H6z" fill={ITEMS[kind].color}/></>}
 </svg>;
}
export function ItemMark({kind,size=32}:{kind:ItemKind;size?:number}) {
 return <IconTreatment glyph={<Glyph kind={kind}/>} school="steel" size={size} className="dw-item-mark" style={{background:'linear-gradient(145deg,#314644,#122528)',borderColor:ITEMS[kind].color,borderRadius:0}} />;
}
