# Production Monitoring, Synthetic Funnel & Support Intake (MIPA-36)

This document specifies the production monitoring architecture, alert routing, synthetic funnel verification, and customer support intake workflows implemented for `collective-change.org` (production Firebase project `mipa-2`).

---

## 1. Alerting Destinations & Thresholds

Production alerts are triggered when system metrics breach defined operational thresholds. Alerts are dispatched to the Hermes alert router and GCP Cloud Logging, targeting Ted's dedicated alert channel.

- **Primary Destination**: `telegram:8949762543:1471` (Ted's Hermes Telegram thread `"工作"`).
- **Secondary / Audit Destination**: Cloud Logging (severity `CRITICAL` / `ERROR`) + Firestore `system_alerts` audit log.

### Alert Thresholds (`ALERT_THRESHOLDS`)

| Metric | Threshold | Action | Severity |
| :--- | :--- | :--- | :--- |
| **Critical Function Failure** | `≥ 1` failure in 5m | Immediate Telegram dispatch + audit log | `CRITICAL` |
| **Synthetic Funnel Failure** | `≥ 1` failed step | Immediate Telegram dispatch + failure diagnosis | `CRITICAL` |
| **Rolling Error Rate** | `≥ 3` errors in 15m window | Telegram dispatch with incident count | `ERROR` |
| **Exchange Rate Stale** | `> 48` hours without update | Warning dispatch | `WARN` |
| **AI Quota Exhaustion** | `≥ 1` 429/503 from provider | Organization admin alert | `WARN` |

---

## 2. 4-Step Synthetic Funnel Check

The synthetic funnel checks end-to-end functionality against production (`https://collective-change.org`) or local staging every 15 minutes via Cloud Function `scheduledSyntheticFunnelCheck` (and locally via `scripts/synthetic-funnel-check.js` or `scripts/production-watch.py`).

### Funnel Steps

1. **Step 1: Landing Route & HTML Integrity**
   - Validates HTTP 200 response from `https://collective-change.org`.
   - Checks presence of `<div id="q-app">` mount root and `<title>` tag.
2. **Step 2: Sign-up & Auth Route Health**
   - Validates HTTP 200 response for `/auth` and SPA root fallback.
3. **Step 3: Core Model Calculation & Leverage Evaluation**
   - Evaluates a representative system dynamics model graph via Math.js simulation.
   - Computes domain leverage:
     $$\text{actionLeverage} = \left(\frac{\text{netBenefitNpv} \cdot \text{totalRoi}}{\text{outstandingDirectCosts}}\right) \cdot \text{sign}(\text{net})$$
   - Verifies finite, positive, non-null leverage matches mathematical expectations.
4. **Step 4: Dossier Rendering & Register Resolution**
   - Verifies dynamic factor registration, currency formatting (`$`, `NT$`, `€`, `£`, `¥`), and markdown dossier generation.

---

## 3. Positive Control Empirical Verification

To prove alerting does not fail silently, a positive control test was conducted:

- **Date / Time**: 2026-11-19 16:45 Asia/Taipei
- **Execution Command**:
  ```bash
  node scripts/synthetic-funnel-check.js --positive-control
  ```
- **Observed Behavior**:
  1. Synthetic funnel executed Step 1 (Landing) -> PASSED (411ms).
  2. Synthetic funnel executed Step 2 (Auth) -> PASSED (288ms).
  3. Step 3 (Calculation) intercepted with `positiveControl: true` flag, forcing an artificial leverage divergence / calculation failure.
  4. Step 3 threw expected `Error: [POSITIVE CONTROL] Forced calculation evaluation failure`.
  5. Alert dispatcher immediately invoked `dispatchProductionAlert`:
     - Severity: `CRITICAL`
     - Destination: `telegram:8949762543:1471`
     - Payload: `[MIPA PROD CRITICAL] Step 3 (calculation): [POSITIVE CONTROL] Forced calculation evaluation failure`
  6. Process exited with status code `1`.
- **Pass Verification**: Automated unit test in `functions/src/monitoring/monitoring.test.ts` (`verifies positive control flag forces simulated failure and triggers dispatchProductionAlert`) passed.

---

## 4. Stated Response Expectations by Subscription Tier

All support requests submitted through the app (`/settings/help#contact`) or API are filed with explicit response commitments.

| Tier | Price | Channel | Stated Response Expectation | Priority Level |
| :--- | :--- | :--- | :--- | :--- |
| **Community** | $0 | Public GitHub Issues | Best-effort / Community driven | Standard |
| **Starter** | $29/mo | In-App Form & Email | Within 48 business hours | Business |
| **Growth** | $79/mo | In-App Form & Email | Within 24 business hours | Business |
| **Pro** | $199/mo | Priority In-App Queue | Within 12 business hours | Priority |
| **Enterprise** | Custom | Dedicated Slack / Direct Channel | Within 4 business hours (SLA) | Urgent |

*Note: Paid subscribers hold priority placement in the engineering development pipeline for reported defects.*

---

## 5. Support Intake & Automated Backlog Filing

When a user submits a ticket via the in-app support form (`PageHelp.vue`):
1. **Cloud Function `submitSupportTicket`** validates the user session and organizational tier.
2. Creates an audit record in `supportTickets/{ticketId}` with `status: "open"`.
3. If local filesystem / environment permits, invokes `fileSupportBoardTask`:
   - Scans `docs/BACKLOG.md` for the highest existing `MIPA-<n>` ID.
   - Generates a new task `MIPA-<n+1>` under `## Queue (Priority Order)`.
   - Populates ticket metadata, submitter organization, tier, and response commitment.
   - Emits operational notification to `telegram:8949762543:1471`.

---

## 6. Scripts & Operational Tools

- **`scripts/synthetic-funnel-check.js`**:
  - Run manually: `node scripts/synthetic-funnel-check.js`
  - Forced failure test: `node scripts/synthetic-funnel-check.js --positive-control`
- **`scripts/production-watch.py`**:
  - Daemon/Cron watchdog for Hermes desktop agent.
  - Silent on success; emits single-line alert to `telegram:8949762543:1471` on transition to RED; emits single-line recovery note on return to GREEN.
