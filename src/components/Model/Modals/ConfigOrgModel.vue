<template>
  <q-card>
    <modal-header v-if="modelToSubmit.isOrgMainModel" v-slot:header
      >Configure main model</modal-header
    >
    <modal-header v-else v-slot:header>Configure model</modal-header>

    <q-form @submit.prevent="submitModel">
      <q-card-section>
        <q-input
          v-model="modelToSubmit.name"
          label="Model name"
          :rules="[val => !!val || 'Field is required']"
          filled
        />
      </q-card-section>
      <div class="row">
        <div class="col">
          <q-card-section>
            <div class="text-h6">Simulation parameters</div>
            <!-- <q-select
          v-model="modelToSubmit.simulationParams.timeStepType"
          :options="timeStepTypeOptions"
          label="Time step type"
          emit-value
          map-options
          :rules="[val => !!val || 'Field is required']"
          filled
            />-->

            <div class="row">
              <q-input
                v-model.number="modelToSubmit.simulationParams.timeStepNumber"
                label="initial time step"
                :rules="[
                  val => val > 0 || 'A number greater than 0 is required'
                ]"
                filled
              />
              <q-select
                v-model="modelToSubmit.simulationParams.timeStepUnit"
                :options="timeUnitOptions"
                label="units"
                emit-value
                map-options
                :rules="[val => !!val || 'Field is required']"
                filled
              />
            </div>
            <q-input
              v-model.number="modelToSubmit.simulationParams.numTimeSteps"
              label="number of time steps"
              :rules="[
                val =>
                  (val == parseInt(val) && val > 0) ||
                  'A number greater than 0 is required'
              ]"
              filled
            />
            <q-input
              v-model.number="modelToSubmit.simulationParams.timeStepGrowthRate"
              label="time step growth rate"
              filled
            />
            <div class="row">
              <q-input
                v-model.number="modelToSubmit.simulationParams.finalTimeNumber"
                label="final time"
                readonly
              />
              <q-select
                v-model="modelToSubmit.simulationParams.finalTimeUnit"
                :options="timeUnitOptions"
                label="units"
                emit-value
                map-options
                readonly
              />
            </div>
          </q-card-section>
        </div>
        <div class="col">
          <q-card-section v-if="modelToSubmit.isOrgMainModel">
            <div class="text-h6">Node assignments</div>
            <q-select
              label="Average effort cost per hour"
              v-model="modelToSubmit.roleNodes.averageEffortCostPerHour"
              @filter="filterFn"
              @filter-abort="abortFilterFn"
              :options="filteredNodeOptions"
              :rules="[val => !!val || 'Field is required']"
              emit-value
              map-options
              filled
              use-input
              hide-selected
              fill-input
            />
            <q-select
              label="One-time effort (time)"
              v-model="modelToSubmit.roleNodes.effort"
              @filter="filterFn"
              @filter-abort="abortFilterFn"
              :options="filteredNodeOptions"
              :rules="[val => !!val || 'Field is required']"
              emit-value
              map-options
              filled
              use-input
              hide-selected
              fill-input
            />
            <q-select
              label="One-time spending"
              v-model="modelToSubmit.roleNodes.spending"
              @filter="filterFn"
              @filter-abort="abortFilterFn"
              :options="filteredNodeOptions"
              :rules="[val => !!val || 'Field is required']"
              emit-value
              map-options
              filled
              use-input
              hide-selected
              fill-input
            />
            <q-select
              label="Combined benefit for interval (before subtracting costs and investments)"
              v-model="modelToSubmit.roleNodes.combinedBenefit"
              @filter="filterFn"
              @filter-abort="abortFilterFn"
              :options="filteredNodeOptions"
              :rules="[val => !!val || 'Field is required']"
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
              :rules="[val => !!val || 'Field is required']"
              emit-value
              map-options
              filled
              use-input
              hide-selected
              fill-input
            />
            <!-- four new role nodes -->
            <q-select
              label="Cost to organization"
              v-model="modelToSubmit.roleNodes.costToOrg"
              @filter="filterFn"
              @filter-abort="abortFilterFn"
              :options="filteredNodeOptions"
              :rules="[val => !!val || 'Field is required']"
              emit-value
              map-options
              filled
              use-input
              hide-selected
              fill-input
            />
            <q-select
              label="Cost to world"
              v-model="modelToSubmit.roleNodes.costToWorld"
              @filter="filterFn"
              @filter-abort="abortFilterFn"
              :options="filteredNodeOptions"
              :rules="[val => !!val || 'Field is required']"
              emit-value
              map-options
              filled
              use-input
              hide-selected
              fill-input
            />
            <q-select
              label="Benefit to organization"
              v-model="modelToSubmit.roleNodes.benefitToOrg"
              @filter="filterFn"
              @filter-abort="abortFilterFn"
              :options="filteredNodeOptions"
              :rules="[val => !!val || 'Field is required']"
              emit-value
              map-options
              filled
              use-input
              hide-selected
              fill-input
            />
            <q-select
              label="Benefit to world"
              v-model="modelToSubmit.roleNodes.benefitToWorld"
              @filter="filterFn"
              @filter-abort="abortFilterFn"
              :options="filteredNodeOptions"
              :rules="[val => !!val || 'Field is required']"
              emit-value
              map-options
              filled
              use-input
              hide-selected
              fill-input
            />
            <div class="text-h6">Benevolence ratio</div>
            <q-slider
              v-model.number="
                modelToSubmit.simulationParams.worldToOrgWeightingRatio
              "
              :min="0"
              :max="1"
              :step="0.01"
              color="primary"
            />
            <q-badge color="primary">
              Self
              {{ modelToSubmit.simulationParams.worldWeightingFactor }} :
              {{ modelToSubmit.simulationParams.orgWeightingFactor }} World
            </q-badge>
          </q-card-section>
        </div>
      </div>

      <modal-buttons />
    </q-form>
  </q-card>
</template>

<script>
import { mapState, mapActions } from "vuex";
//import { parse } from "mathjs";

export default {
  data() {
    return {
      modelToSubmit: {
        name: "",
        simulationParams: {},
        roleNodes: {}
      },
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
        { label: "millennia", value: "millennia" }
      ],
      filteredNodeOptions: []
    };
  },
  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
    "modal-org-name": require("components/Orgs/Modals/Shared/ModalOrgName.vue")
      .default
  },
  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("model", ["currentModel", "nodes"]),
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
      return this.nodes.map(node => {
        return { label: node.name, value: node.id };
      });
    },
    worldToOrgWeightingRatio() {
      return this.modelToSubmit.simulationParams.worldToOrgWeightingRatio;
    }
  },
  methods: {
    ...mapActions("model", ["updateModel"]),
    filterFn(val, update, abort) {
      update(() => {
        if (val === "") {
          this.filteredNodeOptions = this.nodeOptions;
        } else {
          const needle = val.toLowerCase();
          this.filteredNodeOptions = this.nodeOptions.filter(
            v => v.label.toLowerCase().indexOf(needle) > -1
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
        updates: this.modelToSubmit
      });
      this.$emit("close");
    }
  },
  created: function() {
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
        this.modelToSubmit.simulationParams.worldWeightingFactor = 1;
        this.modelToSubmit.simulationParams.orgWeightingFactor =
          Math.round((ratio / (1 - ratio)) * 100) / 100;
      } else {
        this.modelToSubmit.simulationParams.orgWeightingFactor = 1;
        this.modelToSubmit.simulationParams.worldWeightingFactor =
          Math.round(((1 - ratio) / ratio) * 100) / 100;
      }
    }
  }
};
</script>
