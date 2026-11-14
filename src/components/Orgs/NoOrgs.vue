<template>
  <q-card flat bordered class="no-orgs q-pa-lg text-center">
    <q-icon name="groups" color="primary" size="64px" />
    <div class="text-h6 q-mt-md">{{ $t("noOrgsTitle") }}</div>
    <p class="text-body1 text-grey-8 q-mt-sm">{{ $t("noOrgsText") }}</p>
    <q-btn
      @click="$emit('add-org')"
      color="primary"
      icon="add"
      :label="$t('Add organization')"
      unelevated
      no-caps
      size="md"
    />
    <q-separator class="q-my-lg" />
    <p class="text-body2 text-grey-8">{{ $t("sampleTryHint") }}</p>
    <q-btn
      @click="$emit('try-sample')"
      color="primary"
      icon="explore"
      :label="creatingSample ? $t('sampleCreating') : $t('sampleTry')"
      :loading="creatingSample"
      outline
      no-caps
    />
  </q-card>
</template>

<script>
export default {
  props: { creatingSample: Boolean },
  emits: ["add-org", "try-sample"]
};
</script>

<style scoped>
.no-orgs {
  max-width: 560px;
  margin: 48px auto 0;
}
</style>
