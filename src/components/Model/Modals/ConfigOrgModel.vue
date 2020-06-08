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
        <div class="text-h6">Simulation parameters</div>
        <!-- <q-select
          v-model="modelToSubmit.simulation.timeStepType"
          :options="timeStepTypeOptions"
          label="Time step type"
          emit-value
          map-options
          :rules="[val => !!val || 'Field is required']"
          filled
        /> -->

        <div class="row">
          <q-input
            v-model.number="modelToSubmit.simulation.timeStepNumber"
            :label="
              modelToSubmit.simulation.timeStepType == 'constant'
                ? 'time step'
                : 'initial time step'
            "
            :rules="[val => val > 0 || 'A number greater than 0 is required']"
            filled
          />
          <q-select
            v-model="modelToSubmit.simulation.timeStepUnit"
            :options="timeUnitOptions"
            label="units"
            emit-value
            map-options
            :rules="[val => !!val || 'Field is required']"
            filled
          />
        </div>
        <div
          class="row"
          v-if="modelToSubmit.simulation.timeStepType == 'exponential'"
        ></div>
        <q-input
          v-model.number="modelToSubmit.simulation.iterations"
          label="number of iterations"
          :rules="[
            val =>
              (val == parseInt(val) && val > 0) ||
              'A number greater than 0 is required'
          ]"
          filled
        />
        <q-input
          v-if="modelToSubmit.simulation.timeStepType == 'exponential'"
          v-model.number="modelToSubmit.simulation.timeStepGrowthRate"
          label="time step growth rate"
          filled
        />
        <div class="row">
          <q-input
            v-model.number="modelToSubmit.simulation.finalTimeNumber"
            label="final time"
            readonly
          />
          <q-select
            v-model="modelToSubmit.simulation.finalTimeUnit"
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
          v-model="modelToSubmit.roleNodes.singleEffort"
          :options="nodeOptions"
          label="Single effort"
          emit-value
          map-options
          :rules="[val => !!val || 'Field is required']"
          filled
        />
        <q-select
          v-model="modelToSubmit.roleNodes.singlePurchase"
          :options="nodeOptions"
          label="Single purchase"
          emit-value
          map-options
          :rules="[val => !!val || 'Field is required']"
          filled
        />
        <q-select
          v-model="modelToSubmit.roleNodes.totalValue"
          :options="nodeOptions"
          label="Total value"
          emit-value
          map-options
          :rules="[val => !!val || 'Field is required']"
          filled
        />
        <q-select
          v-model="modelToSubmit.roleNodes.totalCost"
          :options="nodeOptions"
          label="Total cost"
          emit-value
          map-options
          :rules="[val => !!val || 'Field is required']"
          filled
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
        simulation: {},
        roleNodes: {}
      },
      timeStepTypeOptions: [
        { label: "constant time step", value: "constant" },
        { label: "exponential time step", value: "exponential" }
      ],
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
      ]
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
      let simulation = this.modelToSubmit.simulation;
      if (simulation.timeStepGrowthRate == 0) {
        finalTime.number = simulation.timeStepNumber * simulation.iterations;
        finalTime.unit = simulation.timeStepUnit;
      } else {
        let r = 1 + simulation.timeStepGrowthRate;
        let N = simulation.iterations;
        finalTime.number =
          simulation.timeStepNumber * ((1 - Math.pow(r, N)) / (1 - r));
        finalTime.unit = simulation.timeStepUnit;
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
    submitModel() {
      this.updateModel({
        modelId: this.currentModel.id,
        updates: this.modelToSubmit
      });
      this.$emit("close");
    }
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
        this.modelToSubmit.simulation.finalTimeNumber = newVal.number;
        this.modelToSubmit.simulation.finalTimeUnit = newVal.unit;
      }
    }
  }
};
</script>
