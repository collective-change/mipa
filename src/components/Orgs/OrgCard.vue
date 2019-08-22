<template>
  <q-card v-ripple class="org-card">
    <q-card-section
      clickable
      to="/settings"
      v-ripple
      v-touch-hold:1000.mouse="showEditOrgModal"
      class="bg-primary text-white text-h4"
    >
      <div class="text-h5">{{org.name}}</div>
      <div class="text-h4">{{org.goal}}</div>
    </q-card-section>

    <q-separator />

    <q-card-actions align="right">
      <div class="row">
        <q-btn to="/model/model" flat round dense icon="people">
          <q-tooltip>Team</q-tooltip>
        </q-btn>
        <q-btn
          :to="`/team/${org.nameSlug}/model/${id}`"
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
        <q-btn @click.stop="showEditOrgModal" flat round dense color="primary" icon="edit" />
        <q-btn @click.stop="promptToDelete(id)" flat round dense color="red-4" icon="delete" />
      </div>
    </q-card-actions>

    <q-dialog v-model="showEditOrg">
      <edit-org @close="showEditOrg=false" :org="org" :id="id" />
    </q-dialog>
  </q-card>
</template>

<script>
import { mapState, mapActions, mapGetters } from "vuex";

export default {
  props: ["org", "id"],
  data() {
    return {
      showEditOrg: false
    };
  },
  computed: {
    ...mapGetters("settings", ["settings"])
  },
  methods: {
    ...mapActions("orgs", ["updateOrg", "deleteOrg"]),
    showEditOrgModal() {
      this.showEditOrg = true;
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
          this.deleteOrg(id);
        });
    }
  },
  components: {
    //"edit-task": require("components/Tasks/Modals/EditTask.vue").default
  }
};
</script>

<style lang="stylus" scoped>
.org-card {
  width: 100%;
  max-width: 250px;
}

.q-btn {
  color: $grey-8;
}
</style>