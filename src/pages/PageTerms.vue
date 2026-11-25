<template>
  <q-page padding>
    <article class="policy">
      <div class="text-h4 q-mb-xs">{{ $t("termsOfServiceTitle") }}</div>
      <div class="text-caption text-grey-7">
        Draft, last updated 19 November 2026
      </div>
      <q-banner v-if="$i18n.locale != 'en-us'" class="bg-grey-2 q-my-md" rounded>
        {{ $t("termsEnglishOnly") }}
      </q-banner>

      <p class="q-mt-md">
        Longecho is a strategic coordination web application from the collective-change.org
        project that helps organizations achieve success. Teams model how they work, compare
        possible actions by their relief per unit of cost (效應比 / leverage), and publish
        citable decision dossiers with the world in view. By using or accessing Longecho, you
        agree to these Terms of Service.
      </p>

      <section v-for="section in sections" :key="section.title">
        <h2 class="text-h6 q-mt-lg q-mb-sm">{{ section.title }}</h2>
        <p v-for="(paragraph, i) in section.paragraphs" :key="i">{{ paragraph }}</p>
        <ul v-if="section.items">
          <li v-for="(item, i) in section.items" :key="i">{{ item }}</li>
        </ul>
      </section>

      <h2 class="text-h6 q-mt-lg q-mb-sm">Contact</h2>
      <p>
        For questions about these terms or Longecho's policies, please open an issue on
        <a :href="issuesUrl" target="_blank" rel="noopener">Longecho's GitHub issues</a>.
      </p>
      <p>
        To report a security vulnerability confidentially, please use
        <a :href="securityAdvisoryUrl" target="_blank" rel="noopener">GitHub Private Vulnerability Reporting</a>.
      </p>
    </article>
  </q-page>
</template>

<script>
import { ISSUES_URL, SECURITY_ADVISORY_URL } from "@/utils/util-links";

export default {
  name: "PageTerms",
  data() {
    return {
      issuesUrl: ISSUES_URL,
      securityAdvisoryUrl: SECURITY_ADVISORY_URL,
      sections: [
        {
          title: "1. What Longecho provides and subscription tiers",
          paragraphs: [
            "Longecho provides system dynamics modeling, action leverage ranking, and decision governance tools. In our tiered model, seats represent alignment units — the team members who discuss, evaluate, and agree on the shared model — rather than mere login counts.",
          ],
          items: [
            "Community Tier ($0): A free tier designed for individuals, small non-profits, and students. The free tier serves as our primary mission delivery mechanism and is subsidized by paid tiers. It includes 1 active model builder seat, client-side simulation engine, standard planetary and social boundary indicators, and 1 lifetime publication right.",
            "Starter Tier ($29/month): Up to 5 collaborating seats sharing a model, unlimited models and actions, Bring-Your-Own AI key integration, and Monte Carlo risk bounds.",
            "Growth Tier ($79/month): Up to 20 collaborating seats, multi-model portfolio optimization, immutable governance snapshots, and priority support.",
            "Pro Tier ($199/month): Up to 50 collaborating seats, printable and official decision brief exports, and kept-current publication records.",
            "Enterprise Tier: Transparently published pricing for 150+ seats, custom archetypes, priority compute, and formal service commitments. Pricing is always published on the page without forced sales calls.",
          ],
        },
        {
          title: "2. Client-side calculations and decision support",
          paragraphs: [
            "All model calculations, Monte Carlo simulations, and action leverage formulas (效應比) execute entirely on your device inside your web browser (via a Web Worker with Math.js). Calculations never run on our servers.",
            "Longecho's calculations and rankings are decision-support instruments designed to illuminate trade-offs and clarify strategic choices. They do not constitute financial, investment, legal, or accounting advice.",
          ],
        },
        {
          title: "3. Merchant of Record and payments",
          paragraphs: [
            "All paid tier subscriptions, upgrades, and tax collections are processed by Lemon Squeezy, acting as our Merchant of Record.",
            "Subscriptions renew automatically each month or year depending on the billing cycle chosen at checkout. You may modify or cancel your subscription at any time using the Customer Portal link in your organization's settings.",
          ],
        },
        {
          title: "4. Publishing rights, permanence, and revocation",
          paragraphs: [
            "When an organization publishes a model, action portfolio, or decision dossier to the public Register, that publication constitutes a deliberate, citable record intended for counterparty and funder reliance.",
            "Revocation ≠ erasure: Once published, a public record's historical timestamp and citable status are preserved. If an organization withdraws or archives a published dossier, the system records a dated revocation notice (tombstone) rather than erasing historical existence. Counterparties who relied on a published record are guaranteed provenance and auditability.",
            "In contrast, unpublished working drafts, private models, exploratory nodes, internal notes, and team conversations are confidential and erasable at any time.",
          ],
        },
        {
          title: "5. Artificial Intelligence and third-party services",
          paragraphs: [
            "Organizations may configure their own API keys from supported AI providers (such as Anthropic or OpenAI) or utilize provided starter allowances. API keys are stored encrypted at rest using AES-256-GCM.",
            "AI-generated drafts and factor estimates are starting points for human deliberation. Nothing in your organization's model changes until a human member reviews and accepts the suggestion.",
          ],
        },
        {
          title: "6. Account and organization deletion",
          paragraphs: [
            "You may delete your personal user account or any organization you administer at any time using the self-service deletion tools in Account Settings (/settings) and Organization settings.",
            "When an organization is deleted, all private models, internal formulas, member rosters, AI configurations, draft actions, and chats are permanently deleted. Any previously published Register records remain archived with dated revocation notices in accordance with Section 4.",
          ],
        },
        {
          title: "7. Data export",
          paragraphs: [
            "You may export your user profile and organizational affiliation data directly from the Account Settings (/settings) page at any time.",
          ],
        },
        {
          title: "8. Acceptable use and conduct",
          paragraphs: [
            "You agree not to misuse Longecho, attempt unauthorized access to restricted collections or other organizations' private data, or use the platform to violate applicable laws or third-party rights.",
          ],
        },
        {
          title: "9. Disclaimer of warranties and limitation of liability",
          paragraphs: [
            "Longecho is provided 'AS IS' and 'AS AVAILABLE', without warranties of any kind, whether express or implied. To the maximum extent permitted by applicable law, collective-change.org and Longecho maintainers shall not be liable for any indirect, incidental, consequential, or punitive damages arising from your use of the service.",
          ],
        },
      ],
    };
  },
};
</script>

<style scoped>
.policy {
  max-width: 760px;
  margin: 0 auto;
  line-height: 1.6;
}
.policy ul {
  padding-left: 1.2em;
}
.policy li {
  margin-bottom: 0.4em;
}
</style>
