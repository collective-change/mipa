<template>
  <div class="skeleton-container full-width">
    <!-- Card Variant -->
    <div v-if="type === 'card'" class="q-gutter-y-md">
      <q-card
        v-for="i in count"
        :key="i"
        flat
        bordered
        class="bg-white q-pa-md subtle-border"
      >
        <div class="row items-center justify-between q-mb-sm">
          <q-skeleton type="rect" width="35%" height="24px" class="rounded-borders" />
          <q-skeleton type="QChip" width="80px" />
        </div>
        <q-skeleton type="text" width="85%" class="q-mb-xs" />
        <q-skeleton type="text" width="60%" class="q-mb-md" />
        <div class="row items-center justify-between">
          <div class="row q-gutter-xs">
            <q-skeleton type="QBtn" width="70px" />
            <q-skeleton type="QBtn" width="70px" />
          </div>
          <q-skeleton type="text" width="20%" />
        </div>
      </q-card>
    </div>

    <!-- Table Variant -->
    <div v-else-if="type === 'table'" class="bg-white q-pa-md rounded-borders subtle-border">
      <div class="row items-center justify-between q-mb-md">
        <q-skeleton type="rect" width="200px" height="28px" class="rounded-borders" />
        <q-skeleton type="rect" width="120px" height="32px" class="rounded-borders" />
      </div>
      <div class="q-gutter-y-sm">
        <div class="row q-col-gutter-sm q-py-xs bg-grey-2 rounded-borders">
          <div class="col-3"><q-skeleton type="text" width="60%" /></div>
          <div class="col-3"><q-skeleton type="text" width="50%" /></div>
          <div class="col-3"><q-skeleton type="text" width="40%" /></div>
          <div class="col-3"><q-skeleton type="text" width="50%" /></div>
        </div>
        <div
          v-for="i in count"
          :key="i"
          class="row q-col-gutter-sm q-py-sm border-bottom items-center"
        >
          <div class="col-3"><q-skeleton type="rect" height="18px" width="80%" /></div>
          <div class="col-3"><q-skeleton type="rect" height="18px" width="65%" /></div>
          <div class="col-3"><q-skeleton type="rect" height="18px" width="55%" /></div>
          <div class="col-3"><q-skeleton type="rect" height="18px" width="70%" /></div>
        </div>
      </div>
    </div>

    <!-- Graph Variant -->
    <div v-else-if="type === 'graph'" class="full-width full-height relative-position bg-grey-1 rounded-borders subtle-border q-pa-xl flex flex-center">
      <div class="column items-center q-gutter-y-md">
        <div class="row q-gutter-lg items-center">
          <q-skeleton type="QAvatar" size="64px" />
          <q-skeleton type="rect" width="120px" height="4px" />
          <q-skeleton type="QAvatar" size="80px" />
          <q-skeleton type="rect" width="100px" height="4px" />
          <q-skeleton type="QAvatar" size="64px" />
        </div>
        <div class="row q-gutter-xl items-center q-mt-md">
          <q-skeleton type="QAvatar" size="72px" />
          <q-skeleton type="QAvatar" size="56px" />
          <q-skeleton type="QAvatar" size="72px" />
        </div>
        <q-skeleton type="text" width="180px" class="q-mt-md" />
      </div>
    </div>

    <!-- Detail Variant -->
    <div v-else class="bg-white q-pa-md rounded-borders subtle-border q-gutter-y-sm">
      <q-skeleton type="rect" width="70%" height="32px" class="rounded-borders q-mb-sm" />
      <div class="row q-col-gutter-sm">
        <div class="col-6"><q-skeleton type="rect" height="40px" /></div>
        <div class="col-6"><q-skeleton type="rect" height="40px" /></div>
      </div>
      <q-skeleton type="rect" height="120px" class="q-my-sm" />
      <q-skeleton type="rect" height="44px" />
      <q-skeleton type="rect" height="44px" />
    </div>
  </div>
</template>

<script>
export default {
  name: "SkeletonLoader",
  props: {
    type: {
      type: String,
      default: "card",
      validator: (v) => ["card", "table", "graph", "detail"].includes(v)
    },
    count: {
      type: Number,
      default: 3
    }
  }
};
</script>

<style scoped>
.skeleton-container {
  min-height: 120px;
}
.border-bottom {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
</style>
