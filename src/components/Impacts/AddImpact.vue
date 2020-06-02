<template>
  <q-card style="max-width:1500px; width:1000px">
    <q-card-section>
      <div class="text-h6">Add impact</div>
    </q-card-section>

    <q-form @submit.prevent="submitImpact">
      <q-card-section class="q-gutter-sm q-pt-none">
        <div class="q-gutter-sm row items-center">
          <q-select
            filled
            v-model="impact.impactType"
            :options="typeOptions"
            emit-value
            map-options
          />
          <div>and finish by</div>
          <q-input v-model="impact.deadline" filled type="date" />
          <q-input
            prefix="then"
            v-model="impact.thenText"
            placeholder="what's impacted and how?"
            filled
            autogrow
            style="width: 30em;"
          />
        </div>
        <div class="q-gutter-sm row items-center">
          <div>That is,</div>
          <q-select
            filled
            use-input
            hide-selected
            fill-input
            v-model="impact.nodeId"
            placeholder="impacted node"
            @filter="filterFn"
            @filter-abort="abortFilterFn"
            :options="filteredNodeOptions"
            emit-value
            map-options
            style="width: 12em"
          />
          <q-select
            filled
            v-model="impact.operation"
            :options="operationOptions"
            emit-value
            map-options
          />
          <q-input
            v-model="impact.operand"
            filled
            autogrow
            :suffix="unitDisplay"
            :style="'width: ' + operandFieldWidthEm + 'em; max-width: 30em'"
          />
          <q-select
            filled
            v-model="impact.durationType"
            :options="durationTypeOptions"
            emit-value
            map-options
          />
          <q-input
            v-if="impact.durationType == 'for'"
            v-model="impact.durationExpression"
            placeholder="how many"
            filled
            autogrow
            style="width: 8em"
          />
          <q-select
            v-if="impact.durationType == 'for'"
            filled
            v-model="impact.durationUnit"
            :options="durationUnitOptions"
            emit-value
            map-options
          />
        </div>
      </q-card-section>
      <q-card-section class="q-gutter-sm q-pt-none">
        <div v-if="validationError" class="text-negative">
          Please fill in all visible fields.
        </div>
      </q-card-section>
      <modal-save-button />
    </q-form>
  </q-card>
</template>

<script>
import mixinAddEditImpact from "src/mixins/mixin-add-edit-impact";

export default {
  mixins: [mixinAddEditImpact],

  props: ["addOrEdit", "editImpactId"],

  methods: {
    submitImpact() {
      //validate inputs
      if (
        !this.impact.thenText ||
        !this.impact.nodeId ||
        typeof this.impact.operand == "undefined" ||
        this.impact.operand == "" ||
        (this.impact.durationType == "for" &&
          (typeof this.impact.durationExpression == "undefined" ||
            this.impact.durationExpression == ""))
      ) {
        this.validationError = true;
        console.log("validation error");
      } else {
        var newImpact = {};
        Object.assign(newImpact, this.impact);
        newImpact.id = Date.now();
        this.$store.commit("uiAction/addImpact", newImpact);
        this.$emit("close");
      }
    }
  }
};
</script>
