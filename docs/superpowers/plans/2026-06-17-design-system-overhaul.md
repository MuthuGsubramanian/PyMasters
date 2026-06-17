# PyMasters Design-System & Accessibility Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-theme PyMasters to the OKLCH neon-violet+cyan "deep void" design language, introduce a shared `components/ui/` primitive layer, bring the app to WCAG AA, and refresh the homepage — without touching the FastAPI backend or any existing feature.

**Architecture:** Keep existing semantic token *names*, remap their *values* to OKLCH (light + dark). Add a JSX primitive layer (`components/ui/`) built with a `cn()` helper + variant maps (no new deps — `clsx`/`tailwind-merge` already present). A11y is baked into primitives once so consumers inherit it. Migrate pages off hardcoded colors page-by-page, admin surfaces first.

**Tech Stack:** React 19, Vite 7, Tailwind 4 (`@theme`/CSS vars), Framer Motion, lucide-react, clsx, tailwind-merge. Spec: `docs/superpowers/specs/2026-06-17-design-system-overhaul-design.md`.

**Verification model (per user preference [[feedback-live-user-testing]]):** No unit/pytest suites for visual work. Each task verifies via `npm run build` (green) + live render in `npm run dev` and/or the existing Playwright tools in `_claude_audit/pwtools/`. Frequent commits. Reference design source extracted at `C:\Users\muthu.MSG\AppData\Local\Temp\pymastery_hub` (re-extract from `Downloads/Py Mastery Hub.zip` if gone).

**Branch:** `feat/design-system-overhaul-2026-06` (already created; spec committed).

**Deploy:** At milestones only, via `./scripts/deploy.sh` (needs valid `gcloud auth login`). Rollback: `gcloud run services update-traffic pymasters --region=us-central1 --to-revisions <prev>=100`.

---

## File Structure

**Created:**
- `frontend/src/lib/cn.js` — `cn()` class-merge helper.
- `frontend/src/components/ui/Badge.jsx`, `Card.jsx`, `Button.jsx`, `Avatar.jsx`, `Input.jsx`, `Select.jsx`, `FormField.jsx`, `Tabs.jsx`, `Table.jsx`, `Drawer.jsx`, `Modal.jsx`, `index.js` (barrel).
- `frontend/src/hooks/useEscapeKey.js`, `frontend/src/hooks/useFocusTrap.js`.

**Modified:**
- `frontend/src/index.css` — token values (light+dark) + new utilities + component classes.
- The 6 overlay components (OrgAdminDrawer, UserAdminDrawer, StudentDrawer, VoiceTutor, ReleaseNotes, PodcastPlayer) — adopt base Drawer/Modal.
- Pages in Phase 4 order (OrgDashboard, SuperAdmin, admin drawers, Dashboard, Classroom, Playground, animations/*, Profile, Reference, Challenges, Trending, Layout, Navbar, NotificationBell).
- `frontend/src/pages/Home.jsx` — homepage refresh.

---

## Phase 0 — Token & utility foundation

### Task 0.1: Remap design tokens to OKLCH (light + dark)

**Files:**
- Modify: `frontend/src/index.css` (the `@layer base { :root { … } }` block and the `.dark { … }` block, and `@theme`)

- [ ] **Step 1: Add new color tokens to the `@theme` block.** After the existing `--color-accent-subtle:` line inside `@theme { … }`, add:

```css
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-destructive: var(--destructive);
```

- [ ] **Step 2: Replace the `:root` token values (light mode) with the OKLCH deep-void *light* variant.** Replace the semantic-token lines inside `:root` with:

```css
    /* Semantic tokens — LIGHT (violet-tinted) */
    --text-primary: oklch(0.22 0.03 285);
    --text-secondary: oklch(0.34 0.03 285);
    --text-muted: oklch(0.47 0.03 285);      /* AA on bg-base/surface */
    --text-disabled: oklch(0.62 0.02 285);
    --bg-base: oklch(0.975 0.008 285);
    --bg-surface: oklch(0.995 0.004 285 / 0.85);
    --bg-elevated: oklch(0.955 0.01 285);
    --bg-inset: oklch(0.93 0.014 285);
    --border-default: oklch(0.22 0.03 285 / 0.10);
    --border-strong: oklch(0.22 0.03 285 / 0.18);
    --border-focus: oklch(0.55 0.22 295 / 0.6);
    --accent-primary: oklch(0.55 0.22 295);   /* violet, darker for light contrast */
    --accent-subtle: oklch(0.55 0.22 295 / 0.10);
    --accent-from: oklch(0.55 0.22 295);
    --accent-to: oklch(0.62 0.16 215);
    /* Accent pair + roles */
    --primary: oklch(0.55 0.22 295);
    --primary-foreground: oklch(0.99 0.005 280);
    --secondary: oklch(0.62 0.16 215);
    --secondary-foreground: oklch(0.18 0.02 280);
    --destructive: oklch(0.58 0.22 25);
    /* Dark code-surface token (intentional, theme-independent) */
    --bg-code: oklch(0.16 0.02 280);
    --code-foreground: oklch(0.92 0.01 280);
    /* Gradients + glows */
    --gradient-hero: radial-gradient(ellipse at 50% 0%, oklch(0.86 0.10 295) 0%, oklch(0.95 0.02 285) 45%, oklch(0.975 0.008 285) 100%);
    --gradient-primary: linear-gradient(135deg, oklch(0.55 0.22 295) 0%, oklch(0.58 0.18 250) 50%, oklch(0.62 0.16 215) 100%);
    --gradient-text: linear-gradient(120deg, oklch(0.55 0.18 215) 0%, oklch(0.55 0.20 250) 45%, oklch(0.52 0.22 295) 100%);
    --gradient-card: linear-gradient(160deg, oklch(0.99 0.006 290) 0%, oklch(0.96 0.012 285) 100%);
    --shadow-glow: 0 0 50px -12px oklch(0.55 0.22 295 / 0.40);
    --shadow-cyan: 0 0 40px -10px oklch(0.62 0.16 215 / 0.35);
    --shadow-elegant: 0 24px 70px -28px oklch(0.30 0.05 285 / 0.30);
```

Keep the existing `--font-*`, `--primary-gradient`, `--surface-glass`, `--border-glass` lines (the body radial-gradient background can stay or be retuned in Step 4).

- [ ] **Step 3: Replace the `.dark` token values with the deep-void *dark* variant.** Replace the semantic-token lines inside `.dark` with:

```css
    /* Semantic tokens — DARK (deep void) */
    --text-primary: oklch(0.98 0.005 280);
    --text-secondary: oklch(0.90 0.012 280);
    --text-muted: oklch(0.70 0.03 280);       /* AA on bg-base */
    --text-disabled: oklch(0.52 0.03 285);
    --bg-base: oklch(0.12 0.02 280);
    --bg-surface: oklch(0.16 0.03 285 / 0.85);
    --bg-elevated: oklch(0.22 0.03 285);
    --bg-inset: oklch(0.10 0.02 280);
    --border-default: oklch(0.30 0.04 285 / 0.5);
    --border-strong: oklch(0.34 0.04 285);
    --border-focus: oklch(0.65 0.24 295 / 0.7);
    --accent-primary: oklch(0.65 0.24 295);
    --accent-subtle: oklch(0.65 0.24 295 / 0.18);
    --accent-from: oklch(0.65 0.24 295);
    --accent-to: oklch(0.78 0.15 215);
    --primary: oklch(0.65 0.24 295);
    --primary-foreground: oklch(0.99 0.005 280);
    --secondary: oklch(0.78 0.15 215);
    --secondary-foreground: oklch(0.12 0.02 280);
    --destructive: oklch(0.62 0.22 25);
    --bg-code: oklch(0.13 0.015 280);
    --code-foreground: oklch(0.92 0.01 280);
    --gradient-hero: radial-gradient(ellipse at 50% 0%, oklch(0.28 0.12 295) 0%, oklch(0.14 0.04 285) 45%, oklch(0.10 0.02 280) 100%);
    --gradient-primary: linear-gradient(135deg, oklch(0.65 0.24 295) 0%, oklch(0.72 0.18 250) 50%, oklch(0.78 0.15 215) 100%);
    --gradient-text: linear-gradient(120deg, oklch(0.78 0.15 215) 0%, oklch(0.72 0.18 250) 45%, oklch(0.65 0.24 295) 100%);
    --gradient-card: linear-gradient(160deg, oklch(0.18 0.04 290) 0%, oklch(0.14 0.03 285) 100%);
    --shadow-glow: 0 0 60px -10px oklch(0.65 0.24 295 / 0.55);
    --shadow-cyan: 0 0 40px -8px oklch(0.78 0.15 215 / 0.45);
    --shadow-elegant: 0 30px 80px -30px oklch(0.05 0.02 280 / 0.9);
```

- [ ] **Step 4: Retune the body background radial-gradient** in the `body { … }` rule to violet/cyan: change the two `rgba(...)` stops to `oklch(0.65 0.24 295 / 0.06)` and `oklch(0.78 0.15 215 / 0.06)`.

- [ ] **Step 5: Verify build + render.** Run `cd frontend && npm run build`. Expected: build succeeds, no errors. Then `npm run dev`, open the app, toggle dark mode (localStorage `pm_dark_mode`), confirm pages still render and text is legible in both modes (pages using tokens now show violet/cyan).

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/index.css
git commit -m "feat(theme): remap tokens to OKLCH violet/cyan deep-void (light+dark)"
```

### Task 0.2: Add gradient/glow utilities + upgrade component classes

**Files:**
- Modify: `frontend/src/index.css` (`@layer components` and `/* Utilities */` section)

- [ ] **Step 1: Add utilities.** In the `/* Utilities */` section add:

```css
.bg-gradient-hero { background: var(--gradient-hero); }
.bg-gradient-primary { background: var(--gradient-primary); }
.bg-gradient-card { background: var(--gradient-card); }
.shadow-glow { box-shadow: var(--shadow-glow); }
.shadow-cyan { box-shadow: var(--shadow-cyan); }
.shadow-elegant { box-shadow: var(--shadow-elegant); }
.text-gradient {
  background: var(--gradient-text);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.glow-ring {
  box-shadow: 0 0 0 1px var(--accent-subtle), 0 0 40px -5px var(--accent-subtle);
}
.surface-code { background: var(--bg-code); color: var(--code-foreground); }
```

- [ ] **Step 2: Upgrade component classes.** In `@layer components`, change `.panel` to include default padding and the card gradient, update `.btn-neo-primary` to the violet→cyan gradient + glow, and add `.btn-neo-danger`:

```css
  .panel {
    @apply bg-bg-surface backdrop-blur-2xl border border-border-default p-6;
    box-shadow: 0 4px 24px 0 oklch(0.2 0.02 285 / 0.08);
  }
  .btn-neo-primary {
    @apply text-white hover:scale-[1.02] active:scale-[0.98];
    background: var(--gradient-primary);
    box-shadow: var(--shadow-glow);
  }
  .btn-neo-primary:hover { box-shadow: 0 6px 28px -6px oklch(0.65 0.24 295 / 0.6); }
  .btn-neo-danger {
    @apply text-white px-6 py-3 rounded-xl font-bold transition-all;
    background: var(--destructive);
  }
  .btn-neo-danger:hover { filter: brightness(1.08); }
```

> NOTE: `.panel` now ships `p-6`. Callers that pass their own `p-*` will override via Tailwind order; callers that relied on NO padding (e.g. a panel wrapping a full-bleed table) must add `p-0`. Flag this during Phase 4 page migration.

- [ ] **Step 3: Add a global focus-visible baseline** at the end of `@layer base`:

```css
  :where(a, button, input, select, textarea, [tabindex]):focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--bg-base), 0 0 0 4px var(--accent-primary);
    border-radius: 0.5rem;
  }
```

- [ ] **Step 4: Verify** `npm run build` green; in dev, Tab through Login — focus rings now visible. Confirm `.btn-neo-primary` shows the violet→cyan gradient.

- [ ] **Step 5: Commit.**

```bash
git add frontend/src/index.css
git commit -m "feat(theme): gradient/glow utilities, panel padding, btn-danger, focus-visible baseline"
```

---

## Phase 1 — Shared primitive layer

### Task 1.1: `cn()` helper + hooks

**Files:**
- Create: `frontend/src/lib/cn.js`, `frontend/src/hooks/useEscapeKey.js`, `frontend/src/hooks/useFocusTrap.js`

- [ ] **Step 1: Write `cn.js`.**

```js
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Write `useEscapeKey.js`.**

```js
import { useEffect } from 'react';

export function useEscapeKey(onEscape, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => { if (e.key === 'Escape') onEscape(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onEscape, active]);
}
```

- [ ] **Step 3: Write `useFocusTrap.js`** (restores focus on unmount, traps Tab within the ref'd element).

```js
import { useEffect } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

export function useFocusTrap(ref, active = true) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const node = ref.current;
    const prev = document.activeElement;
    const focusables = () => Array.from(node.querySelectorAll(FOCUSABLE));
    (focusables()[0] || node).focus();
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    node.addEventListener('keydown', onKey);
    return () => { node.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); };
  }, [ref, active]);
}
```

- [ ] **Step 4: Verify** `npm run build` green.

- [ ] **Step 5: Commit.** `git add frontend/src/lib/cn.js frontend/src/hooks/useEscapeKey.js frontend/src/hooks/useFocusTrap.js && git commit -m "feat(ui): cn() helper + useEscapeKey/useFocusTrap hooks"`

### Task 1.2: `Badge` primitive (highest reuse — 29 dupes)

**Files:** Create `frontend/src/components/ui/Badge.jsx`

- [ ] **Step 1: Write Badge.** Variants cover the status/plan/role/tag/generic colors the audit found.

```jsx
import { cn } from '../../lib/cn';

const VARIANTS = {
  neutral: 'bg-bg-inset text-text-muted border-border-default',
  primary: 'bg-accent-subtle text-accent-primary border-accent-primary/30',
  success: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border-emerald-500/25',
  warning: 'bg-amber-500/12 text-amber-600 dark:text-amber-300 border-amber-500/25',
  danger:  'bg-red-500/12 text-red-600 dark:text-red-300 border-red-500/25',
  info:    'bg-secondary/12 text-secondary border-secondary/25',
};

export function Badge({ variant = 'neutral', className = '', children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap',
        VARIANTS[variant] || VARIANTS.neutral,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export default Badge;
```

- [ ] **Step 2: Verify** `npm run build` green.
- [ ] **Step 3: Commit.** `git add frontend/src/components/ui/Badge.jsx && git commit -m "feat(ui): Badge primitive"`

### Task 1.3: `Card` + `StatCard` (30+ dupes)

**Files:** Create `frontend/src/components/ui/Card.jsx`

- [ ] **Step 1: Write Card + StatCard.**

```jsx
import { cn } from '../../lib/cn';

export function Card({ as: Tag = 'div', className = '', interactive = false, children, ...props }) {
  return (
    <Tag
      className={cn(
        'bg-bg-surface backdrop-blur-xl rounded-2xl border border-border-default',
        interactive && 'transition-all hover:border-border-strong hover:shadow-cyan',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function StatCard({ label, value, icon: Icon, hint, className = '' }) {
  return (
    <Card className={cn('p-4 flex items-start gap-3', className)}>
      {Icon && (
        <div className="w-9 h-9 rounded-xl bg-accent-subtle text-accent-primary flex items-center justify-center shrink-0">
          <Icon className="w-4.5 h-4.5" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{label}</p>
        <p className="text-2xl font-bold font-display text-text-primary leading-tight">{value}</p>
        {hint && <p className="text-xs text-text-muted mt-0.5">{hint}</p>}
      </div>
    </Card>
  );
}

export default Card;
```

- [ ] **Step 2: Verify** build green. **Step 3: Commit.** `git add frontend/src/components/ui/Card.jsx && git commit -m "feat(ui): Card + StatCard primitives"`

### Task 1.4: `Button` (24+ dupes)

**Files:** Create `frontend/src/components/ui/Button.jsx`

- [ ] **Step 1: Write Button** (wraps the existing `.btn-neo-*` classes so it stays visually consistent; supports `as`/`asChild`-style via `as` prop for links).

```jsx
import { cn } from '../../lib/cn';

const BASE = 'inline-flex items-center justify-center gap-2 font-bold rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none';
const VARIANTS = {
  primary: 'btn-neo btn-neo-primary',
  ghost:   'btn-neo btn-neo-ghost',
  danger:  'btn-neo-danger',
  outline: 'border border-border-strong text-text-secondary hover:border-accent-primary hover:text-text-primary bg-bg-surface',
  link:    'text-accent-primary hover:underline underline-offset-4 font-semibold',
};
const SIZES = { sm: 'text-xs px-3 py-1.5', md: 'text-sm px-5 py-2.5', lg: 'text-sm px-6 py-3.5', icon: 'p-2 rounded-lg' };

export function Button({ as: Tag = 'button', variant = 'primary', size = 'md', className = '', children, ...props }) {
  return (
    <Tag className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...props}>
      {children}
    </Tag>
  );
}

export default Button;
```

- [ ] **Step 2: Verify** build green; render a `<Button variant="danger">` and `<Button variant="ghost">` in dev. **Step 3: Commit.** `git commit -am "feat(ui): Button primitive"` (after `git add`).

### Task 1.5: `Avatar` (8 dupes)

**Files:** Create `frontend/src/components/ui/Avatar.jsx`

- [ ] **Step 1: Write Avatar.**

```jsx
import { cn } from '../../lib/cn';

const SIZES = { xs: 'w-7 h-7 text-[10px]', sm: 'w-8 h-8 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' };

export function Avatar({ name = '', size = 'md', className = '' }) {
  const initials = name.trim().slice(0, 2).toUpperCase() || '??';
  return (
    <div
      className={cn(
        'rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold shrink-0 select-none',
        SIZES[size], className,
      )}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

export default Avatar;
```

- [ ] **Step 2:** build green. **Step 3:** commit `feat(ui): Avatar primitive`.

### Task 1.6: `Input` / `Select` / `FormField`

**Files:** Create `frontend/src/components/ui/Input.jsx`, `Select.jsx`, `FormField.jsx`

- [ ] **Step 1: Input.jsx** — wraps `.input-neo`, forwards ref.

```jsx
import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

export const Input = forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={cn('input-neo', className)} {...props} />;
});

export default Input;
```

- [ ] **Step 2: Select.jsx** — same wrapper for `<select>`.

```jsx
import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

export const Select = forwardRef(function Select({ className = '', children, ...props }, ref) {
  return <select ref={ref} className={cn('input-neo cursor-pointer', className)} {...props}>{children}</select>;
});

export default Select;
```

- [ ] **Step 3: FormField.jsx** — associates a real `<label>` (fixes placeholder-as-label).

```jsx
import { useId } from 'react';

export function FormField({ label, hint, children, className = '' }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-semibold text-text-secondary mb-1.5">{label}</label>
      {typeof children === 'function' ? children(id) : children}
      {hint && <p className="text-[11px] text-text-muted mt-1">{hint}</p>}
    </div>
  );
}

export default FormField;
```

- [ ] **Step 4:** build green. **Step 5:** commit `feat(ui): Input/Select/FormField primitives`.

### Task 1.7: `Tabs` (with `role=tablist`)

**Files:** Create `frontend/src/components/ui/Tabs.jsx`

- [ ] **Step 1: Write Tabs** — replaces OrgDashboard/SuperAdmin hand-rolled tabs and adds ARIA roles + arrow-key nav.

```jsx
import { cn } from '../../lib/cn';

export function Tabs({ tabs, active, onChange, className = '' }) {
  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.key === active);
    if (e.key === 'ArrowRight') onChange(tabs[(i + 1) % tabs.length].key);
    if (e.key === 'ArrowLeft') onChange(tabs[(i - 1 + tabs.length) % tabs.length].key);
  };
  return (
    <div role="tablist" onKeyDown={onKey}
      className={cn('flex gap-1 bg-bg-surface rounded-xl p-1 border border-border-default w-fit', className)}>
      {tabs.map((t) => {
        const selected = t.key === active;
        return (
          <button key={t.key} role="tab" aria-selected={selected} tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              selected ? 'bg-gradient-primary text-white shadow-glow' : 'text-text-muted hover:text-text-secondary')}>
            {t.icon && <t.icon className="w-4 h-4" aria-hidden="true" />}{t.label}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
```

- [ ] **Step 2:** build green. **Step 3:** commit `feat(ui): Tabs primitive`.

### Task 1.8: `Table`

**Files:** Create `frontend/src/components/ui/Table.jsx`

- [ ] **Step 1: Write Table primitives.**

```jsx
import { cn } from '../../lib/cn';

export function Table({ className = '', children }) {
  return <div className="overflow-x-auto"><table className={cn('w-full text-sm', className)}>{children}</table></div>;
}
export function THead({ children }) {
  return <thead><tr className="text-left text-xs text-text-muted border-b border-border-default">{children}</tr></thead>;
}
export function TH({ className = '', children }) {
  return <th className={cn('px-4 py-2 font-semibold', className)}>{children}</th>;
}
export function TBody({ children }) {
  return <tbody className="divide-y divide-border-default">{children}</tbody>;
}
export function TR({ className = '', ...props }) {
  return <tr className={cn(className)} {...props} />;
}
export function TD({ className = '', children }) {
  return <td className={cn('px-4 py-2.5', className)}>{children}</td>;
}

export default Table;
```

- [ ] **Step 2:** build green. **Step 3:** commit `feat(ui): Table primitives`.

### Task 1.9: Base `Drawer` + `Modal` (kills 5× overlay boilerplate, adds focus trap)

**Files:** Create `frontend/src/components/ui/Drawer.jsx`, `Modal.jsx`

- [ ] **Step 1: Write Drawer.jsx** (right slide-over; uses the hooks; Framer Motion already a dep).

```jsx
import { useRef } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export function Drawer({ open, onClose, title, children, className = '' }) {
  const ref = useRef(null);
  useEscapeKey(onClose, open);
  useFocusTrap(ref, open);
  if (!open) return null;
  return (
    <motion.div className="fixed inset-0 z-[100] flex justify-end bg-black/40 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.aside ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}
        className={cn('w-full max-w-md h-full overflow-y-auto bg-bg-surface border-l border-border-default shadow-2xl', className)}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default sticky top-0 bg-bg-surface/95 backdrop-blur">
          <h2 className="font-display font-bold text-text-primary">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-text-muted hover:bg-bg-elevated">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </motion.aside>
    </motion.div>
  );
}

export default Drawer;
```

- [ ] **Step 2: Write Modal.jsx** (centered variant, same hooks).

```jsx
import { useRef } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export function Modal({ open, onClose, title, children, className = '' }) {
  const ref = useRef(null);
  useEscapeKey(onClose, open);
  useFocusTrap(ref, open);
  if (!open) return null;
  return (
    <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
        className={cn('w-full max-w-lg max-h-[85vh] overflow-y-auto panel rounded-2xl', className)}>
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-text-primary">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-text-muted hover:bg-bg-elevated">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
        {children}
      </motion.div>
    </motion.div>
  );
}

export default Modal;
```

- [ ] **Step 3:** build green. **Step 4:** commit `feat(ui): base Drawer + Modal with focus trap`.

### Task 1.10: Barrel export + smoke render

**Files:** Create `frontend/src/components/ui/index.js`

- [ ] **Step 1: Write barrel.**

```js
export { Badge } from './Badge';
export { Card, StatCard } from './Card';
export { Button } from './Button';
export { Avatar } from './Avatar';
export { Input } from './Input';
export { Select } from './Select';
export { FormField } from './FormField';
export { Tabs } from './Tabs';
export { Table, THead, TH, TBody, TR, TD } from './Table';
export { Drawer } from './Drawer';
export { Modal } from './Modal';
```

- [ ] **Step 2: Smoke-render** — temporarily import all into an existing page (e.g. top of `Playground.jsx`) and render one of each in dev to confirm no runtime errors, then revert the temp import. (Or use a Playwright scratch route.) **Step 3:** build green. **Step 4:** commit `feat(ui): primitive barrel export`.

**Milestone A (optional deploy):** Foundation + primitives exist but aren't consumed yet — no visual change in prod. Safe to deploy or hold.

---

## Phase 2 — Accessibility pass

### Task 2.1: Migrate the 6 overlays onto base Drawer/Modal

**Files (Modify):** `frontend/src/components/OrgAdminDrawer.jsx`, `UserAdminDrawer.jsx`, `StudentDrawer.jsx`, `VoiceTutor.jsx`, `ReleaseNotes.jsx`, `PodcastPlayer.jsx`

- [ ] **Step 1:** For each *drawer* (OrgAdminDrawer, UserAdminDrawer, StudentDrawer): replace its hand-rolled backdrop/aside + Escape `useEffect` + focus-restore code with `<Drawer open onClose={onClose} title="…">…</Drawer>`, moving the existing body content inside. Remove now-dead `useEffect`/refs.
- [ ] **Step 2:** For each *modal* (VoiceTutor, ReleaseNotes, PodcastPlayer): wrap content in `<Modal open onClose={…} title="…">`. ReleaseNotes previously had no `role="dialog"` — now inherited.
- [ ] **Step 3: Verify per component in dev** — open each overlay, confirm: focus moves in, Tab cycles *within* it, Escape closes, focus returns to the trigger. Confirm visuals unchanged.
- [ ] **Step 4: Commit.** `git commit -m "a11y: route all drawers/modals through focus-trapping base components"`

### Task 2.2: Labels, roles, and keyboard for interactive non-buttons

**Files (Modify):** `NotificationBell.jsx`, `Layout.jsx`, `Navbar.jsx`, `OrgDashboard.jsx`, `SuperAdmin.jsx`

- [ ] **Step 1:** `NotificationBell.jsx` — add `aria-label="Notifications"` (+ `aria-expanded`) to the bell button.
- [ ] **Step 2:** `Layout.jsx` + `Navbar.jsx` — convert clickable `<div onClick={navigate(...)}>` (logo, profile) to `<button>` (or add `role="button"` + `tabIndex={0}` + `onKeyDown` Enter/Space). Mark decorative SVGs `aria-hidden="true"`.
- [ ] **Step 3:** `OrgDashboard.jsx` clickable student rows — make the row a `<button>`/`<tr>` with `tabIndex={0}` + `onKeyDown` (Enter opens the drawer).
- [ ] **Step 4: Verify** keyboard-only: Tab to logo/profile/rows, press Enter — navigation/drawer fires. Screen-reader label present (check via devtools accessibility pane).
- [ ] **Step 5: Commit.** `git commit -m "a11y: labels, button semantics, and keyboard access for interactive elements"`

### Task 2.3: Contrast verification (light + dark)

- [ ] **Step 1:** Using the browser devtools (or a Playwright + axe pass if available), check `text-text-muted`, `text-text-disabled`, and input placeholders against their backgrounds in **both** modes. Target AA (≥4.5:1 normal, ≥3:1 large).
- [ ] **Step 2:** If any pair fails, nudge the token lightness in `index.css` (e.g. light `--text-muted` toward `oklch(0.45 …)`; dark toward `oklch(0.72 …)`) and re-check.
- [ ] **Step 3: Commit** any token tweak. `git commit -am "a11y: tune muted/disabled tokens to meet WCAG AA"`

**Milestone B (deploy candidate):** primitives + a11y live. Deploy via `./scripts/deploy.sh`, smoke-test.

---

## Phase 3 — Homepage refresh

### Task 3.1: Restyle `Home.jsx` to the deep-void language

**Files (Modify):** `frontend/src/pages/Home.jsx`. **Reference:** `…/pymastery_hub/src/routes/index.tsx` (structure/copy), but use REAL data and existing routing/CTAs.

- [ ] **Step 1:** Wrap the page in `bg-gradient-hero`. Restyle the hero headline using `text-gradient` for the accent line; keep the existing `pymasters-hero.svg` reactor logo and brand name (do NOT replace per [[project-autonomous-week-2026-06]] guardrail).
- [ ] **Step 2:** Convert the features grid and tracks grid to `bg-gradient-card` + `hover:shadow-glow` cards (Card primitive). Use **real** catalog numbers (415+ lessons; pull actual track names already shown elsewhere), not the reference's hardcoded "74 Lessons".
- [ ] **Step 3:** Keep/port the existing **enterprise/org section** (it was added during the autonomous week) and the final CTA, restyled. Ensure all CTAs route to real app routes (`/login`, `/dashboard`, etc.), not `#tutor` anchors.
- [ ] **Step 4:** Reduce hero heading from `text-7xl` toward the app scale (`text-5xl lg:text-6xl`) for consistency with the rest of the app.
- [ ] **Step 5: Verify** in dev at desktop + mobile widths, light + dark; zero JS errors; all buttons navigate correctly.
- [ ] **Step 6: Commit.** `git commit -m "feat(home): refresh landing to deep-void violet/cyan design language"`

---

## Phase 4 — Page-by-page roll-out (admin surfaces first)

**Per-page recipe (apply to each page below):**
1. Read the page. Replace hardcoded palette colors with tokens: `text-slate-*`/`text-gray-*` → `text-text-{primary,secondary,muted}`; `bg-white`/`bg-slate-*` → `bg-bg-{surface,elevated,inset}`; `border-gray-*`/`border-white/[0.0x]`/`border-black/[0.0x]` → `border-border-{default,strong}`; raw `text-cyan-*`/`from-cyan-* to-blue-*` → `text-accent-primary`/`bg-gradient-primary` or `.btn-neo-primary`.
2. Replace ad-hoc cards with `<Card>`, ad-hoc pills with `<Badge>`, hand-rolled buttons with `<Button>`, avatars with `<Avatar>`, tabs with `<Tabs>`, tables with `<Table>`, inline inputs with `<Input>`/`<FormField>`.
3. Fix dark-mode-unsafe surfaces; code/terminal blocks → `surface-code` class (intentional dark) instead of `bg-[#0d1117]`.
4. Verify in dev: light + dark + mobile render clean, zero JS errors, feature still works (click through the page's primary actions).
5. Commit per page: `git commit -m "refactor(<page>): migrate to design tokens + ui primitives"`.

- [ ] **Task 4.1: OrgDashboard.jsx** — tabs→`Tabs`, member table→`Table`, StatCards→`StatCard`, role/status/plan pills→`Badge`, email input→`FormField`+`Input`, avatars→`Avatar`. (Institutional surface — highest priority.)
- [ ] **Task 4.2: SuperAdmin.jsx** — tabs→`Tabs`, users/orgs/audit tables→`Table`, StatCards→`StatCard`, badges, `.panel` usage.
- [ ] **Task 4.3: Admin drawers internals** (OrgAdminDrawer, UserAdminDrawer, StudentDrawer) — badges/avatars/inputs/danger buttons to primitives (structure already on base Drawer from 2.1).
- [ ] **Task 4.4: Dashboard.jsx** — 178 raw classes; stat cards→`StatCard`, module cards→`Card`, accent colors→tokens, fix light-card-in-dark issues.
- [ ] **Task 4.5: Classroom.jsx** — normalize `.panel` padding (p-10/p-4 → consistent), code blocks→`surface-code`, tokens; keep chat-bubble custom corners.
- [ ] **Task 4.6: Playground.jsx** — right panel `bg-[#0d1117]`→`surface-code`, message bubbles→tokens, buttons→`Button`.
- [ ] **Task 4.7: animations/* ** (CodeStepper, ExecutionVisualizer, LoopVisualizer, FlowDiagram, TerminalOutput) — replace `text-slate-*`/`bg-slate-*`/`bg-[#hex]` with `surface-code` + token text; keep semantic syntax-highlight colors (amber/emerald/etc.) as-is but move to `/dark` where needed.
- [ ] **Task 4.8: Profile.jsx** — custom `bg-gradient` → tokens (or `bg-gradient-hero`), settings cards→`Card`, achievement badge→`Card`/`Badge`.
- [ ] **Task 4.9: Reference.jsx, Challenges.jsx, Trending.jsx** — token cleanup, cards/badges/buttons to primitives, standardize page wrapper (`min-h-screen bg-bg-base p-4 md:p-8` + `max-w-6xl mx-auto`).
- [ ] **Task 4.10: Layout.jsx + Navbar.jsx** — sidebar rank colors→tokens/`accent-subtle`, gradient borders→utilities, nav active state→gradient-primary.

**Milestone C (deploy):** full app migrated. Deploy via `./scripts/deploy.sh`.

---

## Phase 5 — Verification & deploy

### Task 5.1: Full visual + a11y sweep

- [ ] **Step 1:** Run the existing Playwright audit tools in `_claude_audit/pwtools/` (theme_audit/audit_full/mobile) across every module in **light, dark, and mobile**. Register a throwaway test user OMITTING email (reserved super-admin emails are rejected); dark mode via localStorage `pm_dark_mode`; suppress What's-New via `pm_release_seen='2.0.0'`.
- [ ] **Step 2:** Confirm **zero JS errors** in every captured page. Confirm no `text-slate-`/`bg-white`/`bg-[#` remain on migrated pages: `grep -rn "text-slate-\|bg-white\b\|bg-\[#" frontend/src/pages frontend/src/components` — only intentional `surface-code`/decorative cases should remain; document any.
- [ ] **Step 3:** Feature-integrity greps before deploy (per [[project-autonomous-week-2026-06]] lost-commit caution): confirm review queue, voice tutor, challenges grader, consolidation, org/admin routes still present.

### Task 5.2: Build, deploy, smoke-test

- [ ] **Step 1:** `cd frontend && npm run build` — green.
- [ ] **Step 2:** `./scripts/deploy.sh` (record rollback target it prints; run `gcloud auth login` first if it reports an expired token).
- [ ] **Step 3:** Smoke-test https://pymasters-977064896391.us-central1.run.app and https://pymasters.net in light + dark: home, login, dashboard, classroom, org console, super admin. Confirm new theme live, no regressions.
- [ ] **Step 4:** If anything broke: `gcloud run services update-traffic pymasters --region=us-central1 --to-revisions <prev>=100`.

### Task 5.3: Finish branch

- [ ] **Step 1:** Use superpowers:finishing-a-development-branch to merge `feat/design-system-overhaul-2026-06` → `main` (CI auto-deploys on push to main without `[skip ci]`).
- [ ] **Step 2:** Update memory ([[project-pymasters-v2]] UI/UX section) noting the design-system overhaul shipped.

---

## Self-Review (against spec)

- **Spec coverage:** Phase 0 ⇒ token strategy + light variant + utilities ✓. Phase 1 ⇒ all 8 primitives + 2 hooks ✓. Phase 2 ⇒ focus trap, labels, semantics, contrast ✓. Phase 3 ⇒ homepage ✓. Phase 4 ⇒ admin-first roll-out, all worst-offender pages ✓. Phase 5 ⇒ light/dark/mobile Playwright + deploy ✓. Success criteria (grep-clean, AA, primitives reused, no regressions) covered by 5.1/5.2.
- **Placeholder scan:** Foundation tokens and primitives have real code; Phase 4 uses a concrete recipe + per-page drift specifics from the audit (full per-page code can't be pre-written without reading each file at execution time — the recipe + audit references are the actionable spec).
- **Type/name consistency:** `cn` (lib/cn.js), `useEscapeKey`/`useFocusTrap` (hooks), `Badge/Card/StatCard/Button/Avatar/Input/Select/FormField/Tabs/Table/Drawer/Modal` consistent across barrel and consumers. `.btn-neo-danger`, `surface-code`, `--bg-code` consistent between Phase 0 and Phase 4.
- **Note:** `.panel` gaining default `p-6` is called out as a migration watch-item (callers needing `p-0`).
