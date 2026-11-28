<template>
  <q-page padding>
    <div class="settings">
      <div class="text-h5 q-mb-md">{{ $t("Settings") }}</div>

      <!-- General & Legal Documentation -->
      <q-list bordered separator class="rounded-borders q-mb-lg">
        <q-item to="/settings/help" clickable v-ripple>
          <q-item-section avatar><q-icon name="help" color="primary" /></q-item-section>
          <q-item-section>{{ $t("Help") }}</q-item-section>
          <q-item-section side><q-icon name="chevron_right" /></q-item-section>
        </q-item>
        <q-item to="/terms" clickable v-ripple>
          <q-item-section avatar><q-icon name="description" color="primary" /></q-item-section>
          <q-item-section>{{ $t("Terms of Service") }}</q-item-section>
          <q-item-section side><q-icon name="chevron_right" /></q-item-section>
        </q-item>
        <q-item to="/privacy" clickable v-ripple>
          <q-item-section avatar><q-icon name="privacy_tip" color="primary" /></q-item-section>
          <q-item-section>{{ $t("Privacy Policy") }}</q-item-section>
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

      <!-- Account & Data Management -->
      <q-card flat bordered class="rounded-borders">
        <q-card-section>
          <div class="text-subtitle1 text-weight-medium">{{ $t("accountDataManagement") }}</div>
          <div v-if="userEmail" class="text-caption text-grey-8 q-mt-xs">
            {{ userEmail }}
          </div>
        </q-card-section>

        <q-separator />

        <!-- Data Export -->
        <q-item clickable v-ripple @click="exportUserData">
          <q-item-section avatar>
            <q-icon name="download" color="primary" />
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ $t("exportMyData") }}</q-item-label>
            <q-item-label caption>{{ $t("exportMyDataDesc") }}</q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-btn flat round dense icon="file_download" color="primary" @click.stop="exportUserData" />
          </q-item-section>
        </q-item>

        <q-separator />

        <!-- Account Deletion -->
        <q-item clickable v-ripple class="text-negative" @click="confirmDeleteAccount">
          <q-item-section avatar>
            <q-icon name="delete_forever" color="negative" />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-weight-medium">{{ $t("deleteAccountBtn") }}</q-item-label>
            <q-item-label caption class="text-grey-7">
              {{ $t("deleteAccountDesc") }}
            </q-item-label>
          </q-item-section>
        </q-item>
      </q-card>
    </div>
  </q-page>
</template>

<script>
import { pickState, pickActions } from "@/store/pinia-helpers";
import { useAuthStore } from "@/store/store-auth";
import { useOrgsStore } from "@/store/store-orgs";
import { WEBSITE_URL, FEEDBACK_URL } from "@/utils/util-links";

export default {
  name: "PageSettings",
  data() {
    return {
      websiteUrl: WEBSITE_URL,
      feedbackUrl: FEEDBACK_URL
    };
  },
  computed: {
    ...pickState(useAuthStore, ["user", "userId"]),
    ...pickState(useOrgsStore, ["orgs"]),
    userEmail() {
      return (this.user && this.user.email) || "";
    }
  },
  methods: {
    ...pickActions(useAuthStore, ["deleteAccount"]),
    exportUserData() {
      const data = {
        uid: this.userId || (this.user && this.user.uid) || "",
        email: this.userEmail,
        displayName: (this.user && this.user.displayName) || "",
        emailVerified: (this.user && this.user.emailVerified) || false,
        exportDate: new Date().toISOString(),
        organizations: (this.orgs || []).map((org) => ({
          id: org.id,
          name: org.name,
          currency: org.currency,
          role: (org.superAdmins || []).includes(this.userId) ? "admin" : "member"
        }))
      };

      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `longecho-account-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.$q.notify({
        type: "positive",
        message: this.$t("toastDataExported")
      });
    },
    confirmDeleteAccount() {
      this.$q
        .dialog({
          title: this.$t("deleteAccountTitle"),
          message: this.$t("deleteAccountConfirm"),
          cancel: true,
          persistent: true,
          color: "negative"
        })
        .onOk(async () => {
          try {
            await this.deleteAccount();
            this.$router.push("/auth");
          } catch (err) {
            console.error("Account deletion failed:", err);
          }
        });
    }
  }
};
</script>

<style scoped>
.settings {
  max-width: 640px;
  margin: 0 auto;
}
</style>
