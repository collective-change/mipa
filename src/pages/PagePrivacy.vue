<template>
  <q-page padding>
    <article class="policy">
      <div class="text-h4 q-mb-xs">{{ $t("privacyPolicyTitle") }}</div>
      <div class="text-caption text-grey-7">
        Draft, last updated 19 November 2026
      </div>
      <q-banner v-if="$i18n.locale != 'en-us'" class="bg-grey-2 q-my-md" rounded>
        {{ $t("privacyEnglishOnly") }}
      </q-banner>

      <p class="q-mt-md">
        mipa is a strategic coordination web application from the collective-change.org
        project that helps organizations model how they work, compare possible actions by
        their relief per unit of cost to the organization and the world (效應比 / leverage),
        and track strategic alignment. This policy explains what information mipa collects,
        why, how it is processed and protected, who can see it, and your rights and choices.
        Questions are welcome on
        <a :href="issuesUrl" target="_blank" rel="noopener">mipa's GitHub issues</a>.
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
        For questions about this policy, problems or suggestions, please open
        an issue on
        <a :href="issuesUrl" target="_blank" rel="noopener">mipa's GitHub issues</a>.
        Issues are public, so don't include personal or confidential organization information in them.
      </p>
      <p>
        To report a security or privacy vulnerability privately, please submit a report via
        <a :href="securityAdvisoryUrl" target="_blank" rel="noopener">GitHub Private Vulnerability Reporting</a>.
      </p>
    </article>
  </q-page>
</template>

<script>
import { ISSUES_URL, SECURITY_ADVISORY_URL } from "@/utils/util-links";

// Keep this in step with what the app actually does. If you add a service
// that receives personal data, or a new kind of data, update this page.
export default {
  name: "PagePrivacy",
  data() {
    return {
      issuesUrl: ISSUES_URL,
      securityAdvisoryUrl: SECURITY_ADVISORY_URL,
      sections: [
        {
          title: "Information we collect",
          items: [
            "Account: your email address and password. Passwords are authentication tokens managed by Google Firebase Authentication and are never visible to or stored by us in plain text.",
            "Profile: a display name, account creation date, and email verification status.",
            "Organization financial and operational data: organization names, operating currencies, discount rates, budget ceilings, implementation costs, hourly effort costs, ongoing expenditure estimates, and net present value calculations.",
            "Content you create: system dynamics models, factor graphs, mathematical formulas, strategic actions, uncertainty distributions, notes, assignments of responsible/accountable individuals, internal chats, and documents uploaded to assist AI drafting.",
            "Technical telemetry: IP address, browser user-agent, and connection diagnostics received by our hosting infrastructure (Google Firebase) during network requests.",
          ],
          paragraphs: [
            "mipa does not use advertising, marketing tracking cookies, or commercial third-party trackers, and does not sell or rent personal information.",
          ],
        },
        {
          title: "How we use it",
          items: [
            "To provide and operate the service: authenticate your session, save your models and actions, run simulations on your device, and synchronize changes among members of your organization.",
            "To send operational notifications you configure or request, such as invitation links, password resets, and weekly strategic digests.",
            "To maintain security, perform scheduled backups, prevent abuse, and diagnose platform issues.",
          ],
        },
        {
          title: "Who can see your information",
          items: [
            "Organization Members: Authenticated members of your organization can see its private models, financial formulas, action estimates, and open chats. Chats marked for specific members are restricted to those designated participants.",
            "Other Organizations: Other mipa users cannot view your organization's private models, private actions, or member roster.",
            "Public Dossiers and the Register: When an authorized administrator chooses to publish a model or dossier to the public Register (/m/:modelId), that specific dossier and its ranked actions become publicly accessible to anyone with the link.",
            "Service Maintainers: System maintainers can access stored data only when strictly necessary to operate the service, debug reported errors, or comply with legal requirements.",
            "Legal Compliance: We disclose information to public authorities only when compelled by valid legal process.",
          ],
        },
        {
          title: "Service providers and Merchant of Record",
          paragraphs: [
            "mipa relies on trusted service providers to deliver infrastructure and commercial billing:",
          ],
          items: [
            "Google Firebase (Authentication, Cloud Firestore, Cloud Storage, Hosting, and Cloud Functions): Hosts the application, database, and scheduled disaster-recovery backups.",
            "Lemon Squeezy: Operates as our Merchant of Record for subscription management, card payment processing, invoicing, and tax remittance. Payment details (card numbers) are collected directly by Lemon Squeezy and never touch mipa servers.",
            "Fixer (fixer.io): Provides foreign exchange rates for multi-currency factor conversions. No personal data is transmitted.",
            "Google Charts (gstatic.com): Delivers charting libraries; Google receives standard network request telemetry (IP address) when charts load.",
          ],
        },
        {
          title: "AI features and architectural data flow",
          paragraphs: [
            "mipa provides optional AI features to assist in drafting models, suggesting factors, formulating actions, and summarizing strategic progress.",
            "Architectural disclosure (A-4 decision): API keys provided by your organization are encrypted at rest using AES-256-GCM and stored in secure Firestore documents accessible only to authorized Cloud Functions. Cloud Firestore enforces role-based security rules and TLS transit encryption rather than client-side zero-knowledge encryption.",
            "When an AI drafting feature is invoked, relevant model context — including factor names, mathematical relationships, estimated costs, and action summaries — is sent over TLS to the AI provider connected by your organization (e.g., Anthropic or OpenAI) or via our designated starter allowance. Member email addresses and passwords are never transmitted.",
            "Data handling by AI providers: The handling and retention of prompt data is governed by your organization's agreement with the connected provider. AI-generated suggestions are always presented for human review and require explicit confirmation before modifying your model.",
          ],
        },
        {
          title: "Calculations run on your device",
          paragraphs: [
            "All system dynamics simulations, Monte Carlo uncertainty bounds, and action leverage calculations (效應比) run entirely in your local browser Web Worker (Math.js). Numerical simulations and raw formula evaluations do not occur on the server.",
          ],
        },
        {
          title: "Data retention, deletion, and 'Revocation ≠ Erasure'",
          paragraphs: [
            "We maintain a clear distinction between private working data and published Register records:",
            "Private working data: Private models, factor formulas, internal actions, chats, AI keys, and user profile data remain active while your account and organization exist. You can delete individual items, entire organizations, or your personal account at any time via the self-service deletion controls in the app. Upon deletion, private records and credentials are permanently purged from active Firestore databases and expire from backup archives per our retention schedule.",
            "Published Register records ('Revocation ≠ Erasure'): When an organization publishes a decision dossier to the public Register, that publication constitutes a citable historical record relied upon by counterparties and funders. In accordance with governance integrity, revoking or withdrawing a published dossier marks it with a dated revocation notice (tombstone) rather than erasing its historical existence. Unpublished drafts and internal models are never subject to this requirement and are fully erasable.",
          ],
        },
        {
          title: "Your choices, rights, and data export",
          paragraphs: [
            "You have full control over your personal and organization data:",
            "Self-Service Deletion: You can delete your personal account or any organization where you are an administrator directly from Account Settings (/settings) or the Organizations view.",
            "Data Export: You can export your user profile and organization membership data as a portable JSON file at any time from Account Settings (/settings).",
            "Statutory Rights: Depending on your jurisdiction (such as Taiwan's Personal Data Protection Act or the EU GDPR), you have the right to access, rectify, delete, or restrict the processing of your personal data. You may exercise these rights through in-app tools or by contacting us.",
          ],
        },
        {
          title: "Security and disaster recovery",
          paragraphs: [
            "All data in transit is protected by TLS encryption. Firestore data is guarded by declarative security rules ensuring that only authenticated organization members can access private models.",
            "Scheduled backups are captured daily to regional Cloud Storage buckets and subjected to automated restore drills with 100% data fidelity verification to guarantee register permanence and business continuity.",
          ],
        },
        {
          title: "Changes to this policy",
          paragraphs: [
            "We will post any updates to this policy on this page with an updated date stamp. If changes materially alter how your personal data is handled, we will provide advance notice through the application.",
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
