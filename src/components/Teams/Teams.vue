<template>
  <transition
    appear
    enter-active-class="animated zoomIn"
    leave-active-class="animated zoomOut absolute-top"
  >
    <div class="q-pa-md row items-start q-gutter-md">
      <teamCard v-for="team in teams" :key="team.id" :team="team" :id="team.id"></teamCard>
    </div>
  </transition>
</template>

<script>
import { mapGetters } from "vuex";

export default {
  props: ["teams"],
  computed: {
    ...mapGetters("settings", ["settings"])
  },
  components: {
    teamCard: require("components/Teams/TeamCard.vue").default
  }
};
</script>