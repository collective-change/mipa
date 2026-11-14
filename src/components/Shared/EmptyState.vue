<template>
  <div class="empty-state-card column items-center justify-center text-center q-pa-xl">
    <!-- Icon with soft gradient ring -->
    <div class="icon-wrapper q-mb-md flex flex-center">
      <q-icon :name="icon" :color="iconColor" :size="iconSize" />
    </div>

    <!-- Title & Subtitle -->
    <div class="text-h6 text-weight-bold text-grey-9 q-mb-xs">
      {{ title }}
    </div>
    <div v-if="description" class="text-body2 text-grey-7 q-mb-lg max-w-sm">
      {{ description }}
    </div>

    <!-- Action Buttons -->
    <div class="row q-gutter-sm items-center justify-center">
      <q-btn
        v-if="actionLabel"
        unelevated
        no-caps
        :color="actionColor"
        :icon="actionIcon"
        :label="actionLabel"
        @click="$emit('action')"
      />
      <q-btn
        v-if="secondaryActionLabel"
        outline
        no-caps
        color="grey-8"
        :icon="secondaryActionIcon"
        :label="secondaryActionLabel"
        @click="$emit('secondary-action')"
      />
    </div>

    <!-- Optional Slot for extra content (e.g. tips) -->
    <slot name="extra" />
  </div>
</template>

<script>
export default {
  name: "EmptyState",
  props: {
    icon: {
      type: String,
      default: "inbox"
    },
    iconColor: {
      type: String,
      default: "primary"
    },
    iconSize: {
      type: String,
      default: "44px"
    },
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      default: ""
    },
    actionLabel: {
      type: String,
      default: ""
    },
    actionIcon: {
      type: String,
      default: ""
    },
    actionColor: {
      type: String,
      default: "primary"
    },
    secondaryActionLabel: {
      type: String,
      default: ""
    },
    secondaryActionIcon: {
      type: String,
      default: ""
    }
  },
  emits: ["action", "secondary-action"]
};
</script>

<style scoped>
.empty-state-card {
  min-height: 240px;
}
.icon-wrapper {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(70, 130, 180, 0.12) 0%, rgba(38, 166, 154, 0.1) 100%);
  border: 1px solid rgba(70, 130, 180, 0.15);
}
.max-w-sm {
  max-width: 420px;
  line-height: 1.5;
}
</style>
