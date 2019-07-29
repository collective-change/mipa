<template>
  <q-page>
    <div class="q-pa-md absolute full-width full-height column">
      <template v-if="tasksDownloaded">
        <div class="row q-mb-lg">
          <search />
          <sort />
        </div>
        <p
          v-if="search && !Object.keys(tasksTodo).length && !Object.keys(tasksCompleted).length"
        >No search results</p>

        <q-scroll-area class="q-scroll-area-tasks">
          <no-tasks
            v-if="!Object.keys(tasksTodo).length  && !search && !settings.showTasksInOneList"
          />

          <tasks-todo v-if="Object.keys(tasksTodo).length" :tasksTodo="tasksTodo" />

          <tasks-completed
            v-if="Object.keys(tasksCompleted).length"
            :tasksCompleted="tasksCompleted"
            class="q-mb-xl"
          />
        </q-scroll-area>

        <div class="absolute-bottom text-center q-mb-lg no-pointer-events">
          <q-btn
            @click="showAddTask = true"
            round
            class="all-pointer-events"
            color="primary"
            size="24px"
            icon="add"
          />
        </div>
      </template>
      <template v-else>
        <span class="absolute-center">
          <q-spinner color="primary" size="3em" />
        </span>
      </template>
    </div>

    <q-dialog v-model="showAddTask">
      <add-task @close="showAddTask=false" />
    </q-dialog>
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
    ...mapGetters("tasks", ["tasksTodo", "tasksCompleted"]),
    ...mapGetters("settings", ["settings"]),
    ...mapState("tasks", ["search", "tasksDownloaded"])
  },
  mounted() {
    this.$root.$on("showAddTask", () => {
      this.showAddTask = true;
    });
  },
  beforeDestroy() {
    console.log("PageTodo.vue beforeDestroy; we should detach listeners here.");
    //this.$store.dispatch("detachListener");
  },
  components: {
    "no-tasks": require("components/Tasks/NoTasks.vue").default,
    "tasks-todo": require("components/Tasks/TasksTodo.vue").default,
    "tasks-completed": require("components/Tasks/TasksCompleted.vue").default,
    "add-task": require("components/Tasks/Modals/AddTask.vue").default,
    search: require("components/Tasks/Tools/Search.vue").default,
    sort: require("components/Tasks/Tools/Sort.vue").default
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