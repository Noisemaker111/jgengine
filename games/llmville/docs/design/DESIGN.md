# LLMville — Design System

The source of truth for how LLMville looks and feels. If you're adding UI, match this. When in
doubt, favor warmth and clarity over flash.

Companion files:
- **Tokens only** in `apps/web/src/index.css` (`:root` palette, `@theme`, base body/html).
- **Primitives** in `apps/web/src/components/ui/` (`Panel`, `Card`, `Button`, … — `cva` + Tailwind). No `game-ui/` or `Game*` names.
- **Domain UI** in `<domain>/components/`.
- Brand mark components in `apps/web/src/branding/`.

## 1. Brand in one line

LLMville is a **cozy co-op AI-lab tycoon**. You build a little lab, rack up GPUs, train models,
and grow. The feeling we want is a **warm miniature diorama at golden hour** — inviting and
hand-made, not a cold sci-fi terminal.

Tagline: **"Build small. Think big."** (optional under the wordmark via `BrandLogo` `showTagline`).

Voice: friendly, plain, a little playful. "New Lab", "Keep it / Delete world", "your lab is
waiting." Sentence case, not SHOUTING. No fake hacker telemetry ("AUTH.SYSTEM.ONLINE") — that
was the old look and is gone.

## 2. Palette

The whole app sits on a deep warm-green "ink" with cream text, one teal accent, and coral for
the single most important action on a screen. Wood/amber is a supporting warm tone.

| Token | Hex | Use |
| --- | --- | --- |
| `--brand-ink` | `#16201E` | App background base (deep teal-green) |
| `--brand-ink-2` | `#1F2B28` | Raised background / cards |
| `--brand-cream` | `#F4ECDD` | Primary text on dark |
| `--brand-cream-dim` | `#C7BCA9` | Secondary text |
| `--brand-teal` | `#5FC2A8` | **Accent** — links, focus, status, mascot eyes |
| `--brand-teal-deep` | `#3C8C76` | Teal shadows / pressed |
| `--brand-coral` | `#E8836B` | **Primary action** — one per screen |
| `--brand-coral-deep` | `#C75D45` | Coral shadow / hover |
| `--brand-amber` | `#E0A95C` | Warm wood highlight, secondary tags, ambient glow |
| `--brand-wood` | `#B07A4E` | Furniture-warm accent |
| `--destructive` | `#D9544A` | Delete / errors (warm red, never neon) |

Surfaces are translucent dark glass, not solid blocks — the "toy room" panel:
`--surface` (panels), `--surface-strong` (modals/auth cards), with `--surface-border` hairlines.

Rules of thumb:
- **One coral thing per screen.** Coral = the primary verb (New Lab, Continue, Confirm). If two
  things are coral, neither reads as primary.
- **Teal is for "alive" things**: links, focus rings, status dots, selection, the mascot.
- **Amber is seasoning**, not structure — glows, a tag, wood. Don't build a screen on amber.
- No neon green, no cyan, no purple. Those were the old incoherent palette.

## 3. Typography

Two rounded, friendly families (loaded in `index.html`):

- **Baloo 2** — display / headings / buttons / brand. `var(--font-game)`. Chunky and warm.
- **Nunito** — body, labels, paragraphs. `var(--font-sans)`. Rounded but legible.

Use:
- Headings (`h1`–`h6`) default to Baloo 2, **sentence case**, near-zero tracking. Don't force
  uppercase on headings.
- Body text is Nunito 400–600. Buttons are Baloo 2 700.
- Drop `font-mono` for product copy — monospace read as "hacker terminal" and is off-brand.

## 4. Components

Use primitives in `components/ui/` — styles live in those files via `cva`, not in `index.css`. Name by role (`Panel`, `Card`, `Button`, `Field`, `Badge`, `Progress`), not `Game*`. Do not add new global `.game-*` classes.

- `Button` — flat rounded control. Title/sentence case, never uppercase. No underborder or glass.
  - `primary` — solid coral fill. The one primary action.
  - `secondary` — teal-tinted glass. Supporting actions.
  - Menu lists use a full-width left-aligned button layout variant.
- `Panel` — translucent glass surfaces (default = in-page, overlay variant = modal/auth). Rounded `--r-surface`, hairline border, soft shadow.
- Display headings — cream→warm gradient (`font-game`). Body uses Nunito.
- Page backdrop — warm radial glow + faint cream dot grid (owned by shell/layout components).
- `Progress` / `Badge` — resource bars; pill tokens for chips.

Brand components:
- `MascotBot` — the rounded "tiny mind" robot (SVG, tintable via `currentColor`, teal eyes).
- `BrandLogo` — mascot + **LLMville** wordmark only (no tracked sub-label under the name).
  `variant` `inline` for chrome, `stacked` for hero/auth; optional `showTagline` for
  "Build small. Think big."

Shape & depth language: generous rounding, soft layered shadows, subtle warm glow on hover.
Avoid sharp corners, hard neon outlines, and CRT/scanline effects (removed). The exact rounding
and nesting rules are no longer "generous, ≥1rem and vibes" — they're fixed in section 5 below.

## 5. Shape, elevation & spacing discipline (strict)

This section exists because the app drifted into one look for everything: panels, buttons,
inputs, the install-command box, status chips, and even brand marks were all the same
translucent glass card at ~1.1–1.5rem rounding, and panels nested bordered cards three deep
(`game-panel` → inner `rounded-xl` → inner `rounded-lg` → row). When every element is the same
shape, nothing reads as more or less important than anything else, and the heavy repeated
padding makes simple panels feel bulky. The fix is not "less rounding" — it's **one shape and
one elevation per role**, decided by the rules here, not per-component taste.

### 5.1 Roles, not vibes

Every box on screen is exactly one of four **roles**. The role decides its radius, its border,
its shadow, and its background. You do not get to pick these per component — you pick the role,
and the role picks the rest.

| Role | What it is | Radius token | Border | Shadow | Background |
| --- | --- | --- | --- | --- | --- |
| **Surface** | A page panel, modal, or HUD card — "a room" | `--r-surface` (1.5rem) | hairline `--surface-border` | layered drop shadow | glass (`--surface` / `--surface-strong`) |
| **Control** | A thing you click: button, tab, menu pill | `--r-control` (0.85rem) | per-variant | soft press shadow | per-variant fill |
| **Field** | A thing that holds data: input, code/command block, read-only value row | `--r-field` (0.6rem) | inset hairline | none (inset only) | recessed `rgba(0,0,0,.25)` |
| **Token** | A small status/identity mark: chip, badge, dot, progress, avatar | `--r-pill` (999px) | optional thin | none | tinted by meaning |

Concrete consequences:
- A button must **never** share a radius with the panel it sits in. Controls are tighter than
  surfaces on purpose, so a button never looks like a mini-panel and a panel never looks
  clickable.
- An input and a command block are **Fields**: tight radius, recessed (carved-in), no outer
  shadow. They should look like a slot cut into the surface, not another card stacked on top.
- Status like `WAITING` / `ACTIVE` is a **Token**: full-round pill, colored by meaning, no card
  chrome around it.
- Brand marks (`MascotBot`, `BrandLogo`, the mascot circle) are **not boxes** — they sit on the
  background transparently, or in a circle. Never wrap a logo in a glass card.

### 5.2 Elevation: two levels, hard cap

Depth is layered front-to-back as levels. **Level 3 is forbidden.**

- **L0 — page**: `game-bg-grid`. No border, no shadow. Everything lives on it.
- **L1 — surface**: one bordered, shadowed glass card (a Surface role). This is the *only* level
  that gets a visible border + drop shadow.
- **L2 — inset group / control**: groupings *inside* a Surface. An L2 group is separated by
  **spacing, a divider, or a faint background tint only** — no border, no drop shadow. A Control
  or Field also counts as L2.

If you find yourself giving something inside a panel its own border *and* shadow *and* rounded
card, stop — that's an L3 card-in-a-card. Flatten it: drop the border/shadow and let spacing or a
1px divider (`--surface-border`) do the separating. The `WorldAgentsPanel` install box and the
credential rows are the canonical offenders to fix this way: the panel is L1; the install block
and each credential row become recessed **Fields** (L2), not nested bordered cards.

Rule of thumb: **you should never see three concentric rounded borders.** Two at most (the L1
surface, and a Field's inset edge inside it).

### 5.3 Spacing scale (strict)

Use only these steps. They map to Tailwind so there are no arbitrary `mt-[13px]`-style values.

| Step | Value | Tailwind | Use |
| --- | --- | --- | --- |
| `xs` | 4px | `1`/`0.5` gap | inside a Token, icon↔label |
| `sm` | 8px | `2` | between tightly related items in a group |
| `md` | 12px | `3` | default gap between rows in a group |
| `lg` | 16px | `4` | gap between groups; section breaks |
| `xl` | 20px | `5` | a Surface's inner padding |
| `2xl` | 32px | `8` | page gutters, hero spacing |

Padding rules:
- A **Surface** pads its content with `xl` (20px). Don't exceed it for a normal panel — bigger
  panels get *more content*, not more padding.
- A **Field** pads `sm`–`md`. A **Control**'s padding is owned by the `.game-button` classes;
  don't re-pad it.
- **One stacking mechanism per group.** Put a single `gap`/`space-y-{step}` on the container;
  do not also sprinkle `mt-2 mt-4 mt-3` on each child. Heavy uniform `mt-*` chains are the
  padding bloat the redesign is removing.
- Nested groups step the gap *down*, never up: a group inside a `lg`-gapped section uses `md` or
  `sm` inside it. Padding shrinks as you go inward; it never compounds.

### 5.4 Tokens to add / consume

Add explicit role-radius tokens to `index.css` `:root` and use *them*, not raw `rounded-xl`
guesses, so the system is enforceable in one place:

```css
--r-surface: 1.5rem;   /* L1 panels, modals, HUD cards */
--r-control: 0.85rem;  /* buttons, tabs, menu pills    */
--r-field: 0.6rem;     /* inputs, command/code blocks  */
--r-pill: 999px;       /* chips, badges, dots, progress */
```

Then: `Panel` / HUD surfaces → `--r-surface`; `Button` / tabs → `--r-control`; inputs and command blocks →
`--r-field`; chips / `Progress` / `Badge` → `--r-pill`. New components reference the role token via
Tailwind or `cva`; they don't reinvent a radius. The old generic `--radius-sm…2xl` ramp stays only for
third-party/shadcn primitives that expect it.

### 5.5 Quick self-check before shipping UI

1. What **role** is each box? (Surface / Control / Field / Token — exactly one.)
2. Does its radius come from the **role token**, or did I hand-pick `rounded-xl`?
3. Is there any **L3** card-in-a-card? Could a divider or spacing replace its border+shadow?
4. Is there **one** stacking mechanism per group, or a pile of `mt-*`?
5. Is there exactly **one coral** Control on the screen (the section-2 rule)?

## 6. Motion

Gentle and bouncy, never frantic. Buttons use a flat fill with a simple hover darken/lighten — no underborder, no lift shadow. Entrances use `animate-in fade-in / slide-in` over 300–700ms. Ambient background orbs pulse slowly. All motion respects
`:root[data-reduced-motion="true"]`.

## 7. Layout patterns

- **Main menu** (`MainMenuLayout`): brand lockup top-left, account chip top-right, a left-aligned
  vertical pill menu, a quiet footer status strip. Warm ambient backdrop. Think "control panel
  in a cozy room," not a centered splash.
- **Auth** (`LoginScreen`, `SignupScreen`): centered `game-panel-overlay` card, stacked
  `BrandLogo` above it, teal-focus inputs, one coral submit, Google below a divider.
- **Founder select**: glass cards, teal selection ring + status dot, coral confirm.

## 8. Implementation status

Done:
- Design tokens, fonts, and role radii in `index.css` `:root` / `@theme`.
- Main menu, login, signup, founder-select restyled to cozy palette.
- `MascotBot` + `BrandLogo`; `index.html` fonts + metadata.
- Field helpers exist (`Field`, `CopyControl`, `Token`, `InsetSection`) but are split across `components/game/` and misnamed with `Game*` prefix.

Not done (blocking good ownership):
- `components/game-ui/` and `components/game/` must be **merged into `components/ui/`** with role names (`Panel`, `Card`, `Button`, …) — then deleted. The whole app is the game; `game-ui` is not a meaningful layer.
- `index.css` still contains ~2000 lines of component/feature selectors. Move into owning components and delete in one pass (see **UI** section above).
