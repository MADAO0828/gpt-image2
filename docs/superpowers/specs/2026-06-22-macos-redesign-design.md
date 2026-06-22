# macOS Style Redesign Design Spec

Date: 2026-06-22
Project: GPT Image2 Cloudflare Pages app

## Goal
Redesign login, admin, prompt repository, and image workbench UI into a unified macOS-inspired commercial interface while preserving current authentication, profile selection, prompt data loading, API settings, and Cloudflare behavior.

## Non-negotiable Safety Boundaries
- Do not change auth/session/logout logic as part of visual redesign.
- Do not inject shared nav behavior that changes per-page permissions or redirects.
- Do not move or mutate React-owned core DOM inside #root except through existing safe body-level chrome hooks.
- Do not change API key persistence, profile selection, or image proxy behavior unless a verified bug requires a separate targeted fix.
- Do not remove current user/admin feature access.

## Visual Direction
- macOS Sonoma/Sequoia-inspired product UI.
- System font stack, crisp typography, large radii, subtle borders, soft shadows, restrained vibrancy.
- Day theme: white background, black text, subtle gray surfaces.
- Night theme: black/near-black background, white text, subtle elevated surfaces.
- Controls use pill or rounded-rectangle shapes with tactile hover and active states.
- Motion is subtle and performance-safe: transform and opacity only where practical.

## Shared Design System
Create a lightweight shared CSS layer for:
- Design tokens: backgrounds, text colors, muted text, surfaces, borders, radius, shadows, accent colors, z-index layers.
- Top navigation: consistent height, spacing, grouping, account badge, role badge, active states.
- Buttons: primary, secondary, ghost, danger, icon buttons.
- Cards and panels: macOS-like radius, shadow, borders.
- Forms: unified labels, inputs, selects, textarea, focus rings, key visibility button support.
- Modals/toasts: high z-index over navigation, no collisions.

## Page-Specific Design

### Login
- Clean centered frosted card.
- Subtle product header and theme control.
- Preserve existing registration/login behavior.

### Admin
- macOS Settings-like layout.
- Left navigation or segmented settings grouping if existing markup fits better.
- API key visible toggle remains available.
- Save status stays inside each tab/section, not global floating conflict.
- Existing admin/user permissions preserved.

### Prompts
- Gallery-like card grid.
- Faster perceived loading through skeletons and image lazy loading.
- Detail modal has large image area and full prompt area.
- Existing prompt loading/auth behavior preserved.

### Workbench
- Do not rewrite bundled app behavior.
- Restyle safe outer chrome and existing injected controls only.
- Top chrome visually aligns with admin/prompts without sharing risky auth code.
- Agent input and controls remain visually integrated and isolated from gallery.
- Remove obsolete diagnostic floating readout if still present.

## Performance Requirements
- Avoid heavy box-shadow on hundreds of cards.
- Avoid scroll listeners that force layout on every frame.
- Use content-visibility or contain where safe for large grids/cards.
- Use lazy image loading and async decoding for prompt/gallery images where possible.
- Timer display should be based on elapsed wall-clock time, not accumulated intervals, where code is reachable safely.

## Verification Requirements
- Run JS syntax checks for edited bundles/functions/scripts.
- Run inline HTML script parse checks for login/admin/prompts/index.
- Run project stability checks.
- Use local or wrangler preview/browser checks for visible pages where possible.
- Deploy through staging directory only, avoiding .codegraph upload.
- Verify production contains new marker and prompts route is not redirected by changed code.
