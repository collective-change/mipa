<template>
  <q-page padding>
    <div class="help">
      <q-btn
        :to="loggedIn ? '/settings' : '/auth'"
        flat
        no-caps
        color="primary"
        icon="chevron_left"
        :label="loggedIn ? $t('Settings') : $t('Login')"
        class="q-mb-sm"
      />
      <div class="text-h5">{{ $t("helpTitle") }}</div>
      <p class="text-body1 text-grey-8 q-mt-sm">{{ $t("helpIntro") }}</p>

      <q-list bordered separator class="rounded-borders q-mt-md">
        <q-expansion-item
          v-for="(section, index) in sections"
          :key="section"
          :default-opened="index == 0"
          :icon="icons[index]"
          :label="$t(`help${section}Title`)"
          header-class="text-subtitle1"
        >
          <q-card>
            <q-card-section class="text-body2 help-text">
              {{ $t(`help${section}Text`) }}
            </q-card-section>
          </q-card>
        </q-expansion-item>
      </q-list>

      <div class="text-h6 q-mt-xl">{{ $t("Glossary") }}</div>
      <q-list bordered separator class="rounded-borders q-mt-sm">
        <q-item v-for="term in glossary" :key="term">
          <q-item-section>
            <q-item-label class="text-weight-medium">{{ $t(`glossary.${term}.term`) }}</q-item-label>
            <q-item-label class="text-body2 text-grey-9">{{ $t(`glossary.${term}.text`) }}</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>

      <!-- Contact Us & Priority Support Intake (MIPA-36) -->
      <div id="contact" class="text-h6 q-mt-xl">{{ $t("supportIntakeTitle") }}</div>
      <p class="text-body2 text-grey-8 q-mt-xs">
        {{ $t("supportResponseNotice") }}
      </p>

      <!-- Stated Response Expectations Table -->
      <q-card flat bordered class="rounded-borders q-my-md">
        <q-card-section class="q-pb-none">
          <div class="text-subtitle2 text-weight-medium text-grey-9">
            {{ $t("supportResponseExpectations") }}
          </div>
        </q-card-section>
        <q-card-section>
          <div class="row q-col-gutter-sm text-caption">
            <div class="col-12 col-sm-6">
              <div class="q-pa-xs bg-grey-1 rounded-borders">
                <span class="text-weight-bold">Community ($0):</span>
                <span class="text-grey-8 q-ml-xs">GitHub Issues (Community SLA)</span>
              </div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="q-pa-xs bg-blue-1 rounded-borders">
                <span class="text-weight-bold text-primary">Starter ($29/mo):</span>
                <span class="text-grey-8 q-ml-xs">48 business hours</span>
              </div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="q-pa-xs bg-blue-1 rounded-borders">
                <span class="text-weight-bold text-primary">Growth ($79/mo):</span>
                <span class="text-grey-8 q-ml-xs">24 business hours</span>
              </div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="q-pa-xs bg-indigo-1 rounded-borders">
                <span class="text-weight-bold text-indigo">Pro ($199/mo):</span>
                <span class="text-grey-8 q-ml-xs">12 business hours (priority)</span>
              </div>
            </div>
            <div class="col-12">
              <div class="q-pa-xs bg-purple-1 rounded-borders">
                <span class="text-weight-bold text-purple">Enterprise:</span>
                <span class="text-grey-8 q-ml-xs">4 business hours mission-critical response</span>
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Support Intake Form -->
      <q-card flat bordered class="rounded-borders q-mb-lg">
        <q-card-section>
          <div class="text-subtitle1 text-weight-medium">{{ $t("Contact us") }}</div>
          <div v-if="!loggedIn" class="text-body2 text-grey-7 q-mt-xs">
            {{ $t("signInToSubmitTicket") }}
            <a :href="feedbackUrl" target="_blank" rel="noopener" class="text-primary q-ml-xs">{{ $t("Report a problem or suggest an idea") }}</a>
          </div>

          <form v-else class="q-gutter-md q-mt-xs" @submit.prevent="onSubmitTicket">
            <q-input
              v-model="ticketForm.subject"
              dense
              outlined
              :label="$t('ticketSubject')"
              :rules="[val => !!val.trim() || $t('Required')]"
            />

            <q-select
              v-model="ticketForm.category"
              dense
              outlined
              emit-value
              map-options
              :options="categoryOptions"
              :label="$t('ticketCategory')"
            />

            <q-input
              v-model="ticketForm.message"
              type="textarea"
              outlined
              dense
              rows="4"
              :label="$t('ticketMessage')"
              :hint="$t('ticketMessageHint')"
              :rules="[val => (val && val.trim().length >= 10) || $t('ticketMessageHint')]"
            />

            <div class="row items-center justify-between q-pt-sm">
              <a :href="feedbackUrl" target="_blank" rel="noopener" class="text-caption text-grey-7">
                {{ $t("Report a problem or suggest an idea") }} (GitHub)
              </a>
              <q-btn
                type="submit"
                color="primary"
                unelevated
                no-caps
                icon="send"
                :label="$t('sendTicket')"
                :loading="submitting"
              />
            </div>
          </form>

          <!-- Ticket confirmation banner -->
          <q-banner v-if="ticketResult" rounded class="bg-positive text-white q-mt-md">
            <template v-slot:avatar>
              <q-icon name="check_circle" color="white" />
            </template>
            <div class="text-weight-medium">Ticket {{ ticketResult.ticketId }} Filed</div>
            <div class="text-caption">
              Customer Tier: {{ ticketResult.tier.toUpperCase() }} · Stated Response: {{ ticketResult.responseExpectation }}
            </div>
          </q-banner>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script>
import { mapState } from "vuex";
import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "@/boot/firebase";
import { FEEDBACK_URL } from "@/utils/util-links";

export default {
  name: "PageHelp",
  computed: {
    ...mapState("auth", ["loggedIn", "user", "userId"]),
    ...mapState("orgs", ["currentOrg"]),
    categoryOptions() {
      return [
        { value: "defect", label: "Defect / Bug" },
        { value: "billing", label: "Billing & Subscriptions" },
        { value: "modeling", label: "Model & Calculations" },
        { value: "feature_request", label: "Feature Suggestion" },
        { value: "general", label: "General Support" }
      ];
    }
  },
  data() {
    return {
      feedbackUrl: FEEDBACK_URL,
      submitting: false,
      ticketResult: null,
      ticketForm: {
        subject: "",
        category: "defect",
        message: ""
      },
      sections: ["Org", "Model", "Actions", "Achieve"],
      icons: ["groups", "share", "wb_incandescent", "checklist"],
      glossary: [
        "factor",
        "shortName",
        "formula",
        "unit",
        "link",
        "delay",
        "step",
        "keyFactors",
        "action",
        "impact",
        "netBenefit",
        "leverage"
      ]
    };
  },
  methods: {
    async onSubmitTicket() {
      if (!this.ticketForm.subject.trim() || this.ticketForm.message.trim().length < 10) {
        return;
      }
      this.submitting = true;
      try {
        const fn = httpsCallable(firebaseFunctions, "submitSupportTicket");
        const res = await fn({
          subject: this.ticketForm.subject.trim(),
          category: this.ticketForm.category,
          message: this.ticketForm.message.trim(),
          orgId: (this.currentOrg && this.currentOrg.id) || ""
        });
        this.ticketResult = res.data;
        this.$q.notify({
          type: "positive",
          message: this.$t("ticketSubmittedToast", {
            ticketId: res.data.ticketId,
            expectation: res.data.responseExpectation
          })
        });
        this.ticketForm.subject = "";
        this.ticketForm.message = "";
      } catch (err) {
        console.error("Support ticket submission failed:", err);
        this.$q.notify({
          type: "negative",
          message: err.message || this.$t("Something went wrong")
        });
      } finally {
        this.submitting = false;
      }
    }
  }
};
</script>

<style scoped>
.help {
  max-width: 760px;
  margin: 0 auto;
}
.help-text {
  white-space: pre-line;
}
</style>
