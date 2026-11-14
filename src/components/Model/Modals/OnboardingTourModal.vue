<template>
  <q-dialog v-model="isOpen">
    <q-card style="width: 600px; max-width: 95vw;" class="rounded-borders">
      <!-- Header with step progress indicator -->
      <q-card-section class="bg-primary text-white q-py-md">
        <div class="row items-center justify-between">
          <div class="row items-center q-gutter-sm">
            <q-icon :name="currentStepData.icon" size="md" />
            <div>
              <div class="text-caption text-blue-1 text-uppercase text-weight-bold">
                {{ $t("guidedTourLabel") }} • {{ currentStep + 1 }}/{{ steps.length }}
              </div>
              <div class="text-h6 text-weight-bold">
                {{ $t(currentStepData.titleKey) }}
              </div>
            </div>
          </div>
          <q-btn icon="close" flat round dense v-close-popup />
        </div>
      </q-card-section>

      <!-- Stepper Progress Dots -->
      <div class="row justify-center q-py-sm bg-grey-2 border-bottom">
        <div
          v-for="(st, idx) in steps"
          :key="st.key"
          class="step-dot cursor-pointer q-mx-xs"
          :class="{ 'step-dot-active': currentStep === idx, 'step-dot-done': currentStep > idx }"
          @click="currentStep = idx"
        ></div>
      </div>

      <!-- Main Step Content -->
      <q-card-section class="q-pa-lg">
        <div class="text-body1 text-grey-9 q-mb-md" style="line-height: 1.6;">
          {{ $t(currentStepData.descKey) }}
        </div>

        <!-- Visual Highlight Box -->
        <div class="bg-blue-1 text-blue-10 q-pa-md rounded-borders border-primary">
          <div class="row items-center text-subtitle2 text-weight-bold q-mb-xs">
            <q-icon name="lightbulb" class="q-mr-xs" color="primary" />
            {{ $t("keySystemicTakeaway") }}
          </div>
          <div class="text-body2">
            {{ $t(currentStepData.takeawayKey) }}
          </div>
        </div>
      </q-card-section>

      <!-- Modal Footer with Nav Buttons -->
      <q-card-actions align="between" class="bg-grey-1 q-px-lg q-py-md border-top">
        <q-btn
          v-if="currentStep > 0"
          flat
          dense
          color="grey-8"
          no-caps
          icon="arrow_back"
          :label="$t('previousStepBtn')"
          @click="currentStep--"
        />
        <div v-else></div>

        <div class="row q-gutter-sm">
          <q-btn
            v-if="currentStep === steps.length - 1"
            outline
            color="primary"
            no-caps
            icon="hub"
            :label="$t('openTemplateLibraryBtn')"
            @click="onOpenTemplates"
          />
          <q-btn
            v-if="currentStep < steps.length - 1"
            unelevated
            color="primary"
            no-caps
            icon-right="arrow_forward"
            :label="$t('nextStepBtn')"
            @click="currentStep++"
          />
          <q-btn
            v-else
            unelevated
            color="positive"
            no-caps
            icon="check"
            :label="$t('finishTourBtn')"
            v-close-popup
          />
        </div>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
export default {
  name: "OnboardingTourModal",
  props: {
    modelValue: {
      type: Boolean,
      default: false
    }
  },
  emits: ["update:modelValue", "open-templates"],
  data() {
    return {
      currentStep: 0,
      steps: [
        {
          step: 0,
          key: "system_map",
          icon: "account_tree",
          titleKey: "tourStep1Title",
          descKey: "tourStep1Desc",
          takeawayKey: "tourStep1Takeaway"
        },
        {
          step: 1,
          key: "actions_interventions",
          icon: "bolt",
          titleKey: "tourStep2Title",
          descKey: "tourStep2Desc",
          takeawayKey: "tourStep2Takeaway"
        },
        {
          step: 2,
          key: "simulation_leverage",
          icon: "insights",
          titleKey: "tourStep3Title",
          descKey: "tourStep3Desc",
          takeawayKey: "tourStep3Takeaway"
        },
        {
          step: 3,
          key: "decision_brief",
          icon: "verified_user",
          titleKey: "tourStep4Title",
          descKey: "tourStep4Desc",
          takeawayKey: "tourStep4Takeaway"
        }
      ]
    };
  },
  computed: {
    isOpen: {
      get() {
        return this.modelValue;
      },
      set(val) {
        this.$emit("update:modelValue", val);
      }
    },
    currentStepData() {
      return this.steps[this.currentStep] || this.steps[0];
    }
  },
  methods: {
    onOpenTemplates() {
      this.isOpen = false;
      this.$emit("open-templates");
    }
  }
};
</script>

<style scoped>
.step-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: #bdbdbd;
  transition: all 0.2s ease;
}
.step-dot-active {
  width: 24px;
  border-radius: 5px;
  background-color: var(--q-primary);
}
.step-dot-done {
  background-color: var(--q-positive);
}
.border-top {
  border-top: 1px solid #e0e0e0;
}
.border-bottom {
  border-bottom: 1px solid #e0e0e0;
}
</style>
