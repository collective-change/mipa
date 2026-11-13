<template>
  <transition
    appear
    enter-active-class="animated zoomIn"
    leave-active-class="animated zoomOut absolute-top"
  >
    <div class="row items-stretch q-col-gutter-md">
      <div
        v-for="(org, key) in orgs"
        :key="key"
        class="col-12 col-sm-6 col-md-4 col-lg-3"
      >
        <orgCard :org="org" :id="org.id" />
      </div>
    </div>
  </transition>
</template>

<script>
import { mapGetters } from "vuex";
import OrgCard from "@/components/Orgs/OrgCard.vue";

export default {
  props: ["orgs"],
  computed: {
    ...mapGetters("settings", ["settings"]),
  },
  components: {
    orgCard: OrgCard,
  },
};
</script>