<template>
  <q-card>
    <modal-header v-if="modelToSubmit.isOrgMainModel" v-slot:header>Configure main model</modal-header>
    <modal-header v-else v-slot:header>Configure model</modal-header>

    <q-form @submit.prevent="submitModel">
      <q-card-section>
        <q-input
          v-model="modelToSubmit.name"
          label="Model name"
          :rules="[val => !!val || 'Field is required']"
          filled
        />
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
            :rules="[val => val > 0 || 'A number greater than 0 is required']"
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
      <q-card-section v-if="modelToSubmit.isOrgMainModel">
        <div class="text-h6">Node assignments</div>
        <q-select
          label="Effort (time)"
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
          label="Purchase (expense)"
          v-model="modelToSubmit.roleNodes.purchase"
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
          label="Total value"
          v-model="modelToSubmit.roleNodes.totalValue"
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
          label="Total cost"
          v-model="modelToSubmit.roleNodes.totalCost"
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
      </q-card-section>
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
    }
  }
};
</script>
