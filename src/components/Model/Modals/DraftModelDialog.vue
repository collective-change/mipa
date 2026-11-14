<template>
  <q-card class="draft-dialog column no-wrap">
    <q-card-section class="row items-center q-pb-sm">
      <q-icon name="auto_awesome" color="primary" size="sm" class="q-mr-sm" />
      <div class="text-h6">{{ $t("Draft with AI") }}</div>
      <q-space />
      <q-btn flat round dense icon="close" v-close-popup :disable="step == 'working'" />
    </q-card-section>
    <q-separator />

    <q-card-section class="col scroll">
      <!-- No provider connected yet -->
      <div v-if="step == 'noProvider'" class="q-gutter-y-md">
        <div class="text-subtitle1">{{ $t("aiNoProviderTitle") }}</div>
        <div class="text-body2">{{ $t("aiWhatText") }}</div>
        <div class="text-body2">{{ $t("aiOwnProviderText") }}</div>
        <q-btn
          unelevated
          no-caps
          color="primary"
          icon="settings"
          :label="$t('Open AI settings')"
          :to="{ name: 'ai-settings', params: { orgNameSlug: $route.params.orgNameSlug, orgId } }"
        />
      </div>

      <!-- Describe the organization -->
      <div v-else-if="step == 'describe'">
        <div class="text-body1 q-mb-sm">{{ $t("aiDescribeIntro") }}</div>
        <q-input
          v-model="description"
          type="textarea"
          outlined
          autogrow
          autofocus
          :input-style="{ minHeight: '140px' }"
          :placeholder="$t('aiDescribePlaceholder')"
          counter
          maxlength="6000"
        />
        <div class="text-caption text-grey-8 q-mt-sm">
          {{ $t("aiSentNotice", { provider: providerName }) }}
          <router-link to="/privacy" target="_blank">{{ $t("Privacy policy") }}</router-link>
        </div>
      </div>

      <!-- Waiting for the AI or the trial calculation -->
      <div v-else-if="step == 'working'" class="column items-center q-pa-xl text-center">
        <q-spinner-dots color="primary" size="48px" />
        <div class="text-subtitle1 q-mt-md">{{ workingLabel }}</div>
        <div class="text-caption text-grey-7">{{ $t("aiUsuallyUnderAMinute") }}</div>
      </div>

      <!-- Clarifying questions -->
      <div v-else-if="step == 'questions'" class="q-gutter-y-md">
        <div class="text-body1">{{ reply.message || $t("aiQuestionsIntro") }}</div>
        <div v-for="(q, index) in reply.questions" :key="index">
          <div class="text-body2 text-weight-medium">{{ q.question }}</div>
          <div class="text-caption text-grey-7">{{ q.why }}</div>
          <q-input v-model="answers[index]" dense outlined autogrow :placeholder="$t('aiAnswerPlaceholder')" />
        </div>
      </div>

      <!-- The draft -->
      <div v-else-if="step == 'preview'">
        <div class="text-body1">{{ reply.summary }}</div>
        <q-banner
          dense
          rounded
          class="q-mt-md"
          :class="trial.status == 'ok' ? 'bg-green-1' : trial.status == 'failed' ? 'bg-red-1' : 'bg-grey-2'"
        >
          <template v-slot:avatar>
            <q-spinner v-if="trial.status == 'running'" color="primary" size="20px" />
            <q-icon v-else :name="trial.status == 'ok' ? 'check_circle' : 'error'" :color="trial.status == 'ok' ? 'positive' : 'negative'" />
          </template>
          <span v-if="trial.status == 'running'">{{ $t("aiTrialRunning") }}</span>
          <span v-else-if="trial.status == 'ok'">{{ $t("aiTrialOk") }}</span>
          <span v-else>
            {{ $t("aiTrialFailed") }}
            <div class="text-caption">{{ trial.errorType }}: {{ trial.errorMessage }}</div>
          </span>
        </q-banner>

        <div v-for="group in groupedFactors" :key="group.name" class="q-mt-md">
          <div class="text-subtitle2 text-primary">{{ group.name || $t("Other") }}</div>
          <q-list dense separator>
            <q-item v-for="factor in group.factors" :key="factor.symbol" class="q-px-none">
              <q-item-section side top>
                <q-checkbox
                  :model-value="chosen.has(factor.symbol)"
                  :disable="usedBy(factor.symbol).length > 0"
                  @update:model-value="(v) => toggle(factor.symbol, v)"
                >
                  <q-tooltip v-if="usedBy(factor.symbol).length">
                    {{ $t("aiUsedBy", { names: usedBy(factor.symbol).join(", ") }) }}
                  </q-tooltip>
                </q-checkbox>
              </q-item-section>
              <q-item-section>
                <q-item-label>
                  <span class="text-weight-medium">{{ factor.name }}</span>
                  <q-badge v-if="factor.isEstimate" outline color="orange-9" class="q-ml-sm" :label="$t('estimate')">
                    <q-tooltip max-width="300px">{{ factor.estimateReasoning }}</q-tooltip>
                  </q-badge>
                  <q-badge v-if="factor.isHourlyCost" outline color="primary" class="q-ml-sm" :label="$t('hourly cost')" />
                </q-item-label>
                <q-item-label caption>
                  <code>{{ factor.symbol }} = {{ factor.formula }}</code>
                  <span v-if="factor.unit"> · {{ factor.unit }}</span>
                </q-item-label>
                <q-item-label caption class="text-grey-8">{{ factor.explanation }}</q-item-label>
                <q-item-label v-if="factor.isEstimate && factor.estimateReasoning" caption class="text-orange-10">
                  {{ $t("aiEstimateNote", { reasoning: factor.estimateReasoning }) }}
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </div>

        <div v-if="reply.changesToExisting.length" class="q-mt-md">
          <div class="text-subtitle2 text-primary">{{ $t("aiChangesTitle") }}</div>
          <q-list dense separator>
            <q-item v-for="change in reply.changesToExisting" :key="change.symbol" class="q-px-none">
              <q-item-section>
                <q-item-label class="text-weight-medium">{{ nameOfExisting(change.symbol) }}</q-item-label>
                <q-item-label caption>
                  <span class="text-strike text-grey-6"><code>{{ formulaOfExisting(change.symbol) }}</code></span>
                  → <code>{{ change.newFormula }}</code>
                </q-item-label>
                <q-item-label caption class="text-grey-8">{{ change.explanation }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </div>

        <div class="q-mt-lg">
          <q-input
            v-model="followUp"
            outlined
            dense
            autogrow
            :label="$t('aiAskForChanges')"
            :placeholder="$t('aiAskForChangesExample')"
          >
            <template v-slot:after>
              <q-btn flat no-caps color="primary" icon="send" :disable="!followUp.trim()" @click="askForChanges" />
            </template>
          </q-input>
        </div>
      </div>

      <div v-else-if="step == 'error'" class="q-gutter-y-md">
        <div class="text-subtitle1 text-negative">{{ $t("aiErrorTitle") }}</div>
        <div class="text-body2">{{ errorMessage }}</div>
      </div>
    </q-card-section>

    <q-separator />
    <q-card-actions align="right" class="q-pa-md">
      <template v-if="step == 'describe'">
        <q-btn flat no-caps :label="$t('Cancel')" v-close-popup />
        <q-btn
          unelevated
          no-caps
          color="primary"
          icon="auto_awesome"
          :label="$t('Draft my model')"
          :disable="description.trim().length < 20"
          @click="send({ text: description })"
        />
      </template>
      <template v-else-if="step == 'questions'">
        <q-btn flat no-caps :label="$t('Draft now')" @click="send({ text: answersText(), draftNow: true })" />
        <q-btn unelevated no-caps color="primary" :label="$t('Answer')" @click="send({ text: answersText() })" />
      </template>
      <template v-else-if="step == 'preview'">
        <q-btn flat no-caps :label="$t('Cancel')" v-close-popup />
        <q-btn
          unelevated
          no-caps
          color="primary"
          icon="check"
          :label="$t('aiAddToModel', { count: chosen.size })"
          :disable="trial.status != 'ok' || accepting"
          :loading="accepting"
          @click="accept"
        />
      </template>
      <template v-else-if="step == 'error'">
        <q-btn flat no-caps :label="$t('Close')" v-close-popup />
        <q-btn v-if="reply && reply.kind == 'draft'" outline no-caps color="primary" :label="$t('Back to the draft')" @click="step = 'preview'" />
        <q-btn v-else outline no-caps color="primary" :label="$t('Start again')" @click="restart" />
      </template>
    </q-card-actions>
  </q-card>
</template>

<script>
import { mapState, mapGetters } from "vuex";
import { doc, getDoc } from "firebase/firestore";
import { parse } from "mathjs";
import { firebaseDb } from "@/boot/firebase";
import { compileModelDraft, roleNodesOf } from "@/utils/util-model-draft";
import { requestDraft, draftForCompile, writeDraft } from "@/utils/util-aiDraft";
import { trialCalculate } from "@/utils/util-trialCalc";

const MAX_REPAIRS = 2;

function symbolsIn(formula) {
  const used = new Set();
  try {
    parse(String(formula || "0")).traverse((node, path, parent) => {
      if (node.isSymbolNode && !(parent && parent.isFunctionNode && path == "fn")) used.add(node.name);
    });
  } catch {
    // an unreadable formula uses nothing we can tell; the trial will report it
  }
  return used;
}

export default {
  emits: ["accepted"],
  data() {
    return {
      step: "describe",
      provider: null,
      description: "",
      draftId: null,
      reply: null,
      answers: [],
      chosen: new Set(),
      followUp: "",
      trial: { status: "idle" },
      repairs: 0,
      workingLabel: "",
      errorMessage: "",
      accepting: false,
      compiled: null,
      trialRun: 0,
      newIds: {}
    };
  },
  computed: {
    ...mapState("model", ["currentModel"]),
    ...mapGetters("model", ["nodes"]),
    ...mapState("adHocDocs", ["exchangeRates"]),
    orgId() {
      return this.$route.params.orgId;
    },
    modelId() {
      return this.$route.params.modelId || this.orgId;
    },
    providerName() {
      if (!this.provider) return "";
      const label = this.provider.provider == "anthropic" ? "Anthropic" : this.provider.baseUrl || this.provider.provider;
      return `${label} (${this.provider.model})`;
    },
    groupedFactors() {
      const groups = new Map();
      (this.reply ? this.reply.factors : []).forEach((f) => {
        if (!groups.has(f.group)) groups.set(f.group, []);
        groups.get(f.group).push(f);
      });
      return [...groups].map(([name, factors]) => ({ name, factors }));
    },
    // symbol -> symbols of chosen factors and changes whose formulas use it
    dependents() {
      const map = new Map();
      if (!this.reply) return map;
      const add = (used, name) =>
        used.forEach((s) => {
          if (!map.has(s)) map.set(s, []);
          map.get(s).push(name);
        });
      this.reply.factors
        .filter((f) => this.chosen.has(f.symbol))
        .forEach((f) => add([...symbolsIn(f.formula)].filter((s) => s != f.symbol), f.name));
      this.reply.changesToExisting.forEach((c) => add(symbolsIn(c.newFormula), this.nameOfExisting(c.symbol)));
      return map;
    }
  },
  methods: {
    nameOfExisting(symbol) {
      const node = this.nodes.find((n) => n.symbol == symbol);
      return node ? node.name : symbol;
    },
    formulaOfExisting(symbol) {
      const node = this.nodes.find((n) => n.symbol == symbol);
      return node ? node.symbolFormula : "";
    },
    usedBy(symbol) {
      return this.chosen.has(symbol) ? this.dependents.get(symbol) || [] : [];
    },
    toggle(symbol, on) {
      const chosen = new Set(this.chosen);
      if (on) chosen.add(symbol);
      else chosen.delete(symbol);
      this.chosen = chosen;
      this.runTrial({ repair: false });
    },
    answersText() {
      return this.reply.questions
        .map((q, i) => `${q.question}\n${(this.answers[i] || "").trim() || this.$t("aiSkipped")}`)
        .join("\n\n");
    },
    restart() {
      Object.assign(this.$data, this.$options.data.call(this), { provider: this.provider });
    },
    async send(params) {
      this.step = "working";
      this.workingLabel = params.errors ? this.$t("aiFixing") : this.$t("aiDrafting");
      try {
        const result = await requestDraft({
          orgId: this.orgId,
          modelId: this.modelId,
          draftId: this.draftId || undefined,
          ...params
        });
        this.draftId = result.draftId;
        this.reply = result.reply;
        if (this.reply.kind == "questions") {
          this.answers = this.reply.questions.map(() => "");
          this.step = "questions";
          return;
        }
        if (!params.errors) this.repairs = 0;
        this.chosen = new Set(this.reply.factors.map((f) => f.symbol));
        this.followUp = "";
        this.step = "preview";
        await this.runTrial({ repair: true });
      } catch (error) {
        const reason = error.details && error.details.reason;
        if (reason == "no-provider") {
          this.step = "noProvider";
          return;
        }
        this.errorMessage = error.message;
        this.step = "error";
      }
    },
    askForChanges() {
      this.send({ text: this.followUp.trim() });
    },
    notesFor(factor) {
      return [
        factor.explanation,
        factor.isEstimate && factor.estimateReasoning
          ? this.$t("aiEstimateNote", { reasoning: factor.estimateReasoning })
          : "",
        this.$t("aiDraftedNote")
      ]
        .filter(Boolean)
        .join("\n");
    },
    compile() {
      // Stable ids for the draft's new factors, so a factor keeps its id
      // when the person ticks and unticks factors.
      const idFor = (symbol) => {
        if (!this.newIds[symbol]) this.newIds[symbol] = "d" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
        return this.newIds[symbol];
      };
      return compileModelDraft(draftForCompile(this.reply, this.chosen, this.notesFor), this.nodes, idFor);
    },
    async runTrial({ repair }) {
      const run = ++this.trialRun;
      const compiled = this.compile();
      this.compiled = compiled;
      if (compiled.problems.length) {
        return this.trialFailed({ errorType: this.$t("aiDraftProblem"), errorMessage: compiled.problems.join(" ") }, repair, compiled.problems);
      }
      this.trial = { status: "running" };
      const nodes = [
        ...this.nodes.map((n) => {
          const update = compiled.updates.find((u) => u.id == n.id);
          return update ? { ...n, ...update.fields } : n;
        }),
        ...compiled.creates
      ];
      const result = await trialCalculate({
        nodes,
        simulationParams: this.currentModel.simulationParams,
        roleNodes: { ...roleNodesOf(nodes), ...(this.currentModel.roleNodes || {}) },
        exchangeRates: this.exchangeRates,
        orgId: this.orgId,
        modelId: this.modelId
      });
      if (run != this.trialRun) return; // a newer trial started
      if (result.ok) this.trial = { status: "ok" };
      else this.trialFailed(result, repair, [`${result.errorType}: ${this.withSymbols(result.errorMessage)}`]);
    },
    trialFailed(result, repair, errors) {
      this.trial = { status: "failed", errorType: result.errorType, errorMessage: result.errorMessage };
      if (repair && this.repairs < MAX_REPAIRS) {
        this.repairs++;
        this.send({ errors });
      }
    },
    // The calculator names factors by name; the AI knows them by symbol too.
    withSymbols(message) {
      let text = message || "";
      [...this.nodes, ...(this.compiled ? this.compiled.creates : [])].forEach((n) => {
        if (n.name && n.symbol && n.name != n.symbol) text = text.split(`"${n.name}"`).join(`"${n.name}" (${n.symbol})`);
      });
      return text;
    },
    async accept() {
      this.accepting = true;
      try {
        await writeDraft({
          modelId: this.modelId,
          draftId: this.draftId,
          compiled: this.compiled,
          reply: this.reply
        });
        this.$q.notify({ type: "positive", message: this.$t("aiDraftAdded", { count: this.compiled.creates.length }) });
        this.$emit("accepted");
      } catch (error) {
        this.errorMessage = error.message;
        this.step = "error";
      } finally {
        this.accepting = false;
      }
    }
  },
  async created() {
    try {
      const settings = await getDoc(doc(firebaseDb, "orgAiSettings", this.orgId));
      this.provider = settings.exists() && settings.data().provider ? settings.data() : null;
    } catch {
      this.provider = null;
    }
    if (!this.provider) this.step = "noProvider";
  }
};
</script>

<style scoped>
.draft-dialog {
  width: 760px;
  max-width: 96vw;
  max-height: 90vh;
}
</style>
