<template>
  <q-item
    @click="updateTask({id: id, updates: { completed: !task.completed} })"
    clickable
    v-touch-hold:1000.mouse="showEditTaskModal"
    :class="!task.completed ? 'bg-orange-1' : 'bg-green-1'"
    v-ripple
  >
    <q-item-section side top>
      <q-checkbox :value="task.completed" class="no-pointer-events" />
    </q-item-section>

    <q-item-section>
      <q-item-label
        :class="{ 'text-strikethrough' : task.completed}"
        v-html="$options.filters.searchHighlight(task.name, search)"
      ></q-item-label>
    </q-item-section>

    <q-item-section v-if="task.dueDate" side>
      <div class="row">
        <div class="column justify-center">
          <q-icon name="event" size="18px" class="q-mr-xs" />
        </div>
        <div class="column">
          <q-item-label class="row justify-end" caption>{{ task.dueDate | niceDate }}</q-item-label>
          <q-item-label class="row justify-end" caption>
            <small>{{ taskDueTime }}</small>
          </q-item-label>
        </div>
      </div>
    </q-item-section>

    <q-item-section side>
      <div class="row">
        <q-btn @click.stop="showEditTaskModal" flat round dense color="primary" icon="edit" />
        <q-btn @click.stop="promptToDelete(id)" flat round dense color="red" icon="delete" />
      </div>
    </q-item-section>

    <q-dialog v-model="showEditTask">
      <edit-task @close="showEditTask=false" :task="task" :id="id" />
    </q-dialog>
  </q-item>
</template>

<script>
import { mapState, mapActions, mapGetters } from "vuex";
import { date } from "quasar";
import { log } from "util";
const { formatDate } = date;

export default {
  props: ["task", "id"],
  data() {
    return {
      showEditTask: false
    };
  },
  computed: {
    ...mapState("tasks", ["search"]),
    ...mapGetters("settings", ["settings"]),
    taskDueTime() {
      if (this.settings.show12HourTimeFormat) {
        return date.formatDate(
          this.task.dueDate + " " + this.task.dueTime,
          "h:mm aa"
        );
      }
      return this.task.dueTime;
    }
  },
  methods: {
    ...mapActions("tasks", ["updateTask", "deleteTask"]),
    showEditTaskModal() {
      this.showEditTask = true;
    },
    promptToDelete(id) {
      this.$q
        .dialog({
          title: "Confirm",
          message: "Really delete?",
          cancel: true,
          persistent: true
        })
        .onOk(() => {
          this.deleteTask(id);
        });
    }
  },
  filters: {
    niceDate(value) {
      return date.formatDate(value, "MMM D");
    },
    searchHighlight(value, search) {
      if (search) {
        let searchRegExp = new RegExp(search, "ig");
        return value.replace(searchRegExp, match => {
          return '<span class="bg-yellow-6">' + match + "</span>";
        });
      }
      return value;
    }
  },
  components: {
    "edit-task": require("components/Tasks/Modals/EditTask.vue").default
  }
};
</script>

<style>
</style>
