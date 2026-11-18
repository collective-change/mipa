<template>
  <q-card flat bordered class="q-my-md rounded-borders bg-white">
    <q-card-section class="q-pb-xs">
      <div class="row items-center justify-between">
        <div class="text-subtitle1 text-weight-bold text-grey-9 row items-center">
          <q-icon name="eco" color="teal-8" class="q-mr-xs" size="20px" />
          {{ $t("climatePressure") || "Climate Pressure (Planetary Boundary)" }}
        </div>
        <div class="row items-center q-gutter-xs">
          <q-chip
            v-if="modelValue && modelValue.pressureValue != null"
            dense
            color="teal-1"
            text-color="teal-9"
            class="text-weight-bold"
          >
            {{ modelValue.pressureValue }} {{ modelValue.pressureUnit }} (Scope {{ modelValue.scope }})
          </q-chip>
          <q-btn
            v-if="modelValue"
            flat
            dense
            round
            size="sm"
            color="negative"
            icon="delete"
            :title="$t('removeClimatePressure') || 'Remove Climate Pressure'"
            @click="onRemove"
          />
        </div>
      </div>
      <div class="text-caption text-grey-7 q-mt-xs">
        {{ $t("climatePressureDesc") || "Action pressure on global climate boundary (tCO2e) computed using GHG Protocol and IPCC AR6 GWP-100." }}
      </div>
    </q-card-section>

    <q-card-section v-if="!modelValue && !isEditing" class="q-pt-none">
      <q-btn
        outline
        dense
        no-caps
        color="teal-8"
        icon="add_circle_outline"
        :label="$t('attachClimatePressure') || 'Attach Climate Pressure'"
        @click="startAttaching"
      />
    </q-card-section>

    <q-card-section v-else class="q-pt-none">
      <div class="row q-col-gutter-sm items-start q-mt-xs">
        <div class="col-12 col-sm-6">
          <q-select
            v-model="selectedFactorId"
            :options="factorOptions"
            emit-value
            map-options
            dense
            filled
            :label="$t('emissionFactor') || 'Emission Factor'"
            @update:model-value="onFactorSelected"
          >
            <template v-slot:option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section>
                  <q-item-label>{{ scope.opt.label }}</q-item-label>
                  <q-item-label caption>
                    Scope {{ scope.opt.scope }} · {{ scope.opt.geography }} · {{ scope.opt.factorValue }} {{ scope.opt.pressureUnit }}/{{ scope.opt.activityUnit }}
                  </q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
        </div>

        <div class="col-12 col-sm-3">
          <q-input
            v-model.number="quantity"
            type="number"
            min="0"
            step="any"
            dense
            filled
            :label="$t('activityQuantity') || 'Activity Quantity'"
            :rules="[(val) => val == null || val >= 0 || 'Must be >= 0']"
            @update:model-value="recalculate"
          />
        </div>

        <div class="col-12 col-sm-3">
          <q-input
            v-model="activityUnit"
            dense
            filled
            :label="$t('activityUnit') || 'Activity Unit'"
            @update:model-value="recalculate"
          />
        </div>
      </div>

      <!-- Unit Mismatch Guard Notice -->
      <q-banner
        v-if="unitMismatch"
        dense
        rounded
        class="bg-deep-orange-1 text-deep-orange-10 q-my-sm text-caption"
      >
        <template v-slot:avatar>
          <q-icon name="warning" color="deep-orange" />
        </template>
        {{ unitMismatchMessage }}
      </q-banner>

      <!-- Provenance details when factor is attached -->
      <div v-if="activeFactor" class="bg-grey-1 q-pa-sm rounded-borders q-mt-sm">
        <div class="row items-center justify-between text-caption text-grey-8">
          <div>
            <span class="text-weight-bold">{{ activeFactor.authority }}</span>
            <span class="q-ml-xs">({{ activeFactor.version }})</span>
            <span class="q-ml-xs">· Scope {{ activeFactor.scope }}</span>
            <span class="q-ml-xs">· {{ activeFactor.geography }}</span>
          </div>
          <q-badge color="grey-3" text-color="grey-9" class="text-weight-bold">
            {{ activeFactor.licence }}
          </q-badge>
        </div>

        <div v-if="activeFactor.citationUrl" class="text-caption q-mt-xs">
          <span class="text-grey-7">{{ $t("citationUrl") || "Citation URL" }}:</span>
          <a
            :href="activeFactor.citationUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary text-weight-medium q-ml-xs"
          >
            {{ activeFactor.citationUrl }}
          </a>
        </div>
      </div>

      <!-- Standing Decision M-5 physical notice -->
      <div class="text-caption text-grey-6 q-mt-xs" style="font-size: 11px;">
        {{ $t("physicalOnlyNotice") || "Physical quantity (tCO2e) is stored. In accordance with Decision M-5, boundary pressure is never converted into money or added to net benefit." }}
      </div>
    </q-card-section>
  </q-card>
</template>

<script>
import {
  CLIMATE_CONVERSION_FACTORS,
  getConversionFactor,
  calculatePressure
} from "@/utils/conversionFactors";

export default {
  name: "ClimatePressureCard",
  props: {
    modelValue: {
      type: Object,
      default: null
    }
  },
  emits: ["update:modelValue"],
  data() {
    return {
      isEditing: false,
      selectedFactorId: null,
      quantity: null,
      activityUnit: "",
      unitMismatch: false,
      unitMismatchMessage: ""
    };
  },
  computed: {
    factorOptions() {
      return CLIMATE_CONVERSION_FACTORS.map((f) => ({
        label: `${f.name} [Scope ${f.scope}, ${f.geography}]`,
        value: f.id,
        scope: f.scope,
        geography: f.geography,
        activityUnit: f.activityUnit,
        pressureUnit: f.pressureUnit,
        factorValue: f.factorValue
      }));
    },
    activeFactor() {
      return getConversionFactor(this.selectedFactorId);
    }
  },
  watch: {
    modelValue: {
      immediate: true,
      handler(val) {
        if (val && typeof val === "object") {
          this.selectedFactorId = val.factorId || null;
          this.quantity = val.activityQuantity != null ? val.activityQuantity : null;
          this.activityUnit = val.activityUnit || (this.activeFactor ? this.activeFactor.activityUnit : "");
          this.isEditing = true;
          this.unitMismatch = false;
        } else if (!this.isEditing) {
          this.selectedFactorId = null;
          this.quantity = null;
          this.activityUnit = "";
          this.unitMismatch = false;
        }
      }
    }
  },
  methods: {
    startAttaching() {
      this.isEditing = true;
      if (!this.selectedFactorId && CLIMATE_CONVERSION_FACTORS.length > 0) {
        this.selectedFactorId = CLIMATE_CONVERSION_FACTORS[0].id;
        this.activityUnit = CLIMATE_CONVERSION_FACTORS[0].activityUnit;
      }
    },
    onFactorSelected(newFactorId) {
      const factor = getConversionFactor(newFactorId);
      if (factor) {
        // Auto-fill expected unit if empty or was matching previous factor
        this.activityUnit = factor.activityUnit;
        this.recalculate();
      }
    },
    recalculate() {
      this.unitMismatch = false;
      this.unitMismatchMessage = "";

      if (!this.selectedFactorId || this.quantity == null || this.quantity === "") {
        return;
      }

      const factor = getConversionFactor(this.selectedFactorId);
      if (!factor) return;

      const cleanUnit = (this.activityUnit || "").trim();
      if (cleanUnit !== factor.activityUnit) {
        this.unitMismatch = true;
        this.unitMismatchMessage = `${this.$t("unitMismatchError") || "Activity unit does not match factor expected unit. Silent coercion is prohibited."} Expected: '${factor.activityUnit}', got: '${cleanUnit}'.`;
        return;
      }

      try {
        const pressure = calculatePressure(this.quantity, cleanUnit, factor);
        this.$emit("update:modelValue", pressure);
      } catch (err) {
        this.unitMismatch = true;
        this.unitMismatchMessage = err.message;
      }
    },
    onRemove() {
      this.isEditing = false;
      this.selectedFactorId = null;
      this.quantity = null;
      this.activityUnit = "";
      this.unitMismatch = false;
      this.$emit("update:modelValue", null);
    }
  }
};
</script>
