<template>
  <transition
    appear
    enter-active-class="animated zoomIn"
    leave-active-class="animated zoomOut absolute-top"
  >
    <div>
      <list-header v-if="!settings.showTasksInOneList" bg_color="bg-orange-4">Todo</list-header>
      <q-list separator bordered>
        <task v-for="(task, key) in tasksTodo" :key="key" :task="task" :id="key"></task>
      </q-list>
    </div>
  </transition>
</template>

<script>
import { mapGetters } from "vuex";

export default {
  props: ["tasksTodo"],
  computed: {
    ...mapGetters("settings", ["settings"]),
  },
  components: {
    "list-header": require("components/Shared/ListHeader.vue").default,
    task: require("components/Tasks/Task.vue").default,
  },
};
</script>