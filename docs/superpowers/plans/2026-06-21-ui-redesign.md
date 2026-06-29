# OneFlow UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform OneFlow's plain, monochrome, angular (`radix-sera`) UI into a professional, blue-branded, modern-soft ERP interface — without disrupting the working PWA mobile UX.

**Architecture:** Token-first redesign. Swap the OKLCH color system in `globals.css` to a corporate-blue palette + semantic status/tone tokens. Rewire the shadcn primitives (`button`/`card`/`badge`) from `radix-sera` (rounded-none/uppercase/tracking-widest) to `new-york` (rounded/normal-case). Restyle the existing custom sidebar/topbar/bottom-nav in place. Selectively adopt shadcn blocks (`login-04`, `dashboard-01` patterns) and new primitives (`chart`, `tabs`, `avatar`, `table`, `checkbox`, `drawer`, `command`, `empty`, `scroll-area`, `sonner`). Sweep all hardcoded Tailwind palette / hex colors to semantic tokens.

**Tech Stack:** Next.js 16.1.6 (App Router), React 19, Tailwind CSS v4 (CSS-first config via `@theme inline`), shadcn/ui (`new-york` style), lucide-react icons, Recharts, PWA.

---

## Decisions (locked)

| Decision | Choice |
|---|---|
| Brand color | Blue `#2563EB` (Corporate ERP) — `--primary` OKLCH `0.546 0.215 262.88` |
| Visual style | Modern Soft — rounded-xl, normal-case, subtle shadows, 150–200ms transitions |
| Scope | Full redesign, phased (6 phases) |
| Dark mode | **None** — light-only; `.dark` block removed from `globals.css` |
| Logo | **Not needed** — gradient icon tile + "OneFlow" wordmark via Tailwind only |
| Sidebar | **Restyle existing custom** sidebar + bottom-nav (preserve role-aware nav, notification polling, PWA mobile UX) |
| Login | **`login-04`** — form + blue gradient brand panel, no cover image |
| Dashboard KPIs | **Controlled 4-hue token scale** — blue/emerald/amber/violet as semantic `--tone-*` tokens |

---

## New Design System

### Color palette (light mode — OKLCH tokens in `globals.css`)

| Token | OKLCH | Hex | Role |
|---|---|---|---|
| `--primary` | `oklch(0.546 0.215 262.88)` | `#2563EB` | Blue-600 — brand, primary actions, active nav |
| `--primary-foreground` | `oklch(0.985 0 0)` | `#FFFFFF` | White on primary |
| `--background` | `oklch(1 0 0)` | `#FFFFFF` | App background |
| `--foreground` | `oklch(0.21 0.034 264)` | `#0F172A` | Slate-900 — body text |
| `--card` / `--popover` | `oklch(1 0 0)` | `#FFFFFF` | Surfaces |
| `--muted` | `oklch(0.967 0.003 250)` | `#F1F5F9` | Slate-100 — muted fills |
| `--muted-foreground` | `oklch(0.55 0.015 250)` | `#64748B` | Slate-500 — secondary text |
| `--accent` | `oklch(0.95 0.02 255)` | `#EFF6FF` | Blue-50 — hover/active nav |
| `--accent-foreground` | `oklch(0.4 0.13 262)` | `#1D4ED8` | Blue-700 |
| `--secondary` | `oklch(0.967 0.003 250)` | `#F1F5F9` | Slate-100 |
| `--border` / `--input` | `oklch(0.922 0.004 250)` | `#E2E8F0` | Slate-200 |
| `--ring` | `oklch(0.546 0.215 262.88)` | `#2563EB` | Focus ring = primary |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `#DC2626` | Red (kept) |
| `--sidebar` | `oklch(0.985 0.002 250)` | `#F8FAFC` | Cool white sidebar |
| `--sidebar-primary` | `oklch(0.546 0.215 262.88)` | `#2563EB` | Blue-600 |
| `--sidebar-accent` | `oklch(0.95 0.02 255)` | `#EFF6FF` | Blue-50 active item |

**New semantic tokens:**
- `--success` `oklch(0.6 0.15 145)` / `--warning` `oklch(0.769 0.188 70.08)` / `--info` = `--primary`
- `--tone-blue` `oklch(0.546 0.215 262.88)` / `--tone-emerald` `oklch(0.6 0.15 145)` / `--tone-amber` `oklch(0.769 0.188 70.08)` / `--tone-violet` `oklch(0.541 0.28 293)`
- `--chart-1..5`: blue / emerald / amber / violet / rose

Each exposed to Tailwind via `@theme inline` (`--color-success`, `--color-tone-blue`, `--color-chart-N`).

### Primitive styling (Modern Soft)
- `components.json` style: `radix-sera` → `new-york`; `iconLibrary`: `remixicon` → `lucide`; `baseColor`: `mist` → `slate`
- **Button**: `rounded-md`, normal-case, `text-sm font-medium`, `h-9`/`h-10`, `transition-colors duration-200`
- **Card**: `rounded-xl border bg-card shadow-sm`, `CardTitle` = `font-semibold tracking-tight` (no uppercase)
- **Badge**: filled variants (`bg-primary/10 text-primary`, `bg-success/10 text-success`, `bg-warning/10 text-warning`, `bg-destructive/10 text-destructive`)
- **Radius**: `--radius` `0.625rem` → `0.75rem` (12px)
- Transitions 150–200ms; `cursor-pointer` on interactive; `hover:shadow-md` lift on cards.

---

## Phase 0 — Foundation: tokens, primitives, brand

**Files:**
- Modify: `frontend/app/globals.css`
- Modify: `frontend/components.json`
- Modify: `frontend/components/ui/button.tsx`
- Modify: `frontend/components/ui/card.tsx`
- Modify: `frontend/components/ui/badge.tsx`
- Modify: `frontend/app/manifest.ts`
- Modify: `frontend/app/layout.tsx`
- Create: `frontend/lib/theme.ts`

- [ ] Step 1: Rewrite `globals.css` — blue OKLCH palette, tone/status/chart tokens, `--radius: 0.75rem`, remove `.dark` block
- [ ] Step 2: Update `components.json` — `style: "new-york"`, `iconLibrary: "lucide"`, `baseColor: "slate"`
- [ ] Step 3: Rewrite `button.tsx` — new-york soft style (rounded-md, normal-case, text-sm)
- [ ] Step 4: Rewrite `card.tsx` — rounded-xl, CardTitle normal-case tracking-tight
- [ ] Step 5: Rewrite `badge.tsx` — filled variants (default/secondary/destructive/outline/success/warning)
- [ ] Step 6: Update `manifest.ts` — `theme_color: "#2563EB"`
- [ ] Step 7: Update `layout.tsx` — `themeColor: "#2563EB"`
- [ ] Step 8: Create `lib/theme.ts` — `STATUS_COLORS`, `CHART_COLORS`, `TONE_COLORS` maps reading CSS vars
- [ ] Step 9: Verify — `npx tsc --noEmit` (0 errors), `npm run lint` (clean)
- [ ] Step 10: Commit — `feat(ui): phase 0 — blue design tokens + new-york primitives`

## Phase 1 — Shared layout shell

**Files:**
- Create: `frontend/components/layout/page-header.tsx`
- Create: `frontend/components/layout/page-shell.tsx`
- Modify: `frontend/components/layout/desktop-sidebar.tsx`
- Modify: `frontend/components/layout/bottom-nav.tsx`
- Modify: `frontend/components/layout/top-bar.tsx`
- Modify: `frontend/app/dashboard/layout.tsx`

- [ ] Step 1: Create `PageHeader` — shared `title`/`description`/`breadcrumbs`/`actions`, sticky `h-16 border-b bg-background px-6`, handles TopBar clearance internally
- [ ] Step 2: Create `PageShell` — wraps `PageHeader` + `p-4 md:p-6 space-y-4` content
- [ ] Step 3: Restyle `desktop-sidebar` — gradient icon tile (`bg-gradient-to-br from-blue-500 to-blue-600`), active item `bg-accent text-accent-foreground border-l-2 border-primary`, section labels `text-xs uppercase tracking-wide`, `rounded-md transition-colors cursor-pointer`, notification badges `bg-primary text-white rounded-full`
- [ ] Step 4: Restyle `bottom-nav` — blue palette, active `text-primary`, badge dots `bg-primary`/`bg-destructive`
- [ ] Step 5: Restyle `top-bar` — `bg-popover shadow-md rounded-xl` dropdowns, `UserAvatar ring-primary/20`, unread rows `bg-accent`
- [ ] Step 6: Update `dashboard/layout.tsx` — adopt PageShell-compatible structure
- [ ] Step 7: Verify — tsc + lint + smoke test routes
- [ ] Step 8: Commit — `feat(ui): phase 1 — shared layout shell + branded sidebar`

## Phase 2 — Branded login

**Files:**
- Modify: `frontend/app/login/page.tsx`

- [ ] Step 1: Rebuild login — left = blue gradient brand panel (`from-blue-600 to-blue-700`, "OneFlow" wordmark, tagline), right = form card with `Input`/`Label`/primary `Button`, error `text-destructive` + alert icon, loading state
- [ ] Step 2: Verify — tsc + lint + smoke test `/login`
- [ ] Step 3: Commit — `feat(ui): phase 2 — branded login`

## Phase 3 — Dashboard redesign

**Files:**
- Create: `frontend/components/dashboard/stat-card.tsx`
- Create: `frontend/components/dashboard/status-bar.tsx`
- Modify: `frontend/app/dashboard/page.tsx`
- Add primitives: `npx shadcn@latest add @shadcn/chart @shadcn/tabs @shadcn/avatar @shadcn/sonner`

- [ ] Step 1: Install chart/tabs/avatar/sonner primitives
- [ ] Step 2: Create `StatCard` — `rounded-xl border p-6 shadow-sm hover:shadow-md`, tinted icon tile (`tone` prop → `bg-tone-*/10 text-tone-*`), trend delta (`TrendingUp`/`TrendingDown` + colored %), value `text-2xl font-bold tabular-nums`
- [ ] Step 3: Create `StatusBar` — segmented bar using `--color-success`/`--warning`/`--info` tokens
- [ ] Step 4: Rewrite dashboard — `StatCard` grid (4-hue token tones), shadcn `ChartContainer`/`ChartConfig` (replace hex → `var(--chart-N)`), `PageHeader`
- [ ] Step 5: Verify — tsc + lint + smoke test `/dashboard`
- [ ] Step 6: Commit — `feat(ui): phase 3 — dashboard redesign with token charts`

## Phase 4 — Reusable CRUD patterns + representative migrations

**Files:**
- Create: `frontend/components/data-table/data-table.tsx`
- Create: `frontend/components/data-table/mobile-card-list.tsx`
- Create: `frontend/components/status-badge.tsx`
- Create: `frontend/components/empty-state.tsx`
- Create: `frontend/components/section-card.tsx`
- Add primitives: `npx shadcn@latest add @shadcn/table @shadcn/checkbox @shadcn/drawer @shadcn/command @shadcn/empty @shadcn/scroll-area`
- Add dep: `@tanstack/react-table`
- Migrate: `app/dashboard/admin/users/page.tsx`, `app/dashboard/admin/departments/page.tsx`, `app/dashboard/vendors/page.tsx`, `app/dashboard/inventory/page.tsx`, `app/dashboard/requests/page.tsx`

- [ ] Step 1: Install table/checkbox/drawer/command/empty/scroll-area primitives + `@tanstack/react-table`
- [ ] Step 2: Create `DataTable` — `@tanstack/react-table` wrapper (sorting, pagination, column visibility, empty state)
- [ ] Step 3: Create `MobileCardList` — formalized mobile-card pattern, token-styled
- [ ] Step 4: Create `StatusBadge` — `variant="success|warning|info|destructive|neutral"` → token fills
- [ ] Step 5: Create `EmptyState` + `SectionCard`
- [ ] Step 6: Migrate users page → `PageHeader` + `DataTable` + `MobileCardList` + `StatusBadge`
- [ ] Step 7: Migrate departments page
- [ ] Step 8: Migrate vendors page
- [ ] Step 9: Migrate inventory landing + tabbed table
- [ ] Step 10: Migrate requests page (fix hardcoded `bg-white`/`border-slate-200`)
- [ ] Step 11: Verify — tsc + lint + smoke test all 5 pages
- [ ] Step 12: Commit — `feat(ui): phase 4 — CRUD patterns + 5 page migrations`

## Phase 5 — Hardcoded color sweep

**Files (all pages):**
- Replace `bg-violet-100`/`bg-blue-50`/`bg-amber-50`/`bg-emerald-*`/`bg-red-500`/`bg-blue-500` → `bg-{tone}/10 text-{tone}` or `bg-primary`/`bg-success`/`bg-warning`/`bg-destructive`
- Replace chart hex (`#3b82f6` `#10b981` `#f59e0b` `#8b5cf6`) → `var(--chart-N)`
- Replace `style={{ backgroundColor: '#...' }}` → token classes
- Fix `bg-white` → `bg-card`, `border-slate-200` → `border-border`, `text-slate-500` → `text-muted-foreground`
- Replace raw `<input>`/`<select>`/`<textarea>` in Sheets → shadcn primitives
- Remove unused `components/ui/sidebar.tsx`, `component-example.tsx`, `example.tsx`

- [ ] Step 1: Sweep all `app/dashboard/**` for hardcoded Tailwind palette classes → tokens
- [ ] Step 2: Sweep chart hex → `var(--chart-N)`
- [ ] Step 3: Replace raw HTML inputs in Sheets → shadcn primitives
- [ ] Step 4: Remove unused scaffold files
- [ ] Step 5: Verify — `rg "bg-(violet|blue|amber|emerald|sky|orange|indigo|teal|rose)-(50|100|700)" app/` clean; tsc + lint
- [ ] Step 6: Commit — `refactor(ui): phase 5 — hardcoded colors → semantic tokens`

## Phase 6 — Remaining pages + polish

**Files:** `production/*`, `schedule/*`, `purchase-orders`, `grn`, `dispatch`, `gate-passes`, `history`, `admin/settings`, `admin/bom`, `marketing-requests`, `suppliers/*`, inventory sub-pages

- [ ] Step 1: Migrate remaining pages to `PageHeader` + shared patterns
- [ ] Step 2: Add `EmptyState` to all zero-result lists
- [ ] Step 3: Run ui-ux-pro-max pre-delivery checklist (no emoji icons, cursor-pointer, transitions 150–300ms, contrast ≥4.5:1, focus states, responsive 375/768/1024/1440)
- [ ] Step 4: Verify — tsc 0 errors, lint clean, visual smoke test all routes
- [ ] Step 5: Commit — `feat(ui): phase 6 — remaining pages + polish`

---

## Verification (every phase)
- `cd frontend && npx tsc --noEmit` → 0 errors
- `npm run lint` → clean
- Smoke test touched routes at 375px / 768px / 1440px
- Commit per phase
