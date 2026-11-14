<template>
  <q-page padding>
    <article class="policy">
      <div class="text-h4 q-mb-xs">Privacy policy</div>
      <div class="text-caption text-grey-7">
        Draft, last updated 13 November 2026
      </div>
      <q-banner v-if="$i18n.locale != 'en-us'" class="bg-grey-2 q-my-md" rounded>
        {{ $t("privacyEnglishOnly") }}
      </q-banner>

      <p class="q-mt-md">
        mipa is a free, open-source app from the collective-change.org project
        that helps organizations model how they work, compare possible actions
        by their benefits and costs to the organization and the world, and
        track who is doing what. This policy explains what information mipa
        collects, why, who can see it, and the choices you have. Questions
        are welcome on
        <a :href="issuesUrl" target="_blank" rel="noopener">mipa's GitHub issues</a>
        (see Contact below).
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
        Issues are public, so don't include personal information in them.
      </p>
      <p>
        For requests about your own data (a copy, a correction or deleting your
        account), or to report a privacy or security problem privately, email
        <a :href="`mailto:${contact}`">{{ contact }}</a>.
      </p>
    </article>
  </q-page>
</template>

<script>
import { ISSUES_URL } from "@/utils/util-links";

// Keep this in step with what the app actually does. If you add a service
// that receives personal data, or a new kind of data, update this page.
const CONTACT = "tedchwang@gmail.com";

export default {
  data() {
    return {
      contact: CONTACT,
      issuesUrl: ISSUES_URL,
      sections: [
        {
          title: "Information we collect",
          items: [
            "Account: your email address and password. Passwords are handled by Firebase Authentication and are never visible to us.",
            "Profile: a display name (taken from the part of your email before the @), when you registered, and whether your email is verified.",
            "Content you create: organizations, goals, models, nodes and formulas, actions and their estimates, notes, assignments of responsible and accountable people, chat messages, and documents you give to AI features.",
            "Technical information needed to run the service, such as your IP address and browser type, which our hosting providers receive when your browser connects to them.",
          ],
          paragraphs: [
            "mipa does not use advertising, analytics or tracking cookies, and does not sell or rent personal information.",
          ],
        },
        {
          title: "How we use it",
          items: [
            "To provide the app: sign you in, store your work, calculate models, and show your organization's work to its members.",
            "To send emails you ask for, such as a password reset.",
            "To keep the service secure and working, and to fix problems.",
          ],
        },
        {
          title: "Who can see your information",
          items: [
            "Members of an organization can see its models, actions and open chats, and each other's display names and email addresses. Chats marked for members only are visible only to the people added to them.",
            "Other mipa users who are not in your organization cannot see your profile or your organization's content.",
            "People who maintain mipa can access the stored data when needed to operate the service, fix problems or respond to your requests.",
            "We disclose information to authorities only when required by law.",
          ],
        },
        {
          title: "Service providers",
          paragraphs: [
            "mipa runs on services from other companies, which process data on our behalf:",
          ],
          items: [
            "Google Firebase (Authentication, Cloud Firestore, Hosting and Cloud Functions), which stores and serves the app and your data.",
            "Google Charts, loaded from gstatic.com to draw some charts; Google receives your IP address when a chart loads.",
            "Fixer (fixer.io) supplies currency exchange rates to our server. No personal information is sent to it.",
            "The AI provider your organization has connected with its own account, for the AI features described below. mipa does not provide AI itself.",
          ],
        },
        {
          title: "AI features",
          paragraphs: [
            "mipa's AI features (some are not yet available) help you draft and review models, suggest formulas, estimates and actions, explain and compare results, look for assumptions that would change a decision, write summaries and decision briefs, translate, and summarize progress.",
            "To do this, a feature sends the AI provider only what it needs from the organization you are working in. Depending on the feature, that can include the organization's name and goal, its models and their results, actions and their estimates, notes, chat messages, progress updates, and documents you choose to give it. Members' names are included only when a feature needs them, for example a progress summary that says who is responsible for what. Email addresses and passwords are never sent.",
            "Who receives it: the AI provider your organization has connected with its own account; the organization's own agreement with that provider applies. AI features work only when an organization has connected a provider. Providers use the data to produce the response. Whether a provider keeps the data or uses it to train its models depends on that provider's terms, which we do not control; each organization should choose a provider whose terms are compatible with its own policies.",
            "Some features look up published information on the web, such as typical costs or emission factors. Those searches are based on the subject of your model, not on personal information.",
          ],
          items: [
            "AI features are off until an organization admin connects a provider, and disconnecting it turns them off again.",
            "Features that use chat messages or notes tell you so before you use them for the first time.",
            "AI suggestions are shown to you for review; nothing in your organization changes until a person accepts it. Values the AI estimated are marked as estimates, with their reasoning or source.",
            "AI can be wrong. Treat its output as a starting point for your own judgement.",
          ],
        },
        {
          title: "Information stored on your device",
          items: [
            "A copy of the app, so it loads quickly and works offline.",
            "A local copy of data you have opened, and recent calculation results, so the app can work offline and avoid recalculating.",
            "Your language choice (a cookie) and whether you are signed in.",
          ],
          paragraphs: [
            "These are needed for the app to work. You can remove them by clearing this site's data in your browser.",
          ],
        },
        {
          title: "How long we keep information",
          paragraphs: [
            "We keep your account and content while your account exists. Deleting an organization in the app removes it from mipa. To delete your account and everything connected to it, email us; we will do so within 30 days, except where the law requires us to keep something. Backups may keep copies for a limited time afterwards.",
          ],
        },
        {
          title: "Your choices and rights",
          paragraphs: [
            "You can see and change most of your information in the app. You can also ask us to give you a copy of your information, correct it, delete it, or stop using it for a particular purpose. Depending on where you live, laws such as Taiwan's Personal Data Protection Act or the EU General Data Protection Regulation give you these rights, and you may complain to your data protection authority. Email us to make a request; we will reply within 30 days.",
          ],
        },
        {
          title: "Security",
          paragraphs: [
            "Connections to mipa are encrypted, and access rules limit who can read each organization's data. No system is completely secure; if we learn of a breach that affects you, we will tell you.",
          ],
        },
        {
          title: "Children",
          paragraphs: [
            "mipa is not meant for children under 13. School projects using mipa should be set up by a teacher or another adult.",
          ],
        },
        {
          title: "Changes to this policy",
          paragraphs: [
            "We will post changes on this page with a new date. If a change affects how your information is used in an important way, we will tell you in the app or by email before it takes effect.",
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
