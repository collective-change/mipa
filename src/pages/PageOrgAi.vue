<template>
  <q-page padding>
    <div class="ai-page">
      <div class="text-h5">{{ $t("AI") }}</div>
      <div v-if="currentOrg" class="text-subtitle1 text-grey-8 q-mb-md">{{ currentOrg.name }}</div>

      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1 text-weight-medium">{{ $t("aiWhatTitle") }}</div>
          <p class="text-body2 q-mt-sm q-mb-sm">{{ $t("aiWhatText") }}</p>
          <p class="text-body2 q-mb-sm">{{ $t("aiOwnProviderText") }}</p>
          <p class="text-body2 q-mb-none text-grey-8">
            {{ $t("aiDataText") }}
            <router-link to="/privacy">{{ $t("Privacy policy") }}</router-link>
          </p>
        </q-card-section>
      </q-card>

      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1 text-weight-medium">{{ $t("aiStatusTitle") }}</div>
          <div v-if="connected" class="row items-center q-gutter-sm q-mt-sm">
            <q-icon name="check_circle" color="positive" size="sm" />
            <div class="text-body2">
              {{ providerLabel(settings.provider) }} · <code>{{ settings.model }}</code>
              · {{ $t("API key") }} ••••{{ settings.keyLast4 }}
            </div>
          </div>
          <div v-else class="row items-center q-gutter-sm q-mt-sm">
            <q-icon name="power_off" color="grey-6" size="sm" />
            <div class="text-body2">{{ $t("aiNotConnected") }}</div>
          </div>
          <div v-if="!canManage && settingsLoaded" class="text-body2 text-grey-8 q-mt-md">
            {{ $t("aiAskAdmin", { admins: adminNames }) }}
          </div>
        </q-card-section>

        <template v-if="canManage">
          <q-separator />
          <q-card-section>
            <div class="text-subtitle1 text-weight-medium q-mb-sm">
              {{ connected ? $t("aiChangeTitle") : $t("aiConnectTitle") }}
            </div>
            <q-option-group
              v-model="form.provider"
              :options="providerOptions"
              color="primary"
              inline
            />
            <div class="text-body2 text-grey-8 q-mt-sm help-text">
              {{ form.provider == "anthropic" ? $t("aiAnthropicHelp") : $t("aiCompatibleHelp") }}
            </div>
            <div class="q-mt-xs">
              <a v-for="link in providerLinks" :key="link.href" :href="link.href" target="_blank" rel="noopener" class="q-mr-md text-body2">
                {{ $t(link.label) }} <q-icon name="open_in_new" size="xs" />
              </a>
            </div>
            <q-form @submit.prevent="save" class="q-gutter-sm q-mt-sm" style="max-width: 520px">
              <q-input
                v-if="form.provider == 'openai-compatible'"
                v-model="form.baseUrl"
                outlined
                dense
                :label="$t('Endpoint address')"
                placeholder="https://openrouter.ai/api/v1"
                :rules="[(v) => endpointAllowed(v) || $t('aiHttpsOnly')]"
              />
              <q-select
                v-model="form.model"
                outlined
                dense
                use-input
                hide-selected
                fill-input
                new-value-mode="add-unique"
                input-debounce="0"
                :options="modelOptions"
                :label="$t('Model')"
                :hint="form.provider == 'anthropic' ? $t('aiModelHint') : $t('aiCompatibleModelHint')"
                @input-value="(v) => (form.model = v)"
              >
                <template v-slot:option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section>{{ scope.opt }}</q-item-section>
                    <q-item-section side>
                      <q-badge color="positive" outline :label="$t('Recommended')" />
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
              <q-input
                v-model="form.apiKey"
                outlined
                dense
                type="password"
                autocomplete="off"
                :label="$t('API key')"
                :hint="connected && settings.provider == form.provider ? $t('aiKeepKeyHint') : ''"
              />
              <div class="row q-gutter-sm q-pt-sm">
                <q-btn
                  type="submit"
                  unelevated
                  no-caps
                  color="primary"
                  icon="cable"
                  :label="$t('Test and save')"
                  :loading="saving"
                  :disable="!form.model || (!form.apiKey && !(connected && settings.provider == form.provider))"
                />
                <q-btn
                  v-if="connected"
                  flat
                  no-caps
                  color="negative"
                  :label="$t('Disconnect')"
                  @click="disconnect"
                />
              </div>
            </q-form>
          </q-card-section>
        </template>
      </q-card>

      <q-card v-if="isAdmin" flat bordered>
        <q-card-section>
          <div class="text-subtitle1 text-weight-medium">{{ $t("aiManagersTitle") }}</div>
          <div class="text-body2 text-grey-8 q-mb-sm">{{ $t("aiManagersHelp") }}</div>
          <q-select
            v-model="managers"
            outlined
            dense
            multiple
            use-chips
            emit-value
            map-options
            :options="memberOptions"
            :label="$t('AI settings managers')"
            style="max-width: 520px"
          />
          <q-btn
            class="q-mt-sm"
            outline
            no-caps
            color="primary"
            :label="$t('Save')"
            :loading="savingManagers"
            @click="saveManagers"
          />
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script>
import { mapState, mapGetters } from "vuex";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firebaseDb, firebaseFunctions, useEmulators } from "@/boot/firebase";
import { showErrorMessage } from "@/utils/util-show-error-message";

const CLAUDE_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-haiku-5-5"];

export default {
  data() {
    return {
      settings: {},
      settingsLoaded: false,
      unsubscribe: null,
      form: { provider: "anthropic", model: "claude-opus-5-5", baseUrl: "", apiKey: "" },
      saving: false,
      managers: [],
      savingManagers: false
    };
  },
  computed: {
    ...mapState("auth", ["userId"]),
    ...mapState("orgs", ["currentOrg"]),
    ...mapGetters("users", ["currentOrgUsers"]),
    orgId() {
      return this.$route.params.orgId;
    },
    connected() {
      return !!this.settings.provider;
    },
    isAdmin() {
      return !!this.currentOrg && (this.currentOrg.superAdmins || []).includes(this.userId);
    },
    canManage() {
      return this.isAdmin || (this.settings.managers || []).includes(this.userId);
    },
    providerOptions() {
      return [
        { value: "anthropic", label: this.$t("Anthropic (Claude)") },
        { value: "openai-compatible", label: this.$t("OpenAI-compatible endpoint") }
      ];
    },
    modelOptions() {
      return this.form.provider == "anthropic" ? CLAUDE_MODELS : [];
    },
    providerLinks() {
      return this.form.provider == "anthropic"
        ? [
            { href: "https://console.anthropic.com/settings/keys", label: "Create an API key" },
            { href: "https://console.anthropic.com/settings/limits", label: "Set a spending limit" },
            { href: "https://www.anthropic.com/legal/commercial-terms", label: "Provider's terms" }
          ]
        : [];
    },
    members() {
      return this.currentOrgUsers || [];
    },
    memberOptions() {
      const admins = (this.currentOrg && this.currentOrg.superAdmins) || [];
      return this.members
        .filter((m) => !admins.includes(m.id))
        .map((m) => ({ value: m.id, label: m.displayName || m.email }));
    },
    adminNames() {
      const admins = (this.currentOrg && this.currentOrg.superAdmins) || [];
      return this.members
        .filter((m) => admins.includes(m.id))
        .map((m) => m.displayName || m.email)
        .join(", ");
    }
  },
  methods: {
    // https only; a mock provider on this machine is allowed with the emulators
    endpointAllowed(url) {
      return (
        /^https:\/\/\S+$/.test(url || "") ||
        (useEmulators && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url || ""))
      );
    },
    providerLabel(provider) {
      const option = this.providerOptions.find((o) => o.value == provider);
      return option ? option.label : provider;
    },
    call(name, data) {
      return httpsCallable(firebaseFunctions, name, { timeout: 60000 })(data);
    },
    async save() {
      this.saving = true;
      try {
        await this.call("setAiSettings", {
          orgId: this.orgId,
          provider: this.form.provider,
          model: this.form.model.trim(),
          baseUrl: this.form.provider == "openai-compatible" ? this.form.baseUrl.trim() : "",
          apiKey: this.form.apiKey.trim() || undefined
        });
        this.form.apiKey = "";
        this.$q.notify({ type: "positive", message: this.$t("aiConnected") });
      } catch (error) {
        showErrorMessage(this.$t("aiConnectFailed"), error.message);
      } finally {
        this.saving = false;
      }
    },
    disconnect() {
      this.$q
        .dialog({
          title: this.$t("Disconnect"),
          message: this.$t("aiDisconnectConfirm"),
          cancel: true,
          persistent: true
        })
        .onOk(async () => {
          try {
            await this.call("disconnectAi", { orgId: this.orgId });
            this.$q.notify(this.$t("aiDisconnected"));
          } catch (error) {
            showErrorMessage(this.$t("Disconnect"), error.message);
          }
        });
    },
    async saveManagers() {
      this.savingManagers = true;
      try {
        await this.call("setAiManagers", { orgId: this.orgId, managers: this.managers });
        this.$q.notify(this.$t("Saved"));
      } catch (error) {
        showErrorMessage(this.$t("AI settings managers"), error.message);
      } finally {
        this.savingManagers = false;
      }
    }
  },
  watch: {
    "form.provider"(provider) {
      if (provider == "anthropic" && !CLAUDE_MODELS.includes(this.form.model)) this.form.model = CLAUDE_MODELS[0];
      if (provider == "openai-compatible" && CLAUDE_MODELS.includes(this.form.model)) this.form.model = "";
    }
  },
  created() {
    this.unsubscribe = onSnapshot(
      doc(firebaseDb, "orgAiSettings", this.orgId),
      (snapshot) => {
        this.settings = snapshot.exists() ? snapshot.data() : {};
        this.settingsLoaded = true;
        this.managers = [...(this.settings.managers || [])];
        if (this.settings.provider) {
          this.form.provider = this.settings.provider;
          this.form.model = this.settings.model || "";
          this.form.baseUrl = this.settings.baseUrl || "";
        }
      },
      (error) => console.warn("AI settings:", error.message)
    );
  },
  beforeUnmount() {
    if (this.unsubscribe) this.unsubscribe();
  }
};
</script>

<style scoped>
.ai-page {
  max-width: 760px;
  margin: 0 auto;
}
.help-text {
  max-width: 640px;
}
</style>
