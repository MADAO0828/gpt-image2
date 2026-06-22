# macOS Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a unified macOS-style redesign to GPT Image2 pages while preserving auth, settings, prompt loading, and API profile behavior.

**Architecture:** Add a shared CSS design-system file and opt pages into it with minimal markup/class changes. Workbench changes stay in safe outer shell styling and do not move React-owned core nodes. Verification is performed after each phase.

**Tech Stack:** Static HTML/CSS/JS, bundled React assets, Cloudflare Pages Functions, Wrangler deployment.

---

### Task 1: Add shared macOS design system

**Files:**
- Create: `D:/gpt-image2/assets/macos-design.css`
- Modify: `D:/gpt-image2/login.html`
- Modify: `D:/gpt-image2/admin.html`
- Modify: `D:/gpt-image2/prompts.html`
- Modify: `D:/gpt-image2/index.html`

- [ ] Create CSS variables, typography, buttons, cards, forms, nav, modal, toast, scroll and theme helpers.
- [ ] Link the file from each HTML page with a versioned query string.
- [ ] Do not add auth/session JavaScript.
- [ ] Verify pages still parse.

### Task 2: Restyle login, admin, and prompts without behavior changes

**Files:**
- Modify: `D:/gpt-image2/login.html`
- Modify: `D:/gpt-image2/admin.html`
- Modify: `D:/gpt-image2/prompts.html`

- [ ] Add body-level macOS classes and page markers.
- [ ] Harmonize navigation/headers through classes only.
- [ ] Improve cards/forms/modals using shared classes and CSS overrides.
- [ ] Keep existing IDs and JS event targets untouched.

### Task 3: Restyle workbench safe chrome and remove obsolete diagnostic badge

**Files:**
- Modify: `D:/gpt-image2/index.html`
- Possibly modify safe custom CSS in `D:/gpt-image2/assets/index-CZHhOunP-gpt2-20260621-agent-prompts-2.js` only if CSS is injected there.

- [ ] Add shared CSS link and production marker.
- [ ] Style top chrome, prompt modal, Agent input, and profile selector through safe CSS selectors.
- [ ] Remove/hide obsolete right-top diagnostic box if it exists outside essential controls.
- [ ] Do not alter profile selection data flow.

### Task 4: Performance polish

**Files:**
- Modify CSS/HTML only unless root cause evidence shows a JS issue.

- [ ] Add `content-visibility:auto` and containment to large card grids where safe.
- [ ] Add lazy/async image attributes where HTML renders images directly.
- [ ] Reduce expensive shadows and backdrop filters on repeated cards.
- [ ] Keep scroll speed natural; do not hijack wheel events.

### Task 5: Verification, deploy, commit, push

**Files:**
- Modify: `D:/gpt-image2/scripts/stability-checks.js` if needed for new markers.

- [ ] Run node syntax checks.
- [ ] Run inline script parse checks.
- [ ] Run stability checks.
- [ ] Run local browser checks/screenshot checks as far as auth allows.
- [ ] Deploy using staging directory.
- [ ] Verify production marker and critical routes.
- [ ] Commit and push to GitHub.
