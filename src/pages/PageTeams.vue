<template>
  <q-page>
    <div class="q-pa-md absolute full-width full-height column">
      <template v-if="teams!=null">
        <div class="text-h6">Teams</div>
        <no-teams v-if="!Object.keys(teams).length" />
        <teams :teams="teams" />
        <div class="absolute-bottom text-center q-mb-lg no-pointer-events">
          <q-btn
            @click="showAddTeam = true"
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
    <q-dialog v-model="showAddTeam">
      <add-team @close="showAddTeam=false" />
    </q-dialog>
  </q-page>
</template>

<script>
import { mapGetters, mapState, mapActions } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";

export default {
  data() {
    return {
      showAddTeam: false
    };
  },

  computed: {
    ...mapGetters("settings", ["settings"]),
    ...mapState("teams", ["teams", "teamsDownloaded"])
  },

  actions: {
    //...mapActions("teams", ["fbReadData", "detachUserTeamsListenerAction"])
  },

  created() {
    (async () => {
      //console.log("waiting for currentUser to be defined");
      while (
        !firebaseAuth.currentUser // define the condition as you like
      )
        await new Promise(resolve => setTimeout(resolve, 200));
      this.$store.dispatch("teams/bindTeams");
    })();
    //console.log("above code doesn't block main function stack");
  },

  mounted() {
    //console.log(firebaseAuth.currentUser.uid);
    this.$root.$on("showAddTeam", () => {
      this.showAddTeam = true;
    });
  },

  beforeDestroy() {
    this.$store.dispatch("teams/unbindTeams");
  },

  components: {
    "no-teams": require("components/Teams/NoTeams.vue").default,
    teams: require("components/Teams/Teams.vue").default,
    "add-team": require("components/Teams/Modals/AddTeam.vue").default
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