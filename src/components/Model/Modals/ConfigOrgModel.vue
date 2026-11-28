<template>
  <q-card>
    <modal-header v-if="modelToSubmit.isOrgMainModel">
      <template v-slot:header>{{ $t("Model settings") }}</template>
    </modal-header>
    <modal-header v-else>
      <template v-slot:header>{{ $t("Model settings") }}</template>
    </modal-header>

    <q-form @submit.prevent="submitModel">
      <q-card-section>
        <q-input
          v-model="modelToSubmit.name"
          :label="$t('Model name')"
          :rules="[val => !!val || $t('Required')]"
          filled
        />
      </q-card-section>
      <div class="row">
        <div class="col">
          <q-card-section>
            <div class="text-h6">{{ $t("Time") }}</div>
            <div class="text-body2 text-grey-8 q-mb-sm">{{ $t("timeIntro") }}</div>
            <!-- <q-select
          v-model="modelToSubmit.simulationParams.timeStepType"
          :options="timeStepTypeOptions"
          label="Time step type"
          emit-value
          map-options
          :rules="[val => !!val || $t('Required')]"
          filled
            />-->

            <div class="row">
              <q-input
                v-model.number="modelToSubmit.simulationParams.timeStepNumber"
                :label="$t('Calculate every')"
                :rules="[
                  val => val > 0 || $t('Enter a number greater than 0')
                ]"
                filled
              />
              <q-select
                v-model="modelToSubmit.simulationParams.timeStepUnit"
                :options="timeUnitOptions"
                :label="$t('Time unit')"
                style="min-width: 140px"
                :option-label="(opt) => $t(opt.label)"
                emit-value
                map-options
                :rules="[val => !!val || $t('Required')]"
                filled
              />
            </div>
            <q-input
              v-model.number="modelToSubmit.simulationParams.numTimeSteps"
              :label="$t('Number of steps')"
              :rules="[
                val =>
                  (val == parseInt(val) && val > 0) ||
                  $t('Enter a whole number greater than 0')
              ]"
              filled
            />
            <q-input
              v-model.number="modelToSubmit.simulationParams.timeStepGrowthRate"
              :label="$t('Step growth (advanced)')"
              :hint="$t('stepGrowthHint')"
              filled
            />
            <div class="row">
              <q-input
                v-model.number="modelToSubmit.simulationParams.finalTimeNumber"
                :label="$t('Looks ahead to')"
                :suffix="modelToSubmit.simulationParams.finalTimeUnit"
                readonly
              />
              <!--<q-select
                v-model="modelToSubmit.simulationParams.finalTimeUnit"
                :options="timeUnitOptions"
                label="units"
                emit-value
                map-options
                readonly
              />-->
            </div>
          </q-card-section>
        </div>
        <div class="col" v-if="modelToSubmit.isOrgMainModel">
          <q-card-section>
            <div class="text-h6">{{ $t("Key factors") }}</div>
            <div class="text-body2 text-grey-8 q-mb-sm">{{ $t("keyFactorsIntro") }}</div>
            <q-select
              :label="$t('Hourly cost of work')"
              v-model="modelToSubmit.roleNodes.averageEffortCostPerHour"
              @filter="filterFn"
              @filter-abort="abortFilterFn"
              :options="filteredNodeOptions"
              :rules="[val => !!val || $t('Required')]"
              emit-value
              map-options
              filled
              use-input
              hide-selected
              fill-input
            />
            <q-select
              :label="$t('Work hours an action needs')"
              v-model="modelToSubmit.roleNodes.effort"
              @filter="filterFn"
              @filter-abort="abortFilterFn"
              :options="filteredNodeOptions"
              :rules="[val => !!val || $t('Required')]"
              emit-value
              map-options
              filled
              use-input
              hide-selected
              fill-input
            />
            <q-select
              :label="$t('Money an action needs')"
              v-model="modelToSubmit.roleNodes.spending"
              @filter="filterFn"
              @filter-abort="abortFilterFn"
              :options="filteredNodeOptions"
              :rules="[val => !!val || $t('Required')]"
              emit-value
              map-options
              filled
              use-input
              hide-selected
              fill-input
            />

            <q-select
              :label="$t('Cost to the organization (per step)')"
              v-model="modelToSubmit.roleNodes.orgCost"
              @filter="filterFn"
              @filter-abort="abortFilterFn"
              :options="filteredNodeOptions"
              :rules="[val => !!val || $t('Required')]"
              emit-value
              map-options
              filled
              use-input
              hide-selected
              fill-input
            />
            <q-select
              :label="$t('Cost to the world (per step)')"
              v-model="modelToSubmit.roleNodes.worldCost"
              @filter="filterFn"
              @filter-abort="abortFilterFn"
              :options="filteredNodeOptions"
              :rules="[val => !!val || $t('Required')]"
              emit-value
              map-options
              filled
              use-input
              hide-selected
              fill-input
            />
            <q-select
              :label="$t('Benefit to the organization (per step)')"
              v-model="modelToSubmit.roleNodes.orgBenefit"
              @filter="filterFn"
              @filter-abort="abortFilterFn"
              :options="filteredNodeOptions"
              :rules="[val => !!val || $t('Required')]"
              emit-value
              map-options
              filled
              use-input
              hide-selected
              fill-input
            />
            <q-select
              :label="$t('Benefit to the world (per step)')"
              v-model="modelToSubmit.roleNodes.worldBenefit"
              @filter="filterFn"
              @filter-abort="abortFilterFn"
              :options="filteredNodeOptions"
              :rules="[val => !!val || $t('Required')]"
              emit-value
              map-options
              filled
              use-input
              hide-selected
              fill-input
            />
            <div class="text-subtitle2 q-mt-md">{{ $t("Weight of the world's benefit") }}</div>
            <div class="text-caption text-grey-8">{{ $t("weightHint") }}</div>
            <q-slider
              v-model.number="
                modelToSubmit.simulationParams.worldToOrgWeightingRatio
              "
              :min="0"
              :max="1"
              :step="0.01"
              color="primary"
            />
            <div style="position: relative" class="q-mb-lg">
              <q-badge color="primary" class="q-mb-sm absolute-center">
                {{ $t("Organization") }}
                {{ modelToSubmit.simulationParams.orgWeightingFactor }} :
                {{ modelToSubmit.simulationParams.worldWeightingFactor }}
                {{ $t("World") }}
              </q-badge>
            </div>
            <!--
            <q-select
              label="Combined benefit for interval (before subtracting costs and investments)"
              v-model="modelToSubmit.roleNodes.combinedBenefit"
              @filter="filterFn"
              @filter-abort="abortFilterFn"
              :options="filteredNodeOptions"
              :rules="[val => !!val || $t('Required')]"
              emit-value
              map-options
              filled
              use-input
              hide-selected
              fill-input
            />
            <q-select
              label="Combined cost for interval"
              v-model="modelToSubmit.roleNodes.combinedCost"
              @filter="filterFn"
              @filter-abort="abortFilterFn"
              :options="filteredNodeOptions"
              :rules="[val => !!val || $t('Required')]"
              emit-value
              map-options
              filled
              use-input
              hide-selected
              fill-input
            />-->
          </q-card-section>
        </div>
      </div>

      <q-separator />

      <q-card-section>
        <div class="row items-center justify-between q-mb-xs">
          <div class="text-h6 row items-center">
            <q-icon name="visibility" color="primary" class="q-mr-xs" size="22px" />
            {{ $t("stakeholderViewersTitle") }}
          </div>
          <q-badge color="blue-1" text-color="primary" class="q-px-sm q-py-xs text-caption">
            {{ $t("freeStakeholderViewersNotice") }}
          </q-badge>
        </div>
        <div class="text-body2 text-grey-8 q-mb-md">
          {{ $t("stakeholderViewersHelp") }}
        </div>

        <div class="row q-col-gutter-sm items-start q-mb-md">
          <div class="col">
            <q-input
              v-model="newViewerEmail"
              :label="$t('viewerEmailLabel')"
              placeholder="stakeholder@example.com"
              type="email"
              dense
              filled
              :error="!!viewerEmailError"
              :error-message="viewerEmailError"
              @keydown.enter.prevent="addViewer"
            />
          </div>
          <div class="col-auto">
            <q-btn
              no-caps
              unelevated
              color="primary"
              icon="person_add"
              :label="$t('addViewerBtn')"
              @click="addViewer"
            />
          </div>
        </div>

        <div v-if="viewerEmails.length" class="q-gutter-xs">
          <q-chip
            v-for="email in viewerEmails"
            :key="email"
            removable
            @remove="removeViewer(email)"
            color="grey-2"
            text-color="grey-9"
            icon="visibility"
          >
            {{ email }}
          </q-chip>
        </div>
        <div v-else class="text-caption text-grey-6 italic">
          {{ $t("noViewersConfigured") }}
        </div>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <div class="row items-center justify-between q-mb-xs">
          <div class="text-h6 row items-center">
            <q-icon name="data_object" color="primary" class="q-mr-xs" size="22px" />
            {{ $t("customVariablesTitle") }}
          </div>
          <q-badge color="primary" class="q-px-sm q-py-xs text-caption">
            {{ customVariablesCount }}
          </q-badge>
        </div>
        <div class="text-body2 text-grey-8 q-mb-md">
          {{ $t("customVariablesHelp") }}
        </div>

        <div v-if="customVariablesList.length" class="q-gutter-xs q-mb-md">
          <q-chip
            v-for="v in customVariablesList"
            :key="v.name"
            color="grey-2"
            text-color="primary"
            icon="data_object"
            dense
          >
            <span class="text-weight-bold q-mr-xs">{{ v.name }}</span>
            <span class="text-grey-8">= {{ v.value }}{{ v.unit ? ' ' + v.unit : '' }}</span>
          </q-chip>
        </div>
        <div v-else class="text-caption text-grey-6 italic q-mb-md">
          {{ $t("noCustomVariables") }}
        </div>

        <q-btn
          no-caps
          outline
          color="primary"
          icon="tune"
          :label="$t('customVariablesTitle')"
          @click="showCustomVariablesModal = true"
        />
      </q-card-section>

      <modal-buttons />
    </q-form>

    <custom-variables-modal
      v-model="showCustomVariablesModal"
      :model="currentModel"
    />
  </q-card>
</template>

<script>
import { pickState, pickActions } from "@/store/pinia-helpers";
import { useOrgsStore } from "@/store/store-orgs";
import { useModelStore } from "@/store/store-model";
import ModalHeader from "@/components/Shared/ModalComponents/ModalHeader.vue";
import ModalButtons from "@/components/Shared/ModalComponents/ModalButtons.vue";
import ModalOrgName from "@/components/Orgs/Modals/Shared/ModalOrgName.vue";
import CustomVariablesModal from "@/components/Model/Modals/CustomVariablesModal.vue";
//import { parse } from "mathjs";

export default {
  data() {
    return {
      showCustomVariablesModal: false,
      modelToSubmit: {
        name: "",
        simulationParams: {},
        roleNodes: {},
        viewers: { users: [], emails: [] },
      },
      newViewerEmail: "",
      viewerEmailError: "",
      timeUnitOptions: [
        { label: "seconds", value: "seconds" },
        { label: "minutes", value: "minutes" },
        { label: "hours", value: "hours" },
        { label: "days", value: "days" },
        { label: "weeks", value: "weeks" },
        { label: "months", value: "months" },
        { label: "years", value: "years" },
        { label: "decades", value: "decades" },
        { label: "centuries", value: "centuries" },
        { label: "millennia", value: "millennia" },
      ],
      filteredNodeOptions: [],
    };
  },
  components: {
    "modal-header": ModalHeader,
    "modal-buttons": ModalButtons,
    "modal-org-name": ModalOrgName,
    "custom-variables-modal": CustomVariablesModal,
  },
  computed: {
    ...pickState(useOrgsStore, ["currentOrg"]),
    ...pickState(useModelStore, ["currentModel", "nodes"]),
    customVariablesList() {
      const vars = this.currentModel?.customVariables;
      if (Array.isArray(vars)) return vars;
      if (vars && typeof vars === "object") {
        return Object.entries(vars).map(([name, item]) => ({
          name,
          ...(typeof item === "object" && item !== null ? item : { value: item })
        }));
      }
      return [];
    },
    customVariablesCount() {
      return this.customVariablesList.length;
    },
    computedFinalTime() {
      let finalTime = { number: 0, unit: "months" };
      let simulationParams = this.modelToSubmit.simulationParams;
      if (simulationParams.timeStepGrowthRate == 0) {
        finalTime.number =
          simulationParams.timeStepNumber * simulationParams.numTimeSteps;
        finalTime.unit = simulationParams.timeStepUnit;
      } else {
        let r = 1 + simulationParams.timeStepGrowthRate;
        let N = simulationParams.numTimeSteps;
        finalTime.number =
          simulationParams.timeStepNumber * ((1 - Math.pow(r, N)) / (1 - r));
        finalTime.unit = simulationParams.timeStepUnit;
      }
      return finalTime;
    },
    nodeOptions() {
      return this.nodes.map((node) => {
        return { label: node.name, value: node.id };
      });
    },
    worldToOrgWeightingRatio() {
      return this.modelToSubmit.simulationParams.worldToOrgWeightingRatio;
    },
    viewerEmails() {
      return (this.modelToSubmit.viewers && this.modelToSubmit.viewers.emails) || [];
    },
  },
  methods: {
    ...pickActions(useModelStore, ["updateModel"]),
    addViewer() {
      this.viewerEmailError = "";
      if (!this.newViewerEmail) return;
      const email = this.newViewerEmail.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        this.viewerEmailError = this.$t("invalidViewerEmail");
        return;
      }
      if (!this.modelToSubmit.viewers) {
        this.modelToSubmit.viewers = { users: [], emails: [] };
      }
      if (!Array.isArray(this.modelToSubmit.viewers.emails)) {
        this.modelToSubmit.viewers.emails = [];
      }
      if (!Array.isArray(this.modelToSubmit.viewers.users)) {
        this.modelToSubmit.viewers.users = [];
      }
      if (this.modelToSubmit.viewers.emails.includes(email)) {
        this.viewerEmailError = this.$t("alreadyViewer");
        return;
      }
      this.modelToSubmit.viewers.emails.push(email);
      this.newViewerEmail = "";
    },
    removeViewer(email) {
      if (this.modelToSubmit.viewers && Array.isArray(this.modelToSubmit.viewers.emails)) {
        this.modelToSubmit.viewers.emails = this.modelToSubmit.viewers.emails.filter(
          (e) => e !== email
        );
      }
    },
    filterFn(val, update, abort) {
      update(() => {
        if (val === "") {
          this.filteredNodeOptions = this.nodeOptions;
        } else {
          const needle = val.toLowerCase();
          this.filteredNodeOptions = this.nodeOptions.filter(
            (v) => v.label.toLowerCase().indexOf(needle) > -1
          );
        }
      });
    },
    abortFilterFn() {
      // console.log('delayed filter aborted')
    },
    submitModel() {
      this.updateModel({
        modelId: this.currentModel.id,
        updates: this.modelToSubmit,
      });
      this.$emit("close");
    },
  },
  created: function () {
    //compose option values first, so we don't need to wait
    //for filteredNodeOptions to compute, which results in q-select
    //displaying option value instead of option label.
    this.filteredNodeOptions = this.nodeOptions;
  },
  mounted() {
    //We need to do deep cloning here because Object.assign() copies property values.
    //If the source value is a reference to an object, it only copies the reference value.
    Object.assign(
      this.modelToSubmit,
      JSON.parse(JSON.stringify(this.currentModel))
    );
    if (!this.modelToSubmit.viewers || typeof this.modelToSubmit.viewers !== "object") {
      this.modelToSubmit.viewers = { users: [], emails: [] };
    } else {
      if (!Array.isArray(this.modelToSubmit.viewers.users)) this.modelToSubmit.viewers.users = [];
      if (!Array.isArray(this.modelToSubmit.viewers.emails)) this.modelToSubmit.viewers.emails = [];
      delete this.modelToSubmit.viewers.org;
    }
  },

  watch: {
    computedFinalTime(newVal) {
      if (newVal) {
        this.modelToSubmit.simulationParams.finalTimeNumber = newVal.number;
        this.modelToSubmit.simulationParams.finalTimeUnit = newVal.unit;
      }
    },

    worldToOrgWeightingRatio(ratio) {
      if (ratio <= 0.5) {
        this.modelToSubmit.simulationParams.orgWeightingFactor = 1;
        this.modelToSubmit.simulationParams.worldWeightingFactor =
          Math.round((ratio / (1 - ratio)) * 100) / 100;
      } else {
        this.modelToSubmit.simulationParams.worldWeightingFactor = 1;
        this.modelToSubmit.simulationParams.orgWeightingFactor =
          Math.round(((1 - ratio) / ratio) * 100) / 100;
      }
    },
  },
};
</script>
