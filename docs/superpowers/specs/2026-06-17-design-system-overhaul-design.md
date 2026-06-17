# PyMasters Design-System & Accessibility Overhaul — Design Spec

**Date:** 2026-06-17
**Status:** Approved (brainstorming) → ready for implementation planning
**Context:** Production app, institutional customer (DHS IT) signed up, more members expected. Goal: a more professional, consistent, accessible UI without disturbing the working FastAPI/Ollama backend or any existing feature.

## Decisions (locked with user)

1. **Strategy:** Harvest the design language + a shared component-primitive layer from the Lovable reference build (`Py Mastery Hub.zip`) **into the existing React/Vite/JS app**. No migration to Supabase/TanStack/TypeScript. No backend changes. No new product features.
2. **Palette:** Adopt the reference's OKLCH **"deep void" neon-violet (primary) + cyan (secondary)** theme.
3. **Primitive language:** Plain **JavaScript (`.jsx`)**, matching the existing codebase. No tsconfig/build changes.
4. **Sequencing:** One plan covering all phases (0–5); deploy at stable, live-verified milestones.
5. **Roll-out priority:** Within Phase 4, **institution-facing surfaces first** (OrgDashboard, SuperAdmin, admin drawers), then learner pages.

## Reference build assessment (`Py Mastery Hub.zip`)

A Lovable-generated parallel landing page + thin learn page on a different stack (TypeScript, TanStack Start, Supabase, shadcn/ui new-york, OKLCH tokens). It has **none** of the real app's depth (no institutional console, super-admin, voice, podcasts, challenges, real auth — it's wired to Supabase). It is therefore a **design source, not a replacement**. Two assets transfer:

- **Component-primitive library** — proper `cva` variant-driven shadcn primitives (Button, Card, Badge, Dialog, Drawer, Tabs, Table, Avatar, Input, …). Directly fills the audit's #1 gap (no `components/ui/` folder; 151+ duplicated patterns).
- **Design language** — OKLCH violet/cyan tokens + `text-gradient`, `shadow-glow`, `bg-gradient-card`, `bg-gradient-hero` utilities. More premium than the current flat cyan/blue.

Caveats: reference is **dark-only** (`.dark` merely repeats `:root`) → we must design a real light variant. Primitives are `.tsx` → port to `.jsx` wired to our token names.

## Audit findings being addressed (4-dimension audit, 2026-06-17)

- **Color/token drift:** 252+ raw palette uses (`text-slate-*`, `bg-white`, `bg-[#0d1117]`), dark-mode-unsafe colors, inconsistent gradients. Worst: Home, Dashboard, `animations/*`, Playground, Layout.
- **Typography/layout:** inconsistent page max-widths (3xl–7xl), padding (`.panel` has no default padding → ad-hoc `p-4`…`p-10`), section spacing (`space-y-4` vs `8`), heading scale outliers (Home `text-7xl`).
- **Accessibility (~65% AA):** focus rings stripped (`focus:outline-none`, 18 files), no modal focus trapping (all 5 drawers/modals), `NotificationBell` missing `aria-label`, clickable `<div>`s (logo/profile/rows) not keyboard-accessible, placeholder-as-label, low-contrast muted/disabled text, tabs lack `role="tablist"`.
- **Component duplication:** zero shared primitives. Highest leverage: Badge (29), Card/StatCard (30+), Button (24+), base Drawer (5× boilerplate), Avatar (8), Input, Tabs, Table.

## Architecture

### Token strategy — keep names, remap values
The existing semantic token names (`--text-primary/secondary/muted/disabled`, `--bg-base/surface/elevated/inset`, `--border-default/strong/focus`, `--accent-primary/subtle`) stay. We **remap their values** to the OKLCH deep-void palette for **both light and dark**, and **add** a violet `primary` + cyan `secondary` accent pair plus gradient/glow utilities. Every already-correct token usage upgrades for free; only hardcoded-color drift needs manual migration.

- **Dark** (deep void): backgrounds `oklch(0.12 0.02 280)` base → elevated surfaces per reference; primary `oklch(0.65 0.24 295)` (neon violet), secondary `oklch(0.78 0.15 215)` (neon cyan).
- **Light:** a newly-designed companion — near-white violet-tinted backgrounds, the **same** violet/cyan accents, text/muted/border tuned so all text pairs meet **WCAG AA (≥4.5:1 body, ≥3:1 large)**. (Reference shipped no real light mode; this is original work.)
- **New utilities** (port from reference): `bg-gradient-hero`, `bg-gradient-primary`, `bg-gradient-card`, `text-gradient`, `shadow-glow`, `shadow-cyan`, `glow-ring`. Dark-themed code/terminal surfaces (currently hardcoded `bg-[#0d1117]`) get a dedicated token so they're intentional, not accidental.
- **Component classes:** `.panel` gains default padding + new surface/gradient; `.btn-neo-primary` → violet→cyan gradient + `shadow-glow`; add `.btn-neo-danger`; `.input-neo` refreshed with AA focus ring.

### Primitive layer — `frontend/src/components/ui/*.jsx`
JSX, `cva`-driven, wired to our tokens. **A11y baked in once** (focus-visible rings, `role`/`aria-modal`, focus trap, label association) so all consumers inherit it. Build order by audit leverage:

1. `Badge` — variants: status / plan / role / tag / generic; replaces 29 ad-hoc pills.
2. `Card` + `StatCard` — replaces 30+ `bg-bg-surface backdrop-blur-* rounded-2xl border` clones and the duplicated StatCard.
3. `Button` — variants primary/ghost/danger/outline/link, sizes sm/md/lg/icon; consolidates 24+ hand-rolled buttons.
4. `Drawer` (base, slide-over) + `Modal` (base, centered) + hooks `useEscapeKey`, `useFocusTrap` — refactor OrgAdminDrawer, UserAdminDrawer, StudentDrawer, VoiceTutor, ReleaseNotes, PodcastPlayer onto these (kills duplicated backdrop/Escape/focus code and adds focus trapping everywhere).
5. `Avatar` — initials + size variants; replaces 8 clones.
6. `Input` / `Select` / `FormField` — `.input-neo` wrapper with `<label>` association.
7. `Tabs` — `role="tablist"`/`tab`/`tabpanel`; replaces OrgDashboard + SuperAdmin hand-rolled tabs.
8. `Table` — `Table`/`THead`/`Row`/`Cell`; replaces 4 duplicated tables.

Export via a barrel `components/ui/index.js`, following the existing `StateViews.jsx` pattern.

## Phase plan

- **Phase 0 — Foundation:** rewrite `index.css` token *values* (light+dark, AA-checked) to OKLCH violet/cyan; add gradient/glow utilities; upgrade `.panel`/`.btn-neo-*`/`.input-neo` + add `.btn-neo-danger`. Verify existing pages still render (token names unchanged).
- **Phase 1 — Primitive library:** build the 8 primitives + 2 hooks above with a11y baked in.
- **Phase 2 — A11y pass:** adopt base Drawer/Modal across the 6 overlays (focus trap + Escape); add `aria-label`s (NotificationBell et al.); convert clickable `<div>`s (logo, profile, table rows) to keyboard-accessible; `role="tablist"` via `Tabs`; real `<label>`s; `aria-hidden` decorative SVGs; landmark/heading cleanup.
- **Phase 3 — Homepage:** restyle `Home.jsx` to the new language (hero gradient, `text-gradient`, glow, features/tracks/CTA + enterprise/org section) with **real** content/CTAs. Preserve brand name/logo + Vaathiyaar persona.
- **Phase 4 — Roll-out (admin-first):** migrate to tokens + primitives, removing drift, in order: OrgDashboard → SuperAdmin → admin drawers (Org/User/Student) → Dashboard → Classroom → Playground → `animations/*` → Profile → Reference → Challenges → Trending → Layout/Navbar. Batched via parallel subagents; each batch independently verified (build + render + dark/light).
- **Phase 5 — Verification & deploy:** Playwright visual audit every module in **light + dark + mobile**; zero-JS-error check; build green; deploy via `./scripts/deploy.sh`; smoke-test run.app + pymasters.net.

## Success criteria

- No hardcoded palette colors (`text-slate-*`, `bg-white`, `bg-[#hex]`) outside the intentional code-surface token. Grep-clean on the worst-offender list.
- All interactive elements have visible focus indicators; all 6 overlays trap focus and close on Escape; icon-only buttons labeled. WCAG AA contrast on all text/background pairs (light + dark).
- A `components/ui/` layer exists; Badge/Card/Button/Drawer/Modal/Avatar/Input/Tabs/Table reused in place of ad-hoc implementations on migrated pages.
- Light, dark, and mobile render cleanly with zero JS errors across every module.
- Every existing feature still works (no regressions to org/admin/super-admin/voice/podcast/challenges/auth). Verified via live flows.

## Risks & mitigations

- **Token remap breaks a page that relied on old hex values** → Phase 0 verifies render before proceeding; drift cleanup is per-page in Phase 4 with verification.
- **Light mode under-designed (reference had none)** → explicit AA contrast checks for the new light palette in Phase 0; Playwright light-mode pass in Phase 5.
- **Feature regression during mass migration** → admin-first order, batched subagents, per-batch verification, deploy only at live-verified milestones; rollback via `gcloud run services update-traffic`.
- **Lost-commit pattern** (per prior incident) → feature-marker greps before each deploy.

## Out of scope (YAGNI)

Supabase/TanStack/TypeScript migration; backend changes; new product features; i18n of UI chrome; podcast/voice content generation.
