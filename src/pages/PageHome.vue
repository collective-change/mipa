<template>
  <q-page>
    <div class="q-pa-md absolute full-width full-height column">
      <template v-if="orgsDownloaded">
        <div class="text-h6">Organizations</div>
        <orgs :orgs="orgs" />
      </template>
      <template v-else>
        <span class="absolute-center">
          <q-spinner color="primary" size="3em" />
        </span>
      </template>
    </div>
  </q-page>
</template>

<script>
import { mapGetters, mapState } from "vuex";

export default {
  data() {
    return {
      showAddTask: false
    };
  },
  computed: {
    ...mapGetters("settings", ["settings"]),
    ...mapState("orgs", ["orgs", "orgsDownloaded"])
  },
  mounted() {
    this.$root.$on("showAddTask", () => {
      this.showAddTask = true;
    });
  },
  beforeDestroy() {
    console.log("PageHome.vue beforeDestroy; we should detach listeners here.");
    //this.$store.dispatch("detachListener");
  },
  components: {
    // "no-tasks": require("components/Tasks/NoTasks.vue").default,
    // "tasks-todo": require("components/Tasks/TasksTodo.vue").default,
    // "tasks-completed": require("components/Tasks/TasksCompleted.vue").default,
    // "add-task": require("components/Tasks/Modals/AddTask.vue").default,
    // search: require("components/Tasks/Tools/Search.vue").default,
    // sort: require("components/Tasks/Tools/Sort.vue").default
    orgs: require("components/Orgs/Orgs.vue").default
  }
};
</script>

<style lang="scss">
.q-scroll-area-tasks {
  display: flex;
  flex-grow: 1;
}
.electron {
  .q-scroll-area-tasks {
    .scroll {
      height: auto !important;
    }
  }
}
</style>