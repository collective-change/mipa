<template>
  <q-card v-ripple class="team-card">
    <q-card-section
      clickable
      to="/settings"
      v-ripple
      v-touch-hold:1000.mouse="showEditTeamModal"
      class="bg-primary text-white text-h4"
    >
      <div class="text-h5">{{team.name}}</div>
      <div class="text-h4">{{team.goal}}</div>
    </q-card-section>

    <q-separator />

    <q-card-actions align="right">
      <div class="row">
        <q-btn to="/model/model" flat round dense icon="people">
          <q-tooltip>Team</q-tooltip>
        </q-btn>
        <q-btn
          :to="`/team/${team.nameSlug}/model/${id}`"
          flat
          round
          dense
          icon="share"
          class="flip-horizontal"
        >
          <q-tooltip>Model</q-tooltip>
        </q-btn>
        <q-btn to="/model/model" flat round dense icon="wb_incandescent" class="flip-vertical">
          <q-tooltip>Ideate</q-tooltip>
        </q-btn>
        <q-btn to="/model/model" flat round dense icon="poll">
          <q-tooltip>Prioritize</q-tooltip>
        </q-btn>
        <q-btn to="/model/model" flat round dense icon="whatshot">
          <q-tooltip>Achieve</q-tooltip>
        </q-btn>
        <q-btn @click.stop="showEditTeamModal" flat round dense color="primary" icon="edit" />
        <q-btn @click.stop="promptToDelete(id)" flat round dense color="red-4" icon="delete" />
      </div>
    </q-card-actions>

    <q-dialog v-model="showEditTeam">
      <edit-team @close="showEditTeam=false" :team="team" :id="id" />
    </q-dialog>
  </q-card>
</template>

<script>
import { mapState, mapActions, mapGetters } from "vuex";

export default {
  props: ["team", "id"],
  data() {
    return {
      showEditTeam: false
    };
  },
  computed: {
    ...mapGetters("settings", ["settings"])
  },
  methods: {
    ...mapActions("teams", ["updateTeam", "deleteTeam"]),
    showEditTeamModal() {
      this.showEditTeam = true;
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
          this.deleteTeam(id);
        });
    }
  },
  components: {
    "edit-team": require("components/Teams/Modals/EditTeam.vue").default
  }
};
</script>

<style lang="stylus" scoped>
.team-card {
  width: 100%;
  max-width: 250px;
}

.q-btn {
  color: $grey-8;
}
</style>
