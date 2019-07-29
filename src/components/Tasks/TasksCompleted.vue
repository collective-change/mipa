<template>
  <transition appear enter-active-class="animated zoomIn" leave-active-class="animated zoomOut">
    <div :class="{'q-mt-lg' : !settings.showTasksInOneList}">
      <list-header v-if="!settings.showTasksInOneList" bg_color="bg-green-4">Completed</list-header>
      <q-list separator bordered>
        <task v-for="(task, key) in tasksCompleted" :key="key" :task="task" :id="key"></task>
      </q-list>
    </div>
  </transition>
</template>

<script>
import { mapGetters } from "vuex";

export default {
  props: ["tasksCompleted"],
  computed: {
    ...mapGetters("settings", ["settings"])
  },
  components: {
    "list-header": require("components/Shared/ListHeader.vue").default,
    task: require("components/Tasks/Task.vue").default
  }
};
</script>