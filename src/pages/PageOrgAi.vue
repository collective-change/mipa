<template>
  <q-page padding>
    <div class="ai-page">
      <div class="text-h5">{{ $t("AI") }}</div>
      <div v-if="currentOrg" class="text-subtitle1 text-grey-8 q-mb-md">{{ currentOrg.name }}</div>

      <!-- Overview Card -->
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

      <!-- Status Card -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1 text-weight-medium">{{ $t("aiStatusTitle") }}</div>
          <div v-if="connected" class="row items-center q-gutter-sm q-mt-sm">
            <q-icon name="check_circle" color="positive" size="sm" />
            <div class="text-body2">
              <span class="text-weight-medium">{{ currentProviderName }}</span> · <code>{{ settings.model }}</code>
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

        <!-- Manage Provider Section -->
        <template v-if="canManage">
          <q-separator />
          <q-card-section>
            <div class="text-subtitle1 text-weight-medium q-mb-md">
              {{ connected ? $t("aiChangeTitle") : $t("aiConnectTitle") }}
            </div>

            <!-- Provider Presets -->
            <div class="text-subtitle2 text-grey-8 q-mb-sm">{{ $t("selectAiPreset") }}</div>
            <div class="row q-col-gutter-sm q-mb-md">
              <div
                v-for="preset in presets"
                :key="preset.id"
                class="col-12 col-sm-6"
              >
                <q-card
                  flat
                  bordered
                  class="cursor-pointer preset-card q-pa-sm"
                  :class="{ 'preset-card-active': selectedPresetId === preset.id }"
                  @click="choosePreset(preset)"
                >
                  <div class="row items-center no-wrap">
                    <q-avatar
                      size="36px"
                      :color="selectedPresetId === preset.id ? 'primary' : 'grey-3'"
                      :text-color="selectedPresetId === preset.id ? 'white' : 'grey-8'"
                      :icon="preset.icon"
                      class="q-mr-sm"
                    />
                    <div class="col overflow-hidden">
                      <div class="row items-center no-wrap">
                        <span class="text-weight-bold text-body2 ellipsis">{{ preset.label }}</span>
                        <q-badge
                          v-if="preset.recommended"
                          color="positive"
                          outline
                          dense
                          class="q-ml-xs"
                          :label="$t('Recommended')"
                        />
                      </div>
                      <div class="text-caption text-grey-7 ellipsis">
                        {{ $t(preset.descriptionKey) }}
                      </div>
                    </div>
                    <q-icon
                      v-if="selectedPresetId === preset.id"
                      name="check_circle"
                      color="primary"
                      size="sm"
                      class="q-ml-xs"
                    />
                  </div>
                </q-card>
              </div>
            </div>

            <!-- Provider Guidance Box -->
            <q-banner
              v-if="activePreset && activePreset.dashboardUrl"
              rounded
              dense
              class="bg-blue-1 text-blue-10 q-mb-md"
            >
              <template v-slot:avatar>
                <q-icon name="help_outline" color="primary" />
              </template>
              <div class="text-subtitle2 text-weight-bold">
                {{ $t("howToGetKeyTitle") }}
              </div>
              <ol class="q-pl-md q-my-xs text-caption">
                <li>{{ $t("stepRegister", { name: activePreset.providerDisplayName }) }}</li>
                <li>{{ $t("stepCreateKey") }}</li>
                <li>{{ $t("stepPasteKey") }}</li>
              </ol>
              <div class="text-caption text-grey-8 q-mb-xs">
                {{ $t("stepBillingHint") }}
              </div>
              <div class="q-mt-sm">
                <q-btn
                  unelevated
                  dense
                  no-caps
                  size="sm"
                  color="primary"
                  icon-right="open_in_new"
                  :label="$t('openKeyDashboard', { name: activePreset.providerDisplayName })"
                  :href="activePreset.dashboardUrl"
                  target="_blank"
                  rel="noopener"
                />
              </div>
            </q-banner>

            <!-- Test Connection Error / Success Alert -->
            <q-banner
              v-if="testResult.status === 'success'"
              rounded
              dense
              class="bg-positive text-white q-mb-md"
            >
              <template v-slot:avatar>
                <q-icon name="check" color="white" />
              </template>
              <div class="text-caption">
                {{ $t("connectionSuccess", { timeMs: testResult.timeMs }) }}
              </div>
            </q-banner>

            <q-banner
              v-if="testResult.status === 'error'"
              rounded
              dense
              class="bg-negative text-white q-mb-md"
            >
              <template v-slot:avatar>
                <q-icon name="error_outline" color="white" />
              </template>
              <div class="text-weight-bold text-caption">{{ $t("connectionFailedTitle") }}</div>
              <div class="text-caption q-mt-xs">{{ testResult.message }}</div>
              <div v-if="testResult.advice" class="text-caption text-yellow-2 q-mt-xs">
                {{ testResult.advice }}
              </div>
            </q-banner>

            <!-- Settings Form -->
            <q-form @submit.prevent="save" class="q-gutter-sm" style="max-width: 580px">
              <!-- Endpoint URL (shown if custom or expandable) -->
              <div v-if="form.provider === 'openai-compatible'">
                <div v-if="selectedPresetId === 'custom' || showAdvancedEndpoint">
                  <q-input
                    v-model="form.baseUrl"
                    outlined
                    dense
                    :label="$t('Endpoint address')"
                    placeholder="https://openrouter.ai/api/v1"
                    :rules="[(v) => endpointAllowed(v) || $t('aiHttpsOnly')]"
                  />
                </div>
                <div v-else class="row items-center justify-between text-caption text-grey-7 q-mb-xs">
                  <span>{{ $t("Endpoint address") }}: <code>{{ form.baseUrl }}</code></span>
                  <q-btn
                    flat
                    dense
                    no-caps
                    size="xs"
                    color="primary"
                    :label="$t('advancedEndpoint')"
                    @click="showAdvancedEndpoint = true"
                  />
                </div>
              </div>

              <!-- Model Selector & Quick Chips -->
              <div>
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
                  :hint="form.provider === 'anthropic' ? $t('aiModelHint') : $t('aiCompatibleModelHint')"
                  @input-value="(v) => (form.model = v)"
                />

                <!-- Recommended model chips -->
                <div v-if="activePreset && activePreset.models && activePreset.models.length" class="q-mt-xs row items-center q-gutter-xs">
                  <span class="text-caption text-grey-8">{{ $t("recommendedModels") }}:</span>
                  <q-chip
                    v-for="m in activePreset.models"
                    :key="m"
                    clickable
                    dense
                    size="sm"
                    :color="form.model === m ? 'primary' : 'grey-3'"
                    :text-color="form.model === m ? 'white' : 'grey-9'"
                    @click="form.model = m"
                  >
                    {{ m }}
                  </q-chip>
                </div>
              </div>

              <!-- API Key Field -->
              <q-input
                v-model="form.apiKey"
                outlined
                dense
                :type="isKeyVisible ? 'text' : 'password'"
                autocomplete="off"
                :label="$t('API key')"
                :hint="connected && settings.provider === form.provider && !form.apiKey ? $t('aiKeepKeyHint') : ''"
              >
                <template v-slot:append>
                  <q-icon
                    :name="isKeyVisible ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer"
                    @click="isKeyVisible = !isKeyVisible"
                  />
                </template>
              </q-input>

              <!-- Action Buttons -->
              <div class="row items-center q-gutter-sm q-pt-sm">
                <q-btn
                  type="submit"
                  unelevated
                  no-caps
                  color="primary"
                  icon="cable"
                  :label="$t('testAndSaveBtn')"
                  :loading="saving"
                  :disable="!form.model || (!form.apiKey && !(connected && settings.provider === form.provider))"
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

      <!-- AI Managers Card -->
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

const PRESETS = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    provider: "anthropic",
    baseUrl: "",
    defaultModel: "claude-opus-5-5",
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-haiku-5-5"],
    descriptionKey: "presetAnthropicDesc",
    dashboardUrl: "https://console.anthropic.com/settings/keys",
    providerDisplayName: "Anthropic Console",
    icon: "psychology",
    recommended: true
  },
  {
    id: "openai",
    label: "OpenAI",
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"],
    descriptionKey: "presetOpenAiDesc",
    dashboardUrl: "https://platform.openai.com/api-keys",
    providerDisplayName: "OpenAI Platform",
    icon: "smart_toy",
    recommended: false
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    provider: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-3.5-sonnet",
    models: ["anthropic/claude-3.5-sonnet", "openai/gpt-4o", "google/gemini-2.5-pro", "meta-llama/llama-3.3-70b-instruct"],
    descriptionKey: "presetOpenRouterDesc",
    dashboardUrl: "https://openrouter.ai/keys",
    providerDisplayName: "OpenRouter",
    icon: "hub",
    recommended: false
  },
  {
    id: "gemini",
    label: "Google Gemini",
    provider: "openai-compatible",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    descriptionKey: "presetGeminiDesc",
    dashboardUrl: "https://aistudio.google.com/app/apikey",
    providerDisplayName: "Google AI Studio",
    icon: "auto_awesome",
    recommended: false
  },
  {
    id: "custom",
    label: "Custom Endpoint",
    provider: "openai-compatible",
    baseUrl: "",
    defaultModel: "",
    models: [],
    descriptionKey: "presetCustomDesc",
    dashboardUrl: "",
    providerDisplayName: "Custom Endpoint",
    icon: "tune",
    recommended: false
  }
];

export default {
  data() {
    return {
      presets: PRESETS,
      selectedPresetId: "anthropic",
      showAdvancedEndpoint: false,
      isKeyVisible: false,
      testResult: { status: "idle", message: "", advice: "", timeMs: 0 },
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
    activePreset() {
      return this.presets.find((p) => p.id === this.selectedPresetId) || this.presets[0];
    },
    currentProviderName() {
      if (!this.settings.provider) return "";
      const match = this.presets.find((p) => {
        if (p.provider !== this.settings.provider) return false;
        if (p.baseUrl && this.settings.baseUrl) {
          return this.settings.baseUrl.includes(new URL(p.baseUrl).hostname);
        }
        return true;
      });
      return match ? match.label : this.settings.provider;
    },
    modelOptions() {
      return this.activePreset ? this.activePreset.models : [];
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
    choosePreset(preset) {
      this.selectedPresetId = preset.id;
      this.form.provider = preset.provider;
      this.form.baseUrl = preset.baseUrl;
      this.form.model = preset.defaultModel || "";
      this.showAdvancedEndpoint = false;
      this.testResult = { status: "idle", message: "", advice: "", timeMs: 0 };
    },
    endpointAllowed(url) {
      return (
        /^https:\/\/\S+$/.test(url || "") ||
        (useEmulators && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url || ""))
      );
    },
    call(name, data) {
      return httpsCallable(firebaseFunctions, name, { timeout: 60000 })(data);
    },
    getAdviceFromError(error) {
      const msg = (error?.message || "").toLowerCase();
      if (msg.includes("key") || msg.includes("auth") || msg.includes("401") || msg.includes("403")) {
        return this.$t("errAuthAdvice");
      }
      if (msg.includes("model") || msg.includes("not found") || msg.includes("404")) {
        return this.$t("errModelAdvice");
      }
      if (msg.includes("quota") || msg.includes("busy") || msg.includes("rate") || msg.includes("429")) {
        return this.$t("errQuotaAdvice");
      }
      return this.$t("errNetworkAdvice");
    },
    async save() {
      this.saving = true;
      this.testResult = { status: "idle", message: "", advice: "", timeMs: 0 };
      const startTime = Date.now();

      try {
        await this.call("setAiSettings", {
          orgId: this.orgId,
          provider: this.form.provider,
          model: this.form.model.trim(),
          baseUrl: this.form.provider === "openai-compatible" ? this.form.baseUrl.trim() : "",
          apiKey: this.form.apiKey.trim() || undefined
        });

        const timeMs = Date.now() - startTime;
        this.testResult = { status: "success", message: "", advice: "", timeMs };
        this.form.apiKey = "";
        this.$q.notify({ type: "positive", message: this.$t("aiConnected") });
      } catch (error) {
        const advice = this.getAdviceFromError(error);
        this.testResult = {
          status: "error",
          message: error.message || this.$t("aiConnectFailed"),
          advice,
          timeMs: 0
        };
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
            this.testResult = { status: "idle", message: "", advice: "", timeMs: 0 };
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
    },
    detectPresetFromSettings(settings) {
      if (!settings.provider) return "anthropic";
      if (settings.provider === "anthropic") return "anthropic";
      const url = settings.baseUrl || "";
      if (url.includes("openai.com")) return "openai";
      if (url.includes("openrouter.ai")) return "openrouter";
      if (url.includes("generativelanguage.googleapis.com")) return "gemini";
      return "custom";
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
          this.selectedPresetId = this.detectPresetFromSettings(this.settings);
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
.preset-card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  transition: all 0.2s ease;
}
.preset-card:hover {
  border-color: #90caf9;
  background-color: #f5f9ff;
}
.preset-card-active {
  border: 2px solid var(--q-primary);
  background-color: #f0f7ff;
}
</style>
