<template>
  <transition
    appear
    enter-active-class="animated zoomIn"
    leave-active-class="animated zoomOut absolute-top"
  >
    <div class="q-pa-md row items-start q-gutter-md">
      <orgCard v-for="(org, key) in orgs" :key="key" :org="org" :id="key"></orgCard>
    </div>
  </transition>
</template>

<script>
import { mapGetters } from "vuex";

export default {
  props: ["orgs"],
  computed: {
    ...mapGetters("settings", ["settings"])
  },
  components: {
    orgCard: require("components/Orgs/OrgCard.vue").default
  }
};
</script>