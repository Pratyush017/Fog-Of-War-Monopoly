---
name: Tactical Carbon
colors:
  surface: '#121318'
  surface-dim: '#121318'
  surface-bright: '#38393f'
  surface-container-lowest: '#0d0e13'
  surface-container-low: '#1a1b21'
  surface-container: '#1e1f25'
  surface-container-high: '#292a2f'
  surface-container-highest: '#34343a'
  on-surface: '#e3e1e9'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#e3e1e9'
  inverse-on-surface: '#2f3036'
  outline: '#849495'
  outline-variant: '#3b494b'
  surface-tint: '#00dbe9'
  primary: '#dbfcff'
  on-primary: '#00363a'
  primary-container: '#00f0ff'
  on-primary-container: '#006970'
  inverse-primary: '#006970'
  secondary: '#ffb2ba'
  on-secondary: '#670020'
  secondary-container: '#d4004b'
  on-secondary-container: '#ffe6e8'
  tertiary: '#fff4e8'
  on-tertiary: '#412d00'
  tertiary-container: '#ffd386'
  on-tertiary-container: '#7d5800'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#7df4ff'
  primary-fixed-dim: '#00dbe9'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#ffd9dc'
  secondary-fixed-dim: '#ffb2ba'
  on-secondary-fixed: '#400011'
  on-secondary-fixed-variant: '#910030'
  tertiary-fixed: '#ffdea8'
  tertiary-fixed-dim: '#ffba20'
  on-tertiary-fixed: '#271900'
  on-tertiary-fixed-variant: '#5e4200'
  background: '#121318'
  on-background: '#e3e1e9'
  surface-variant: '#34343a'
typography:
  display-xl:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 52px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-numeric:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.04em
  label-code:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.08em
  label-action:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1.5rem
  margin-mobile: 0.75rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system delivers a high-stakes, analytical interface tailored for competitive tactical strategy. It strips away traditional board game nostalgia in favor of a covert, radar-room command terminal where hidden information, high-value territory control, and real-time capital deployment converge.

The aesthetic fuses **Tactical Minimalism** with **Subtle Glassmorphism**:
- Deep carbon and obsidian backdrops keep eye strain minimal while framing complex spatial and fiscal data.
- Precision glass overlays define interactive territories, player estates, and recon reports without visually obstructing the underlying tactical board state.
- Player identification relies on sharp, isolated neon signatures—radiating focused energy against the dark void rather than cluttering surfaces with excessive chrome.
- Every interface token reflects calculated intent: ultra-crisp geometry, refined monoline separators, and strict typographical clarity.

## Colors

The color architecture is built around an ultra-dark carbon void punctuated by precision neon accents that indicate faction identities, property ownership, fog-of-war states, and risk thresholds.

- **Background & Canvas:**
  - Base Void: `#090A0F` (Carbon Obsidian)
  - Surface Panel (Level 1): `#0E1118` with subtle alpha blending
  - Surface Overlay (Level 2): `#151923`
  - Border Glass Tint: `rgba(255, 255, 255, 0.08)` to `rgba(255, 255, 255, 0.14)`

- **Typography & Details:**
  - Primary Text: `#FFFFFF` (Ultra Crisp Pure White)
  - Secondary / Spec Details: `#94A3B8` (Zinc Muted Silver)
  - Ghost / Disabled / Grid Lines: `#475569` (Deep Slate)

- **Tactical Neon Signatures (Player & Status Accents):**
  - Player Alpha / Primary Tactical Accent: `#00F0FF` (Electric Cyan) – Radar pings, standard tactical actions, recon sectors.
  - Player Beta / Hostile Alert: `#FF3366` (Neon Crimson) – Hostile strikes, liquidation notices, bankruptcy risks.
  - Player Gamma / Capital Reserve: `#FFB800` (Tactical Amber) – High-yield transactions, mortaged estates, auction timers.
  - Player Delta / Territory Held: `#00FF9D` (Signal Emerald) – Positive yields, reinforced defensive zones, completed monopolies.

## Typography

Typography drives technical authority and split-second legibility. **Inter** serves as the primary structural and narrative face, utilizing negative letter-spacing at display scales for a compact, engineered feel.

**JetBrains Mono** is introduced for secondary readouts, numeric balances, map coordinates, turn timers, and property ledger matrices. This dual pairing creates a clear distinction between qualitative game events and quantitative tactical balances.

- Maintain strict tabular alignment (`font-variant-numeric: tabular-nums`) across all financial calculations and dice/probability rolls.
- Use uppercase for `label-code` strings (e.g., sector designations, ledger tags, protocol prompts) with expanded letter-spacing (`0.08em`).

## Layout & Spacing

The viewport acts as a dedicated tactical operations desk:
- **Core Canvas:** Fluid board center surrounded by docked HUD pods (Ledger, Recon Log, Asset Inventory, Action Array).
- **Grid Structure:** A contextual layout system based on an 8pt modular interval (`0.5rem`). Outer margins are locked to `margin` (`1.5rem`) on desktop and tighten to `margin-mobile` (`0.75rem`) on viewports under 768px.
- **HUD Shells:** Toolbars and player status pods use strict `space-sm` internal padding and `space-md` element spacing to conserve maximum visual real estate for the game map.
- **Fog of War Viewport:** Fixed aspect-ratio canvas in the center container with fluid side-rail docking that collapses into floating drawers on mobile.

## Elevation & Depth

Elevation does not use traditional blurry drop shadows. Instead, it combines **layered translucency, backdrop diffusion, and light-trapping boundary lines**.

- **Ground Level (The Board):** Solid carbon `#090A0F` with ultra-fine `#1E2433` grid lines (0.5px).
- **Sector Tiles & Inactive Properties:** Semi-opaque carbon fill `rgba(14, 17, 24, 0.7)` with `backdrop-filter: blur(8px)` and a `1px` border of `rgba(255, 255, 255, 0.06)`.
- **Active / Recon Overlay Panels:** `rgba(21, 25, 35, 0.8)` with `backdrop-filter: blur(16px)` and perimeter stroke `rgba(255, 255, 255, 0.12)`.
- **Neon Glow Accentuation (Tactical Highlighting):** Selected tiles, active player turn indicators, and scanning reticles emit localized, short-spread outer glows: `0 0 12px rgba(color, 0.35)` coupled with an inner hairline border in the corresponding neon hue.
- **Fog of War Veil:** Procedural radial or polygonal masking utilizing deep slate-to-carbon gradient ramps (`rgba(9, 10, 15, 0.96)`) layered over undisclosed enemy properties.

## Shapes

The geometric identity is clean, surgical, and architectural. Roundedness is set strictly to **Soft (`1`)**:

- Base buttons, tiles, cards, and input fields adhere to `0.25rem` (4px) corner radii.
- Large modal dialogs, HUD cards, and drawer containers scale up to `0.5rem` (8px).
- Circles are reserved exclusively for player profile pings, turn-order radar nodes, and round-state counters.
- Strictly avoid pill shapes (`rounded-full`) on interactive cards and containers to prevent the interface from drifting into casual or whimsical aesthetics.

## Components

### Buttons & Tactical Triggers
- **Primary Command:** Solid neon cyan (`#00F0FF`) background with pitch-black text (`#090A0F`), font weight `600`, subtle outer sheen on hover (`0 0 16px rgba(0, 240, 255, 0.4)`).
- **Secondary Action:** Glass fill `rgba(255, 255, 255, 0.05)`, border `1px solid rgba(255, 255, 255, 0.12)`, text `#FFFFFF`. Hover states introduce an intense interior border highlight `rgba(255, 255, 255, 0.25)`.
- **Danger / Liquidate:** Neon crimson hairline stroke (`1px solid #FF3366`), dark glass backing, neon crimson text.

### Sector / Property Cards
- Surface: Glassmorphic tile `rgba(21, 25, 35, 0.85)` with `backdrop-blur-md`.
- Top Status Bar: 3px indicator line colored to the district group or controlling player neon tone.
- Metrics & Yield: Rendered in `JetBrains Mono` with muted zinc labels (`#94A3B8`) and bright white data values.
- Unscouted State (Fogged): Masked with an animated diagonal micro-hatch pattern in `rgba(255, 255, 255, 0.04)` and a center "SIGNAL LOST" status icon.

### Chips & Tactical Badges
- Compact height (`22px`), `roundedness: 1` (4px radius).
- Background `rgba(255, 255, 255, 0.04)`, border `1px solid rgba(255, 255, 255, 0.08)`.
- Includes a leading 6px glowing indicator dot indicating ownership or reconnaissance level (Scouted, Occupied, Contested).

### Input Fields & Sliders (Mortgage / Auction Bidding)
- Inputs: Recessed dark backdrop (`rgba(5, 7, 10, 0.8)`), border `1px solid rgba(255, 255, 255, 0.1)`. Focus state snaps border to `#00F0FF` with a subtle interior cyan bloom.
- Numeric Sliders: Track is a 2px carbon-slate bar; thumb is an angular 12x12px square colored in active player neon accent.

### Checkboxes & Toggle Switches
- Monolithic square toggles (`16x16px`) with 2px corner radius.
- Unchecked: Inset border `rgba(255, 255, 255, 0.2)`.
- Checked: Solid neon fill with dark interior check indicator. No smooth, organic morphs—transitions are crisp and instantaneous (max 100ms ease-out).

### Event / Recon Feed (Lists)
- Borderless rows separated by `1px solid rgba(255, 255, 255, 0.04)`.
- Timestamps in `JetBrains Mono` (`#94A3B8`). Faction actions flagged with their respective neon dot marker.