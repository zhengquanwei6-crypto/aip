# UI Optimization Context

Generated: 2026-06-06
Project: `/opt/design-ai-ops`
Product name: AIP / Design AI Ops

## Purpose

This file is the project-level UI context for future better-web-ui work. Treat it as the default design brief before changing pages, components, flows, or visual direction.

The product is not a marketing website. It is an AI creative operations workspace: prompt generation, image generation, asset management, sharing, task scheduling, client follow-up, income tracking, analytics, settings, and internal collaboration.

The desired product feel is **AI 战情室 / Creative Command Center**: operational, premium, direct, and production-focused. Users should feel they can open the app and immediately start producing, reviewing, sharing, or scheduling work.

## Frontend Stack

- Framework: Next.js `14.2.18`, App Router.
- Runtime UI: React `18.3.1`, TypeScript.
- Styling: Tailwind CSS `3.4.4`, global tokens and component utilities in `src/app/globals.css`.
- Dark mode: class-based Tailwind dark mode.
- Icons: `lucide-react`; prefer lucide icons over emoji or custom inline SVG for UI controls.
- Component primitives: Radix UI dialog, progress, separator, switch, tabs, tooltip, slot.
- Utility libraries: `clsx`, `class-variance-authority`.
- Data/backend context: Prisma, Next route handlers, dashboard summary endpoints, asset/share/task APIs.

## Current Design System

The app has a custom command UI layer in `src/app/globals.css`.

Core classes:

- `command-panel`: dark command-center panel with grid, scan line, high contrast, white text.
- `command-header`: page-level hero/header variant with command grid and actions.
- `command-glass`: translucent light/dark panel with grid texture and subtle cyan energy.
- `command-toolbar`: glass toolbar for tabs, filters, and grouped controls.
- `command-input`: elevated form input style.
- `command-segment`, `command-segment-item`, `command-segment-item-active`: segmented controls.
- `command-table`: dense operational tables with dark table headers and hover row feedback.
- `command-stat-card`: KPI tiles and compact metric blocks.
- `asset-command-card`, `task-flow-card`: repeated asset/task cards.
- `empty-action-state`, `command-empty`: actionable empty states.
- `detail-lift`, `hover-lift`, `motion-soft`, `motion-pop`, `message-in`, `result-pop`: motion utilities.
- `btn-primary`, `btn-secondary`, `btn-danger`, `badge-*`, `input`, `label`, `table`, `surface`.

Important visual tokens:

- Near black command surfaces: slate-950 / `--ops-black`.
- Work area: fog white / slate-50 to white with subtle grid.
- Primary signal: cyan (`--ops-info`, cyan-300/400/500).
- Success: emerald (`--ops-success`).
- Warning: amber (`--ops-warning`).
- AI accent: limited purple/fuchsia (`--ops-ai`, Tailwind brand purple).
- Borders: slate-200 light, slate-800 dark.
- Radius: globally forced to `0.5rem`; avoid large pill/card radius unless there is a strong reason.

## Page Architecture

Desktop shell:

- `src/components/AdminShell.tsx`
- Left command sidebar, sticky top status bar, breadcrumb/title area, live dashboard summary chips.
- Primary nav groups:
  - 控制台: `/dashboard`
  - 创作: `/ai-tools`, `/playground`, prompt/image/comfy pages
  - 资产: `/assets`, `/share`, `/history`, `/workspace`, `/imgbed`
  - 运营: `/today`, `/contents`, `/work/*`
  - 经营: `/clients`, `/income`, `/analytics`, `/pricing`, `/analysis`
  - 协作: `/discuss`
  - 设置: `/settings`, `/adapters`, `/presets`, `/docs`

Mobile shell:

- `src/components/m/MobileShell.tsx`
- Lightweight command controller, not a full desktop clone.
- Bottom nav: 控制台, 任务, 创作, 历史, 更多.
- Use single-column layouts, large tap targets, stable card dimensions, and compressed operational signals.

Public surfaces:

- `/`: public command-center homepage with real dashboard signals.
- `/s/[shareId]`: customer preview/share page; should feel client-facing and premium, not like admin UI.

## Existing Page Style

Current direction after recent redesign:

- Homepage `/`: full dark command-center hero, real pipeline, recent assets, today signals, operational CTAs.
- Dashboard `/dashboard`: command overview with `CommandHeader`, `OpsRail`, live mission matrix, task and asset summaries.
- GPT IMG / image generation: high-priority production page. Must feel like the main creation cockpit.
- Search/tools/presets/analytics/analysis/work pages: being migrated to command-glass panels, command toolbars, command tables, lucide icons.
- Assets/history/share/imgbed/workspace: asset command library and share operations.
- Today/contents/work platform pages: publishing and platform production consoles.
- Clients/income/analytics: business cockpit around task/share/client/revenue signals.
- Discuss: needs further UX work; should support decisions flowing back into tasks, prompts, or assets.

## UX Principles

1. Build only user-visible, usable improvements.
2. Prioritize GPT IMG 2 / image generation, share flow, and collaboration because these are high-impact user-facing workflows.
3. Keep every module connected to a next action:
   - Prompt -> image generation.
   - Image output -> save to asset.
   - Asset -> share, download, reuse, create task.
   - Task -> today schedule and platform workflow.
   - Client -> quote/follow-up/income.
   - Discussion -> task/prompt/asset decision.
4. Avoid standalone dead-end pages.
5. Use real data where available instead of decorative placeholders.
6. Empty states must be actionable.
7. Loading/error/success states must be visible and styled.
8. No nested cards; use full-width sections, panels, and repeated cards only for repeated items.
9. Do not use emoji as primary UI icons. Use lucide icons.
10. Avoid generic AI aesthetics: no empty purple gradients, no decorative blobs, no meaningless hero cards.

## Interaction And Motion

Current global motion exists in `globals.css`:

- Page enter: `page-enter`
- Reveal: `reveal`, `motion-soft`
- Pop: `motion-pop`, `result-pop`
- Messages: `message-in`
- Progress: `animate-progress-indeterminate`
- Shimmer: `animate-shimmer`
- Shake: `animate-shake`
- Command scan: `scan-x`
- Data flow rail: `command-rail`

Use motion for operation feedback:

- Generation in progress.
- Image/result completion.
- Asset saved.
- Share link created.
- Task status changed.
- Discussion message sent.
- Page/tab transitions.

Keep motion subtle, fast, and functional. Avoid large decorative animations that make dense tools harder to scan.

## Component Guidance

Preferred:

- Page headers: `CommandHeader` or `command-panel`.
- Pipeline/closed-loop steps: `OpsRail`.
- Empty states: `EmptyActionState` or `command-empty`.
- Generation state: `GenerationStatusPanel`.
- Tables: `table command-table`.
- Forms: `input command-input`, consistent labels.
- Repeated media: command-style asset cards with hover actions.
- Buttons: `btn-primary` for main action, `btn-secondary` for secondary, icon + concise label.
- Status: `badge-*`, `status-pill`, pulse dot only for live state.

Avoid:

- Raw `card/card-body/card-header` on newly redesigned pages unless intentionally maintaining legacy layout.
- Text-only action links for primary operations.
- Emoji labels.
- Rounded oversized marketing cards.
- Layouts that hide the next action.
- Text that can overflow on mobile.

## Implementation Defaults

- Keep using Tailwind utilities and existing global component classes.
- Prefer extending `globals.css` tokens/utilities only when multiple pages need the same pattern.
- Keep edits scoped to visible UI and connected workflows.
- Use existing APIs and data shapes before adding new contracts.
- Do not introduce a new UI library unless absolutely necessary.
- Use `lucide-react` for icons.
- Keep responsive breakpoints straightforward: single-column mobile, dense grid desktop.
- Preserve dark mode readability.
- Run `npm run build` after meaningful UI changes.

## High-Priority Improvement Areas

1. GPT IMG 2 / image generation
   - Main production cockpit.
   - Needs stronger creation flow, progress feedback, result comparison, save/share/task actions, batch operations, and history reuse.

2. Share flow
   - Must reliably create links from assets/history/outputs.
   - Needs clearer link state, copy/download feedback, public preview polish, and dashboard visibility.

3. Collaboration/discuss
   - Current logic should be redesigned around decisions and outputs.
   - Messages should be able to become prompts, tasks, asset notes, or client follow-up items.

4. Cross-page consistency
   - Continue removing legacy card styles.
   - Ensure every page uses command headers, glass panels, operational status, and consistent action controls.

5. Mobile command surfaces
   - Keep simple and useful.
   - Do not mirror desktop complexity.

## Validation Checklist

Before finishing UI work:

- `npm run build` passes.
- Key pages return HTTP 200 after login.
- `/api/health/full` returns `ok: true`.
- `/api/dashboard/summary` returns key dashboard fields.
- Desktop and mobile layouts have no obvious overflow.
- Main actions are visible without reading instructions.
- Empty/loading/error/success states are styled.
- Buttons and cards do not jump layout on hover.
- No newly introduced emoji-based controls.

## Notes

- Production project path is `/opt/design-ai-ops`.
- Old `/opt/aip` is historical reference only.
- The current product direction intentionally emphasizes visible UI/UX and workflow closure, not security hardening.
- The repository currently has many uncommitted historical changes; do not revert unrelated files.
