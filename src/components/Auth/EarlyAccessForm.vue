<template>
  <div class="early-access-form">
    <!-- Success State -->
    <div v-if="submitted" class="text-center q-pa-md success-container">
      <q-avatar size="64px" color="blue-1" text-color="primary" icon="mark_email_read" class="q-mb-md" />
      <div class="text-h6 text-weight-bold text-grey-9 q-mb-xs">
        {{ $t("earlyAccessSuccessTitle") }}
      </div>
      <p class="text-body2 text-grey-8 leading-relaxed q-mb-lg">
        {{ $t("earlyAccessSuccessDesc") }}
      </p>
      <div class="row justify-center q-gutter-sm">
        <q-btn
          color="primary"
          unelevated
          no-caps
          icon="login"
          :label="$t('earlyAccessSignIn')"
          @click="$emit('switch-to-login')"
        />
        <q-btn
          flat
          color="grey-8"
          no-caps
          :label="$t('earlyAccessSubmitAnother')"
          @click="resetForm"
        />
      </div>
    </div>

    <!-- Application Form -->
    <q-form v-else @submit.prevent="submit" class="q-gutter-y-sm">
      <div class="text-body2 text-grey-8 q-mb-sm">
        {{ $t("earlyAccessFormSubtitle") }}
      </div>

      <q-input
        outlined
        dense
        v-model="form.name"
        :label="$t('earlyAccessName')"
        name="name"
        maxlength="100"
      />

      <q-input
        outlined
        dense
        v-model="form.email"
        ref="emailInput"
        :rules="[val => isValidEmail(val) || $t('Please enter a valid email address.')]"
        lazy-rules
        :label="$t('earlyAccessEmail') + ' *'"
        type="email"
        autocomplete="email"
        name="email"
      />

      <q-input
        outlined
        dense
        v-model="form.orgName"
        :label="$t('earlyAccessOrgName')"
        name="orgName"
        maxlength="150"
      />

      <q-select
        outlined
        dense
        emit-value
        map-options
        v-model="form.sector"
        :options="sectorOptions"
        :label="$t('earlyAccessSector')"
      />

      <q-input
        outlined
        dense
        type="textarea"
        rows="2"
        v-model="form.note"
        :label="$t('earlyAccessNote')"
        name="note"
        maxlength="1000"
        :hint="$t('earlyAccessNoteHint')"
      />

      <div v-if="errorMessage" class="text-negative text-caption q-mt-xs">
        {{ errorMessage }}
      </div>

      <q-btn
        class="full-width q-mt-md"
        color="primary"
        :label="$t('earlyAccessSubmitBtn')"
        type="submit"
        unelevated
        no-caps
        size="md"
        :loading="loading"
      />

      <div class="text-center q-mt-sm">
        <span class="text-caption text-grey-7">{{ $t("earlyAccessAlreadyInvited") }} </span>
        <q-btn
          flat
          dense
          no-caps
          color="primary"
          class="text-caption text-weight-medium"
          :label="$t('Sign in')"
          @click="$emit('switch-to-login')"
        />
      </div>
    </q-form>
  </div>
</template>

<script>
import { submitEarlyAccessRequest } from "@/utils/earlyAccess";

export default {
  name: "EarlyAccessForm",
  emits: ["switch-to-login"],
  data() {
    return {
      form: {
        name: "",
        email: "",
        orgName: "",
        sector: "ngo",
        note: ""
      },
      loading: false,
      submitted: false,
      errorMessage: ""
    };
  },
  computed: {
    sectorOptions() {
      return [
        { label: this.$t("sectorNgo"), value: "ngo" },
        { label: this.$t("sectorFoundation"), value: "foundation" },
        { label: this.$t("sectorAcademic"), value: "academic" },
        { label: this.$t("sectorGovernment"), value: "government" },
        { label: this.$t("sectorSocialEnterprise"), value: "social_enterprise" },
        { label: this.$t("sectorConsulting"), value: "consulting" },
        { label: this.$t("sectorOther"), value: "other" }
      ];
    }
  },
  methods: {
    isValidEmail(val) {
      if (!val) return false;
      const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      return re.test(String(val).toLowerCase());
    },
    async submit() {
      this.errorMessage = "";
      if (!this.isValidEmail(this.form.email)) {
        this.errorMessage = this.$t("Please enter a valid email address.");
        return;
      }
      if (this.$refs.emailInput && typeof this.$refs.emailInput.validate === "function") {
        this.$refs.emailInput.validate();
        if (this.$refs.emailInput.hasError) return;
      }

      this.loading = true;
      try {
        await submitEarlyAccessRequest({
          ...this.form,
          locale: this.$i18n ? this.$i18n.locale : "en-us"
        });
        this.submitted = true;
      } catch (err) {
        console.error("Failed to submit waitlist application:", err);
        this.errorMessage = err.message || this.$t("earlyAccessErrorGeneral");
      } finally {
        this.loading = false;
      }
    },
    resetForm() {
      this.form = {
        name: "",
        email: "",
        orgName: "",
        sector: "ngo",
        note: ""
      };
      this.submitted = false;
      this.errorMessage = "";
    }
  }
};
</script>

<style scoped>
.success-container {
  max-width: 380px;
  margin: 0 auto;
}
.leading-relaxed {
  line-height: 1.6;
}
</style>
