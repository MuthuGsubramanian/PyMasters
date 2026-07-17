# PyMasters Design System — MASTER (Global Source of Truth)

> **How to use:** When building or reviewing any page, read this file first, then check
> `design-system/pages/<page-name>.md`. If a page file exists, its rules **override** this
> Master; otherwise Master applies exclusively.
>
> **Source of truth for values:** `frontend/src/index.css` defines every token below. If this
> document and `index.css` ever disagree, `index.css` wins — update this file, not the CSS.
>
> Aligned with: `docs/superpowers/specs/2026-04-05-theme-system-overhaul-design.md`

---

## 1. Identity

- **Product:** PyMasters — professional developer-education platform (interactive Python lessons, code playground, challenges, org dashboards).
- **Style:** "Deep Void" glassmorphism — translucent surfaces (`backdrop-blur`), violet→cyan gradient accents, ambient radial glows, soft elevation.
- **Themes:** Light and dark are **both first-class**. Dark is class-based (`.dark` on `<html>`, bound via `@custom-variant dark`), not media-query based. Never design one mode and infer the other.
- **Tone:** Technical, premium, focused. Not playful/childish, not neon-cyberpunk.

## 2. Color Tokens (semantic only — never raw hex/slate in components)

All colors are CSS custom properties in `index.css`, exposed as Tailwind utilities via `@theme`
(e.g. `text-text-primary`, `bg-bg-surface`, `border-border-default`).

### Text
| Token / utility | Purpose | Light | Dark |
|---|---|---|---|
| `text-text-primary` | Headings, key labels | `oklch(0.22 0.03 285)` | `oklch(0.98 0.005 280)` |
| `text-text-secondary` | Body text (page default) | `oklch(0.34 0.03 285)` | `oklch(0.90 0.012 280)` |
| `text-text-muted` | Captions, hints, timestamps | `oklch(0.47 0.03 285)` | `oklch(0.70 0.03 280)` |
| `text-text-disabled` | Decorative text on disabled elements only | `oklch(0.62 0.02 285)` | `oklch(0.52 0.03 285)` |

All except `disabled` meet WCAG AA (≥4.5:1) on their surfaces in both modes. `disabled` is
intentionally sub-AA and must never carry information.

### Surfaces
| Token / utility | Purpose | Notes |
|---|---|---|
| `bg-bg-base` | Page background | Body also carries fixed radial-glow background-image |
| `bg-bg-surface` | Cards, panels, sidebar | 85% alpha — pair with `backdrop-blur` (or use `.panel`) |
| `bg-bg-elevated` | Hovers, active items, dropdowns | Opaque |
| `bg-bg-inset` | Input wells, subtle insets | Opaque |
| `surface-code` (`--bg-code`) | Code blocks | **Always dark in both themes** — intentional |

### Borders & focus
`border-border-default` (resting) → `border-border-strong` (hover/emphasis) → `border-border-focus`
(active inputs). A **global focus ring** already exists for all `:focus-visible` elements —
never add `outline: none` without a replacement, and don't re-implement per-component rings.

### Accent & roles
| Token | Role | Light | Dark |
|---|---|---|---|
| `--accent-primary` / `--primary` | Violet — buttons, active nav, links | `oklch(0.55 0.22 295)` | `oklch(0.65 0.24 295)` |
| `--secondary` | Cyan — secondary accents | `oklch(0.62 0.16 215)` | `oklch(0.78 0.15 215)` |
| `--accent-subtle` | Selected/hover tint | 10% alpha | 18% alpha |
| `--destructive` | Errors, destructive actions | `oklch(0.58 0.22 25)` | `oklch(0.62 0.22 25)` |

Gradients: `.bg-gradient-primary` (violet→cyan 135°), `.bg-gradient-hero`, `.bg-gradient-card`,
`.text-gradient`. Glows: `.shadow-glow` (violet), `.shadow-cyan`, `.shadow-elegant`.

Status colors (success green / warning amber / error red) keep Tailwind palette values but must
include an icon or text — **never color alone** — and must pass 4.5:1 in both modes.

## 3. Typography

| Role | Font | Utility |
|---|---|---|
| Display / headings (h1–h6) | **Outfit** | automatic via base layer (`--font-display`) |
| UI & body | **Inter** | default (`--font-sans`) |
| Code | **JetBrains Mono** | `font-mono`, `code`, `pre` |

- Headings inherit color from parent (`color: inherit`) — set explicit token color on the container.
- Body base 16px, line-height 1.5–1.75; body ≥14px minimum anywhere; 12px only for badges/labels.
- Weights: 600–700 headings, 400 body, 500 labels. Tracking: headings use `tracking-tight` (already global).
- Data columns / timers / XP counters: use `tabular-nums`.

## 4. Components (use these classes, don't hand-roll)

| Class | What it is |
|---|---|
| `.panel` | Glass card: surface bg + blur + default border + shadow. Add `.panel-hover` for interactive cards |
| `.btn-neo` + `.btn-neo-primary` | Primary CTA: gradient bg, glow, scale press (1.02 hover / 0.98 active) |
| `.btn-neo` + `.btn-neo-ghost` | Secondary: elevated bg, muted text, border strengthens on hover |
| `.btn-neo-danger` | Destructive: `--destructive` bg; confirm before destructive actions |
| `.input-neo` | Text inputs: surface bg, strong border → focus border+ring |
| `.dark-scrollbar` | Thin themed scrollbar for internal scroll panels |
| `.animate-fade-in` / `.page-enter*` | Entry transitions (0.3–0.4s ease-out) |

Rules: **one primary CTA per screen**; disabled = reduced opacity + `disabled` attr + no hover
effects; every interactive element gets `cursor-pointer` and a visible pressed/hover state.

## 5. Iconography

- **Library: `lucide-react` only.** No emojis as UI icons, no mixed icon sets.
- Sizes: 16px inline/dense rows, 20px nav/buttons, 24px feature spots. Default stroke width (2), don't mix.
- Icon-only buttons need `aria-label` and a ≥44×44px hit area (pad the button, not the icon).

## 6. Spacing & Density (post-overhaul rules)

4/8px rhythm (`gap-2/3/4`, `p-3/4`, `space-y-3`). The app is deliberately **dense**:

| Element | Use | Not |
|---|---|---|
| Card padding | `p-3` / `p-4` | `p-6` / `p-8` |
| Section gaps | `gap-3` / `space-y-3` | `gap-6` |
| Nav items | `py-1.5`, single-line label, inline icon | subtitles, icon wrapper boxes |

Viewport-fit layouts (`h-screen` flex, panels scroll internally with `.dark-scrollbar`, no
page-level scroll): **Classroom, Dashboard, Challenges, Reference**. Marketing/login pages may
scroll normally. Content max-width on desktop: `max-w-6xl`/`max-w-7xl`, consistent per page class.

## 7. Motion

- Micro-interactions 150–300ms; page/panel transitions ≤400ms. Enter = ease-out, exit = ease-in (shorter).
- Animate `transform`/`opacity` only — never width/height/top/left (no layout shift, CLS < 0.1).
- 1–2 animated elements per view; stagger list entrances 30–50ms if used.
- Respect `prefers-reduced-motion` for any new keyframe animation.
- Loading >300ms → skeleton/shimmer (reserve space); async buttons disable + show spinner.

## 8. Accessibility Contract

1. AA contrast (4.5:1 text, 3:1 large/UI) verified **in both modes separately**.
2. Never convey state by color alone — pair with icon or text.
3. Keyboard: logical tab order, global focus ring stays visible, Esc closes modals/search (Ctrl+K opens GlobalSearch).
4. Forms: visible labels (not placeholder-only), error below the field with recovery hint, `aria-live` for async errors, semantic input types.
5. Touch targets ≥44px on mobile; toasts auto-dismiss 3–5s and never steal focus.

## 9. Anti-patterns (hard rules)

- ❌ Raw `text-slate-*`, `bg-white/*`, `border-slate-*`, or new hex/oklch literals in components — use semantic tokens.
- ❌ `dark:` variants for **colors** (tokens handle theming); `dark:` only for rare structural differences.
- ❌ `!important` theme overrides in CSS — the old override block was deleted; never reintroduce it.
- ❌ Emojis as icons; icon sets other than lucide-react.
- ❌ Pure-white surfaces in light mode over the glow background without `.panel` glass treatment.
- ❌ Kids/playful fonts, neon-on-black cyberpunk effects — off-brand.
- ❌ Removing focus outlines; hover-only affordances; layout-shifting press states.

## 10. Pre-delivery checklist (both themes, every page)

- [ ] Only semantic token utilities for theme-sensitive colors
- [ ] Light **and** dark visually audited (toggle, don't infer)
- [ ] AA contrast on all new text/surface pairs
- [ ] One primary CTA; hover/active/disabled states present
- [ ] Dense spacing rules respected; no page-level scrollbar on viewport-fit views
- [ ] 375px, 768px, 1024px, 1440px checked; no horizontal scroll
- [ ] lucide icons with aria-labels where icon-only
- [ ] Motion within 150–400ms, transform/opacity only
