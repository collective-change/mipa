# Mipa Decentralized Community Governance & Open Ecosystem Blueprint

This document specifies the open governance model, community stewardship pathways, and zero-maintenance architectural principles that enable Mipa to scale its global societal impact sustainably with near-zero ongoing demand on the creator's personal time.

---

## 1. Zero-Maintenance Architectural Principles

Mipa was architected from inception to scale horizontally and sustainably without requiring costly server infrastructure or full-time administrative oversight:

1. **Client-First Calculation Engine**:
   - All system-dynamics simulations, Math.js mathematical evaluations, Monte Carlo risk runs, and SROI deductions execute directly in the user's web browser (`src/workers/calcWorker.js`).
   - Zero simulation server costs: cloud infrastructure expenses do not scale with model complexity or calculation frequency.
2. **Bring-Your-Own-Key (BYOK) AI Architecture**:
   - Organizations bring their own LLM API keys (Anthropic Claude, OpenAI, Google Gemini, OpenRouter, or custom self-hosted endpoints).
   - Keys are encrypted with AES-256-GCM (`AI_KEY_ENCRYPTION_KEY`) in private Firestore subcollections (`orgSecrets/{orgId}`) and decrypted only ephemerally during requests.
   - The platform bears zero token costs and zero API rate-limit liability.
3. **Frictionless Self-Serve Onboarding**:
   - Built-in Public Model Template Library with pre-configured sector models (Disaster Relief, Community Health, Digital Literacy, Philanthropic Flywheel).
   - Interactive 4-step self-guided onboarding tour, automated factor parsing, and contextual micro-guidance.
   - Eliminates 1-on-1 onboarding sessions and direct operational support bottlenecks.
4. **Automated CI/CD & Test Rigor**:
   - 100% automated test coverage (Vitest client-side suite and Node.js Cloud Functions test suite).
   - ESLint and strict localization gates ensure high software quality before code reaches `master`.

---

## 2. Open Model Sharing & Attribution Standard

System dynamics models represent shared societal wisdom. To foster peer-to-peer learning between humanitarian and social organizations worldwide:

- **Open License**: All public starter models in Mipa are licensed under [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).
- **Model Portability**: Any organization can export their model via `exportModelAsShareableTemplate()` as a sanitized JSON payload. Sensitive organizational secrets, member IDs, and internal chats are automatically excluded.
- **Attribution Covenant**: Organizations that fork or adapt an open model retain author attribution to honor the originators while sharing refinements with the global community.

---

## 3. Decentralized Community Stewardship

To distribute stewardship beyond a single creator:

1. **Community Template Contributions**:
   - Working groups, researchers, and NGOs can propose new sector templates via GitHub Pull Requests against `src/utils/modelTemplates.js`.
   - Criteria for inclusion:
     - Clear causal links and formulas (Stocks, Flows, and Auxiliaries).
     - Realistic baseline values supported by published research or empirical operational data.
     - Accompanied by at least two illustrative candidate strategic actions demonstrating leverage comparison.
2. **Issue Routing & Public Discussions**:
   - All bug reports, feature suggestions, and methodology questions are handled publicly via [GitHub Issues](https://github.com/collective-change/mipa/issues) and [GitHub Discussions](https://github.com/collective-change/mipa/discussions).
   - No private email support channel; answers to questions become permanently searchable public knowledge.
3. **Academic & Research Partnerships**:
   - Universities and systems thinking researchers (e.g. System Dynamics Society, NGO strategy labs) are invited to audit formulas, evaluate archetype dynamics, and publish case studies using open Mipa models.

---

## 4. Sustainability & Longevity Guarantee

Because Mipa uses standard Firebase Serverless components, static asset hosting, and local client-side computation, the entire application can run autonomously and cost-neutrally for years. Even if the original development team is offline, organizations worldwide can continue modeling, simulating, and optimizing leverage for societal good.
