<template>
  <q-page padding>
    <div class="help">
      <q-btn to="/settings" flat no-caps color="primary" icon="chevron_left" :label="$t('Settings')" class="q-mb-sm" />
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

      <p class="text-body2 text-grey-8 q-mt-lg">
        {{ $t("helpMore") }}
        <a :href="feedbackUrl" target="_blank" rel="noopener">{{ $t("Report a problem or suggest an idea") }}</a>
      </p>
    </div>
  </q-page>
</template>

<script>
import { FEEDBACK_URL } from "@/utils/util-links";

export default {
  data() {
    return {
      feedbackUrl: FEEDBACK_URL,
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
