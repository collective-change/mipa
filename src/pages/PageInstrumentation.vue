<template>
  <q-page padding>
    <article class="policy">
      <div class="text-h4 q-mb-xs">{{ $t("instrumentationNoticeTitle") || "Instrumentation & Telemetry Notice" }}</div>
      <div class="text-caption text-grey-7 q-mb-md">
        First-party, cookieless measurement — last updated 26 November 2026
      </div>

      <p class="text-subtitle1 text-grey-9 q-mt-sm">
        We want to understand whether features in the application help teams make better systemic decisions. That is a real need, but it is never an excuse to track or profile individuals. This notice explains exactly what our telemetry system measures, what it verifiably discards, and how the line is maintained in code.
      </p>

      <section class="q-my-lg">
        <h2 class="text-h6 q-mb-sm text-weight-bold">The rule we hold to</h2>
        <p>
          <strong>Measure the app, never the person.</strong> If an improvement requires identifying, tracking, or profiling an individual, we do not collect that information.
        </p>
      </section>

      <section class="q-my-lg">
        <h2 class="text-h6 q-mb-sm text-weight-bold">What is collected</h2>
        <ul class="q-pl-md">
          <li class="q-mb-xs">
            <strong>Which page was opened:</strong> The path only (e.g. <code>/orgs</code>, <code>/auth</code>) — never query parameters, auth tokens, or URL fragments.
          </li>
          <li class="q-mb-xs">
            <strong>The referring hostname:</strong> The site's domain name (e.g. <code>google.com</code>), never the full referring URL or search terms.
          </li>
          <li class="q-mb-xs">
            <strong>The viewport width bucket:</strong> Rounded to the nearest 320 px (e.g. 320, 640, 960, 1280, 1600) to understand display responsiveness without device fingerprinting.
          </li>
          <li class="q-mb-xs">
            <strong>Same-session return visit:</strong> A simple boolean flag held in <code>sessionStorage</code>, which is deleted when the browser tab closes and contains no identifier.
          </li>
          <li class="q-mb-xs">
            <strong>Product workflow events:</strong>
            <ul>
              <li>Account registration started vs. completed (<code>signup_started</code>, <code>signup_completed</code>).</li>
              <li>A strategic goal or action created (<code>goal_created</code>).</li>
              <li>First view of action leverage rankings in a session (<code>ranking_viewed</code>).</li>
              <li>The ranking-explanation modal opened (<code>ranking_explained</code>).</li>
              <li>A decision register record or cryptographic snapshot published (<code>record_published</code>).</li>
              <li>Abandon points in the first-run onboarding checklist (<code>first_run_abandon</code>).</li>
            </ul>
          </li>
        </ul>
      </section>

      <section class="q-my-lg">
        <h2 class="text-h6 q-mb-sm text-weight-bold">What is not collected, at any point</h2>
        <ul class="q-pl-md">
          <li class="q-mb-xs">
            <strong>No cookies:</strong> None are set or read. There is no cookie banner because there are no tracking cookies.
          </li>
          <li class="q-mb-xs">
            <strong>No identifiers of any kind:</strong> No persistent user ID, device fingerprint, machine signature, or canvas hash. Nothing survives the browser tab.
          </li>
          <li class="q-mb-xs">
            <strong>No IP addresses retained:</strong> The receiving collector endpoint (<code>/api/collect</code>) is engineered and automated-tested to discard IP addresses upon receipt rather than logging or storing them.
          </li>
          <li class="q-mb-xs">
            <strong>Nothing from a third party:</strong> No third-party analytics scripts, no advertising pixels, no external tag managers, and no external tracking beacons.
          </li>
          <li class="q-mb-xs">
            <strong>No confidential model content:</strong> Factor formulas, private organization names, internal chat text, and financial numbers are never included in telemetry payloads.
          </li>
        </ul>
      </section>

      <section class="q-my-lg">
        <h2 class="text-h6 q-mb-sm text-weight-bold">Default state: send nothing until enabled</h2>
        <p>
          The client measurement script ships with its destination endpoint unset by default. An unset endpoint immediately returns and transmits zero network packets. Measurement is active only when an endpoint is deliberately configured.
        </p>
      </section>

      <section class="q-my-lg">
        <h2 class="text-h6 q-mb-sm text-weight-bold">How to refuse (DNT & GPC honoured)</h2>
        <p>
          <strong>Do Not Track (DNT)</strong> and <strong>Global Privacy Control (GPC)</strong> signals sent by your browser are actively honoured. If either signal is detected, the telemetry module terminates immediately without transmitting any data.
        </p>
      </section>

      <section class="q-my-lg">
        <h2 class="text-h6 q-mb-sm text-weight-bold">Relationship to Privacy Policy</h2>
        <p>
          This notice complements our general <router-link to="/privacy">Privacy Policy</router-link>, detailing our technical commitments to non-identifying product telemetry.
        </p>
      </section>
    </article>
  </q-page>
</template>

<script>
export default {
  name: "PageInstrumentation"
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
