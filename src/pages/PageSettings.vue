<template>
  <q-page padding>
    <div class="settings">
      <div class="text-h5 q-mb-md">{{ $t("Settings") }}</div>
      <q-list bordered separator class="rounded-borders">
        <q-item to="/settings/help" clickable v-ripple>
          <q-item-section avatar><q-icon name="help" color="primary" /></q-item-section>
          <q-item-section>{{ $t("Help") }}</q-item-section>
          <q-item-section side><q-icon name="chevron_right" /></q-item-section>
        </q-item>
        <q-item :href="websiteUrl" target="_blank" clickable v-ripple>
          <q-item-section avatar><q-icon name="public" color="primary" /></q-item-section>
          <q-item-section>{{ $t("Visit our website") }}</q-item-section>
          <q-item-section side><q-icon name="open_in_new" /></q-item-section>
        </q-item>
        <q-item :href="feedbackUrl" target="_blank" clickable v-ripple>
          <q-item-section avatar><q-icon name="feedback" color="primary" /></q-item-section>
          <q-item-section>{{ $t("Report a problem or suggest an idea") }}</q-item-section>
          <q-item-section side><q-icon name="open_in_new" /></q-item-section>
        </q-item>
      </q-list>
    </div>
  </q-page>
</template>

<script>
import { WEBSITE_URL, FEEDBACK_URL } from "@/utils/util-links";

export default {
  data() {
    return { websiteUrl: WEBSITE_URL, feedbackUrl: FEEDBACK_URL };
  }
};
</script>

<style scoped>
.settings {
  max-width: 640px;
  margin: 0 auto;
}
</style>
