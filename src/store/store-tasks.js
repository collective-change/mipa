import Vue from "vue";
import { uid, Notify } from "quasar";
import { firebaseDb, firebaseAuth } from "boot/firebase";
import { showErrorMessage } from "src/functions/function-show-error-message";

const state = {
  tasks: {
    // ID1: {
    //   name: "Go to shop",
    //   completed: false,
    //   dueDate: "2019/05/12",
    //   dueTime: "18:30"
    // },
    // ID2: {
    //   name: "Get bananas",
    //   completed: false,
    //   dueDate: "2019/05/13",
    //   dueTime: "14:00"
    // },
    // ID3: {
    //   name: "Get apples",
    //   completed: false,
    //   dueDate: "2019/05/14",
    //   dueTime: "16:00"
    // }
  },
  search: "",
  sort: "name",
  tasksDownloaded: false
};

const mutations = {
  //synchronous
  updateTask(state, payload) {
    Object.assign(state.tasks[payload.id], payload.updates);
  },
  deleteTask(state, id) {
    Vue.delete(state.tasks, id);
  },
  addTask(state, payload) {
    Vue.set(state.tasks, payload.id, payload.task);
  },
  clearTasks(state) {
    state.tasks = {};
  },
  setSearch(state, value) {
    state.search = value;
  },
  setSort(state, value) {
    state.sort = value;
  },
  setTasksDownloaded(state, value) {
    state.tasksDownloaded = value;
  }
};

const actions = {
  //may be asynchronous or synchronous
  updateTask({ dispatch }, payload) {
    dispatch("fbUpdateTask", payload);
  },
  deleteTask({ dispatch }, id) {
    dispatch("fbDeleteTask", id);
  },
  addTask({ dispatch }, task) {
    let taskID = uid();
    let payload = {
      id: taskID,
      task: task
    };
    dispatch("fbAddTask", payload);
  },
  setSearch({ commit }, value) {
    commit("setSearch", value);
  },
  setSort({ commit }, value) {
    commit("setSort", value);
  },
  detachListener() {},
  fbReadData({ commit }) {
    let userId = firebaseAuth.currentUser.uid;
    //userId = "AOoVZSkgp2WYae35UPLb8zqsL7A3";
    let userTasks = firebaseDb
      .collection("tasks")
      .doc(userId)
      .collection("oneUsersTasks");

    // initial check for data
    userTasks
      .get()
      .then(function(docs) {
        commit("setTasksDownloaded", true);
      })
      .catch(function(error) {
        showErrorMessage("Error retrieving tasks", error.message);
        this.$router.replace("/auth");
      });

    this.detachUserTasksListener = userTasks.onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === "added") {
          //console.log("New task: ", change.doc.data());
          let payload = {
            id: change.doc.id,
            task: change.doc.data()
          };
          commit("addTask", payload);
        }
        if (change.type === "modified") {
          //console.log("Modified task: ", change.doc.data());
          let payload = {
            id: change.doc.id,
            updates: change.doc.data()
          };
          commit("updateTask", payload);
        }
        if (change.type === "removed") {
          commit("deleteTask", change.doc.id);
        }
      });
    });
  },
  fbAddTask({}, payload) {
    let userId = firebaseAuth.currentUser.uid;
    let tasksRef = firebaseDb
      .collection("tasks")
      .doc(userId)
      .collection("oneUsersTasks");
    tasksRef
      .doc(payload.id)
      .set(payload.task)
      .then(function() {
        Notify.create("Task added!");
      })
      .catch(function(error) {
        showErrorMessage("Error adding task", error.message);
      });
  },
  fbUpdateTask({}, payload) {
    let userId = firebaseAuth.currentUser.uid;
    let tasksRef = firebaseDb
      .collection("tasks")
      .doc(userId)
      .collection("oneUsersTasks");
    tasksRef
      .doc(payload.id)
      .set(payload.updates, { merge: true })
      .then(function() {
        let keys = Object.keys(payload.updates);
        //console.log("keys: ", keys);
        if (!(keys.includes("completed") && keys.length == 1))
          Notify.create("Task updated!");
      })
      .catch(function(error) {
        showErrorMessage("Error updating task", error.message);
      });
  },
  fbDeleteTask({}, taskId) {
    let userId = firebaseAuth.currentUser.uid;
    let tasksRef = firebaseDb
      .collection("tasks")
      .doc(userId)
      .collection("oneUsersTasks");
    tasksRef
      .doc(taskId)
      .delete()
      .then(function() {
        Notify.create("Task deleted!");
      })
      .catch(function(error) {
        showErrorMessage("Error removing task", error.message);
      });
  }
};

const getters = {
  tasksSorted: state => {
    let tasksSorted = {},
      keysOrdered = Object.keys(state.tasks);

    keysOrdered.sort((a, b) => {
      let taskAProp = state.tasks[a][state.sort].toLowerCase(),
        taskBProp = state.tasks[b][state.sort].toLowerCase();
      if (taskAProp > taskBProp) return 1;
      else if (taskAProp < taskBProp) return -1;
      else return 0;
    });

    keysOrdered.forEach(key => {
      tasksSorted[key] = state.tasks[key];
    });

    return tasksSorted;
  },
  tasksFiltered: (state, getters) => {
    let tasksSorted = getters.tasksSorted,
      tasksFiltered = {};
    if (state.search) {
      //populate empty object
      Object.keys(tasksSorted).forEach(function(key) {
        let task = tasksSorted[key],
          taskNameLowerCase = task.name.toLowerCase(),
          searchLowerCase = state.search.toLowerCase();
        if (taskNameLowerCase.includes(searchLowerCase)) {
          tasksFiltered[key] = task;
        }
      });
      return tasksFiltered;
    }
    return tasksSorted;
  },
  tasksTodo: (state, getters) => {
    let tasksFiltered = getters.tasksFiltered;
    let tasks = {};
    Object.keys(tasksFiltered).forEach(function(key) {
      let task = tasksFiltered[key];
      if (!task.completed) {
        tasks[key] = task;
      }
    });
    return tasks;
  },
  tasksCompleted: (state, getters) => {
    let tasksFiltered = getters.tasksFiltered;
    let tasks = {};
    Object.keys(tasksFiltered).forEach(function(key) {
      let task = tasksFiltered[key];
      if (task.completed) {
        tasks[key] = task;
      }
    });
    return tasks;
  }
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
