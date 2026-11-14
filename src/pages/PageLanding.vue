<template>
  <q-page class="landing-page">
    <!-- Hero Section -->
    <section class="landing-hero q-py-xl q-px-md">
      <div class="landing-container text-center">
        <q-badge
          color="blue-1"
          text-color="primary"
          class="q-px-md q-py-xs text-subtitle2 text-weight-medium rounded-borders q-mb-md"
        >
          <q-icon name="hub" class="q-mr-xs" />
          {{ $t("landingHeroBadge") }}
        </q-badge>

        <h1 class="text-h3 text-weight-bolder text-grey-9 q-my-sm hero-title">
          {{ $t("landingHeroTitle") }}
        </h1>

        <p class="text-h6 text-grey-8 text-weight-regular hero-subtitle q-mt-md q-mb-lg">
          {{ $t("landingHeroSubtitle") }}
        </p>

        <div class="row items-center justify-center q-gutter-md q-mb-xl">
          <q-btn
            to="/auth"
            color="primary"
            unelevated
            size="lg"
            no-caps
            icon-right="arrow_forward"
            :label="$t('landingGetStarted')"
            class="cta-btn"
          />
          <q-btn
            to="/auth"
            color="primary"
            flat
            size="lg"
            no-caps
            icon="login"
            :label="$t('landingSignIn')"
          />
          <q-btn
            href="https://github.com/collective-change/mipa"
            target="_blank"
            rel="noopener"
            flat
            color="grey-8"
            size="lg"
            no-caps
            icon="code"
            :label="$t('landingViewSource')"
          />
        </div>

        <!-- Highlight Pills -->
        <div class="row justify-center q-gutter-sm">
          <div class="feature-pill">
            <q-icon name="memory" color="primary" size="18px" class="q-mr-xs" />
            <span>{{ $t("landingFeatureBrowser") }}</span>
          </div>
          <div class="feature-pill">
            <q-icon name="format_quote" color="primary" size="18px" class="q-mr-xs" />
            <span>{{ $t("landingFeatureLanguage") }}</span>
          </div>
          <div class="feature-pill">
            <q-icon name="balance" color="primary" size="18px" class="q-mr-xs" />
            <span>{{ $t("landingFeatureLeverage") }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Why Systemic Leverage Matters -->
    <section class="q-py-xl q-px-md bg-white">
      <div class="landing-container">
        <div class="text-center q-mb-xl">
          <h2 class="text-h4 text-weight-bold text-grey-9 q-my-none">
            {{ $t("landingWhyTitle") }}
          </h2>
          <p class="text-subtitle1 text-grey-7 q-mt-sm q-mb-none">
            {{ $t("landingWhySubtitle") }}
          </p>
        </div>

        <div class="row q-col-gutter-lg justify-center">
          <div class="col-12 col-md-6">
            <q-card flat bordered class="concept-card full-height">
              <q-card-section>
                <div class="row items-center q-mb-md">
                  <q-avatar color="red-1" text-color="negative" icon="history_edu" />
                  <div class="text-h6 text-grey-9 q-ml-md">
                    {{ $t("landingTraditionalPlanning") }}
                  </div>
                </div>
                <p class="text-body1 text-grey-8 leading-relaxed q-mb-none">
                  {{ $t("landingWhyP1") }}
                </p>
              </q-card-section>
            </q-card>
          </div>

          <div class="col-12 col-md-6">
            <q-card flat bordered class="concept-card full-height border-primary">
              <q-card-section>
                <div class="row items-center q-mb-md">
                  <q-avatar color="blue-1" text-color="primary" icon="auto_graph" />
                  <div class="text-h6 text-primary q-ml-md">
                    {{ $t("landingMipaApproach") }}
                  </div>
                </div>
                <p class="text-body1 text-grey-8 leading-relaxed q-mb-none">
                  {{ $t("landingWhyP2") }}
                </p>
              </q-card-section>
            </q-card>
          </div>
        </div>
      </div>
    </section>

    <!-- How Mipa Works: 3 Steps -->
    <section class="q-py-xl q-px-md bg-grey-1" id="how-it-works">
      <div class="landing-container">
        <div class="text-center q-mb-xl">
          <h2 class="text-h4 text-weight-bold text-grey-9 q-my-none">
            {{ $t("landingStepsHeading") }}
          </h2>
        </div>

        <div class="row q-col-gutter-lg">
          <!-- Step 1 -->
          <div class="col-12 col-md-4">
            <q-card flat bordered class="step-card full-height bg-white">
              <q-card-section>
                <div class="step-number text-primary text-weight-bolder">01</div>
                <div class="text-h5 text-weight-bold text-grey-9 q-mt-sm">
                  {{ $t("landingStep1Title") }}
                </div>
                <div class="text-caption text-primary text-weight-medium q-mb-md">
                  {{ $t("landingStep1Subtitle") }}
                </div>
                <p class="text-body2 text-grey-8 leading-relaxed q-mb-none">
                  {{ $t("landingStep1Desc") }}
                </p>
              </q-card-section>
            </q-card>
          </div>

          <!-- Step 2 -->
          <div class="col-12 col-md-4">
            <q-card flat bordered class="step-card full-height bg-white">
              <q-card-section>
                <div class="step-number text-primary text-weight-bolder">02</div>
                <div class="text-h5 text-weight-bold text-grey-9 q-mt-sm">
                  {{ $t("landingStep2Title") }}
                </div>
                <div class="text-caption text-primary text-weight-medium q-mb-md">
                  {{ $t("landingStep2Subtitle") }}
                </div>
                <p class="text-body2 text-grey-8 leading-relaxed q-mb-none">
                  {{ $t("landingStep2Desc") }}
                </p>
              </q-card-section>
            </q-card>
          </div>

          <!-- Step 3 -->
          <div class="col-12 col-md-4">
            <q-card flat bordered class="step-card full-height bg-white">
              <q-card-section>
                <div class="step-number text-primary text-weight-bolder">03</div>
                <div class="text-h5 text-weight-bold text-grey-9 q-mt-sm">
                  {{ $t("landingStep3Title") }}
                </div>
                <div class="text-caption text-primary text-weight-medium q-mb-md">
                  {{ $t("landingStep3Subtitle") }}
                </div>
                <p class="text-body2 text-grey-8 leading-relaxed q-mb-none">
                  {{ $t("landingStep3Desc") }}
                </p>
              </q-card-section>
            </q-card>
          </div>
        </div>
      </div>
    </section>

    <!-- Trust, Privacy & Independence -->
    <section class="q-py-xl q-px-md bg-white">
      <div class="landing-container">
        <div class="text-center q-mb-xl">
          <h2 class="text-h4 text-weight-bold text-grey-9 q-my-none">
            {{ $t("landingTrustHeading") }}
          </h2>
        </div>

        <div class="row q-col-gutter-lg">
          <div class="col-12 col-md-4">
            <div class="trust-item q-pa-md">
              <q-avatar color="blue-1" text-color="primary" icon="laptop_chromebook" class="q-mb-md" />
              <div class="text-h6 text-grey-9 text-weight-bold q-mb-xs">
                {{ $t("landingTrustP1Title") }}
              </div>
              <p class="text-body2 text-grey-8 leading-relaxed">
                {{ $t("landingTrustP1Desc") }}
              </p>
            </div>
          </div>

          <div class="col-12 col-md-4">
            <div class="trust-item q-pa-md">
              <q-avatar color="green-1" text-color="positive" icon="vpn_key" class="q-mb-md" />
              <div class="text-h6 text-grey-9 text-weight-bold q-mb-xs">
                {{ $t("landingTrustP2Title") }}
              </div>
              <p class="text-body2 text-grey-8 leading-relaxed">
                {{ $t("landingTrustP2Desc") }}
              </p>
            </div>
          </div>

          <div class="col-12 col-md-4">
            <div class="trust-item q-pa-md">
              <q-avatar color="purple-1" text-color="accent" icon="volunteer_activism" class="q-mb-md" />
              <div class="text-h6 text-grey-9 text-weight-bold q-mb-xs">
                {{ $t("landingTrustP3Title") }}
              </div>
              <p class="text-body2 text-grey-8 leading-relaxed">
                {{ $t("landingTrustP3Desc") }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Call To Action Banner -->
    <section class="q-py-xl q-px-md cta-section">
      <div class="landing-container text-center">
        <h2 class="text-h4 text-weight-bolder text-grey-9 q-my-none">
          {{ $t("landingCtaTitle") }}
        </h2>
        <p class="text-subtitle1 text-grey-8 q-mt-md q-mb-lg">
          {{ $t("landingCtaSubtitle") }}
        </p>
        <div class="row justify-center q-gutter-md">
          <q-btn
            to="/auth"
            color="primary"
            unelevated
            size="lg"
            no-caps
            icon-right="arrow_forward"
            :label="$t('landingCtaBtn')"
            class="cta-btn"
          />
          <q-btn
            href="https://github.com/collective-change/mipa"
            target="_blank"
            rel="noopener"
            flat
            color="grey-9"
            size="lg"
            no-caps
            icon="code"
            :label="$t('landingViewSource')"
          />
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="landing-footer q-py-lg q-px-md bg-grey-2 text-grey-8">
      <div class="landing-container">
        <div class="row items-center justify-between q-col-gutter-md">
          <div class="col-12 col-md-6 text-center text-md-left">
            <span class="text-weight-bold text-primary">mipa</span>
            <span class="q-mx-xs">·</span>
            <span class="text-caption text-grey-7">{{ $t("landingFooterMission") }}</span>
          </div>
          <div class="col-12 col-md-6 text-center text-md-right">
            <router-link to="/about" class="footer-link q-mx-sm">{{ $t("About") }}</router-link>
            <router-link to="/privacy" class="footer-link q-mx-sm">{{ $t("Privacy") }}</router-link>
            <a
              href="https://github.com/collective-change/mipa"
              target="_blank"
              rel="noopener"
              class="footer-link q-mx-sm"
            >GitHub</a>
          </div>
        </div>
      </div>
    </footer>
  </q-page>
</template>

<script>
export default {
  name: "PageLanding"
};
</script>

<style scoped>
.landing-page {
  background-color: #ffffff;
}

.landing-container {
  max-width: 1080px;
  margin: 0 auto;
}

.landing-hero {
  background: linear-gradient(180deg, #f0f7fc 0%, #ffffff 100%);
}

.hero-title {
  line-height: 1.2;
  letter-spacing: -0.5px;
}

.hero-subtitle {
  max-width: 760px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.5;
}

.cta-btn {
  padding-left: 28px;
  padding-right: 28px;
  font-weight: 600;
}

.feature-pill {
  display: inline-flex;
  align-items: center;
  background-color: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 20px;
  padding: 6px 14px;
  font-size: 13px;
  color: #424242;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.concept-card {
  border-radius: 12px;
  padding: 8px;
}

.border-primary {
  border-color: #4682b4;
  background-color: #fafcfe;
}

.step-card {
  border-radius: 12px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.step-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(70, 130, 180, 0.12);
}

.step-number {
  font-size: 32px;
  line-height: 1;
}

.trust-item {
  text-align: left;
}

.cta-section {
  background: linear-gradient(180deg, #ffffff 0%, #f0f7fc 100%);
  border-top: 1px solid #eef2f6;
}

.leading-relaxed {
  line-height: 1.6;
}

.footer-link {
  color: #616161;
  text-decoration: none;
  font-size: 13px;
}

.footer-link:hover {
  color: #4682b4;
  text-decoration: underline;
}
</style>
