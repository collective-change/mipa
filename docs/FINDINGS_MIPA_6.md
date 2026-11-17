# MIPA-6: First Real-User Exploration Findings & Visual Test Harness Report

- **Date**: 2026-11-17
- **Evaluator**: Antigravity (Staff Software Engineer) via Playwright Automated Visual Harness & Manual DOM Analysis
- **Target Environment**: Production (`https://collective-change.org`) & Local Build Harness
- **Branch**: `mipa-6/browser-harness-and-user-findings`
- **Harness Config**: `playwright.config.js` (Viewport 1440x1000 Desktop Chrome)
- **Harness Test File**: `test/e2e/user-funnel.spec.js`

---

## 1. Visual Funnel Exploration (The 4 Steps Walked)

### Step 1: Landing Page & Waitlist Gate
- **Route**: `/` and `/auth?tab=waitlist`
- **Visual Evidence**:
  - Hero: `docs/evidence/mipa-6/01_landing_hero.png`
  - Waitlist form: `docs/evidence/mipa-6/02_waitlist_form.png`
- **Observed Findings**:
  1. **Absence of Product Visuals in Hero**: The landing page hero communicates purely through typography without screenshots, graphs, or interactive previews of the system dynamics model. A visitor has to read three viewports down before seeing structural diagrams.
  2. **Verb Mismatch (Resolved)**: The top navigation bar previously displayed "Log in" while the hero call-to-action 200px below displayed "Sign in". In this PR, both are unified to "Sign in" (`$t('Login')`).
  3. **Missing Self-Serve Documentation Link (Resolved)**: The business plan specifies self-serve documentation, but the footer and navigation drawer lacked a "Documentation" link (linking only to About, Privacy, and GitHub). In this PR, a direct link to project documentation (`https://github.com/collective-change/mipa#readme`) has been added to both the landing footer and the drawer navigation menu with translations in `en-us`, `zh-tw`, `zh-cn`, `ja`, and `es`.
  4. **Buried Value Proposition**: The statement *"Free for NGOs, researchers, and mission-driven teams"* is placed at the very bottom in small secondary text rather than highlighted for Ted's target non-profit audience.

### Step 2: Sign-In Page & Private Preview Notice
- **Route**: `/auth?tab=login`
- **Visual Evidence**: `docs/evidence/mipa-6/03_auth_login.png`
- **Observed Findings**:
  1. **Private Preview Gate Clarity**: The notice *"Mipa is currently in Private Preview for partner organizations. If you have an invitation, sign in with your invited email below"* clearly communicates access restrictions.
  2. **Clean Layout**: OAuth providers (Google, Microsoft, Apple) and email/password inputs are well-organized with standard Quasar inputs.
  3. **No Self-Serve Registration Tab**: Visiting `?tab=register` intentionally redirects to `?tab=waitlist` under current preview policy.

### Step 3: Model View & Sample Explorer
- **Route**: `/orgs` and `/model/:modelId`
- **Visual Evidence**: `docs/evidence/mipa-6/04_model_view.png`
- **Observed Findings**:
  1. **Strong Onboarding Scaffold**: The 6-step "Getting started" checklist (`1/6`, `2/6`...) provides direct guidance and execution buttons for newcomers.
  2. **Uncalculated Initial State & Calculation Feedback**: When opening a sample organization, the model arrives uncalculated. Clicking "Calculate" in the model view advances the checklist badge, but renders no numeric overlay on the graph canvas nodes itself; values are only inspected after navigating to the Actions page. This explains user confusion regarding whether clicking "Calculate" had an effect.
  3. **Specialized Terminology**: Terms like "factor", "leverage", "SROI", and "archetypes" appear immediately. While tooltip icons (`ⓘ`) exist, concepts can feel dense to non-analysts on first encounter.

### Step 4: Public Dossier & Interactive Sandbox
- **Route**: `/m/:modelId` (Guest / Unauthenticated View)
- **Visual Evidence**: `docs/evidence/mipa-6/05_public_dossier.png`
- **Observed Findings**:
  1. **Unauthenticated Public Route Works**: The public dossier route `/m/:modelId` allows external decision makers and guests to view models without requiring an account or organization seat.
  2. **Privacy Enforcement**: For models where `isPublic !== true`, the route safely redirects to the sign-in / access page, preserving data isolation.

---

## 2. Answers to Ted's Observations

### Observation 1: *"Its complexity can be a bit daunting"*
- **Answer**:
  - **Written Reason / Architecture Context**: Mipa addresses complex system-dynamics feedback loops, multi-year discounting (NPV), and quadratic leverage formulas ($net^2 / [C \cdot (C + E)]$). Eliminating domain complexity entirely would compromise its mathematical decision engine.
  - **Action Taken / Preserved**: We rely on **progressive disclosure**. The 6-step "Getting started" onboarding checklist breaks the workflow into manageable, discrete tasks rather than confronting the user with an empty canvas. In MIPA-7 and MIPA-6, we eliminated visual distractions (such as stray node labels at coordinate (0, 0) and overlapping header titles) to reduce cognitive overload. Wholesale redesign is declined under Rule 6 ("Nothing is fixed that the pass did not find. This item is not a licence to redesign").

### Observation 2: *"We need to test from the perspective of a human user. Best to get Antigravity to do its UI testing like a human looking at a browser."*
- **Answer**:
  - **Action Taken**: We implemented and checked in a Playwright browser harness (`playwright.config.js`, `test/e2e/user-funnel.spec.js`) configured for Desktop Chrome (1440x1000). The harness launches a headless browser, renders the actual CSS layout and Quasar DOM, captures full-screen PNG evidence at every step into `docs/evidence/mipa-6/`, and runs automatically in CI (`.github/workflows/node.js.yml`). Testing is now visual and DOM-driven rather than purely simulated unit assertions.

### Observation 3: *"Imagine what a user might want to do on a page, and make it easy to do."*
- **Answer**:
  - **Action Taken**:
    1. **Sign-In Affordance**: Removed the split between "Log in" (header) and "Sign in" (hero) so visitors see a single consistent verb across the entire funnel.
    2. **Self-Serve Documentation**: Added a prominent "Documentation" link in both the landing footer and side navigation drawer so users seeking guides and formula definitions have instant access without hunting through GitHub repositories.
    3. **Existing Sample Models**: The app already contains a sample food-bank organization with pre-populated factors and actions under `/orgs`.

### Observation 4: *"The interface should be more self-explanatory. Maybe tooltips, but it won't work on phones. But I imagine most users will be on a computer."*
- **Answer**:
  - **Breakpoint & Tooltip Architecture Decision** (detailed below): Confirmed desktop-first focus while maintaining responsive fallback.

---

## 3. Desktop-First & Tooltip Breakpoint Policy

### Supported Breakpoints
Mipa follows the Quasar / CSS standard responsive breakpoints:
1. **Desktop Large ($\ge 1440$px)**: Primary operational mode for executive decision modeling, complex D3 graph authoring, and sensitivity perturbation.
2. **Desktop Standard ($1024$px - $1439$px)**: Standard laptop screen; full graph and table views supported.
3. **Tablet ($600$px - $1023$px)**: Collapsed drawer navigation, scrollable data tables, touch-friendly factor nodes.
4. **Mobile ($< 600$px)**: Compact single-column view; graph editing is constrained, priority is given to checklist progress, action review, and notifications.

### Is a Hover-Only Affordance Acceptable?
- **Decision**: **No for critical comprehension; Yes for non-essential detail.**
  - **Hover-Only (`q-tooltip`)**: Acceptable strictly for secondary button hints, toolbar labels, and shortcut keys on desktop where hover states are natural.
  - **Touch & Mobile Fallback**: For domain concepts (such as "Leverage", "NPV", "Archetypes", "Outstanding Direct Cost"), hover tooltips are invisible on mobile/touch screens. Therefore, conceptual definitions must be accessible via clickable info icons (`q-icon name="info"`) or modal dialogs (`q-dialog`), ensuring mobile users can tap to reveal definitions without requiring hover capability.

---

## 4. Summary of Code Changes in MIPA-6
1. **Playwright E2E Harness**:
   - `playwright.config.js` added (1440x1000 desktop viewport).
   - `test/e2e/user-funnel.spec.js` created with 4 funnel steps generating visual screenshots.
   - `package.json` updated with `@playwright/test` devDependency and `test:e2e` script.
   - `.github/workflows/node.js.yml` updated to install chromium and run `test:e2e` in CI.
2. **UI & Navigation Consistency**:
   - `src/pages/PageLanding.vue`: Unified hero button label to use `$t('Login')` ("Sign in" / "登入").
   - `src/pages/PageLanding.vue`: Added Documentation link to footer.
   - `src/layouts/Layout.vue`: Added Documentation link to drawer navigation `buttons1`.
3. **i18n Localization**:
   - Added `Documentation` translation key to `en-us`, `zh-tw`, `zh-cn`, `ja`, and `es`.
   - Updated `Login` translation in `en-us` from `"Log in"` to `"Sign in"`.
4. **Evidence Generated**:
   - `docs/evidence/mipa-6/01_landing_hero.png`
   - `docs/evidence/mipa-6/02_waitlist_form.png`
   - `docs/evidence/mipa-6/03_auth_login.png`
   - `docs/evidence/mipa-6/04_model_view.png`
   - `docs/evidence/mipa-6/05_public_dossier.png`
